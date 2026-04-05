// js/topology.js — grid resolution, bay ordering, disk info formatting, status classification

import { GEOMETRY_DEFAULTS, CHASSIS_BAY_PRESETS } from '../geometry.js';
import { clampInt } from './utils.js';

export function normalizeTopologyKey(topologyKey, pciRaw) {
    if (!topologyKey) return pciRaw;
    if (topologyKey.includes('-')) {
        const parts = topologyKey.split('-');
        if (parts.length >= 4) {
            const pci = `${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]}`;
            const suffix = parts.length > 4 ? `-${parts.slice(4).join('-')}` : '';
            return `${pci}${suffix}`;
        }
    }
    return pciRaw || topologyKey;
}

export function normalizeLayout(value) {
    return String(value || '').toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
}

export function normalizeFillOrder(rawValue, legacyValue) {
    const value = String(rawValue || '').toLowerCase();
    if (value === 'column_major_ttb' || value === 'ttb' || value === 'top_to_bottom') return 'column_major_ttb';
    if (value === 'row_major_ltr' || value === 'ltr' || value === 'left_to_right') return 'row_major_ltr';
    const legacy = String(legacyValue || '').toLowerCase();
    if (legacy === 'vertical') return 'column_major_ttb';
    return 'row_major_ltr';
}

export function statusClassForDisk(disk) {
    if (!disk || disk.status !== 'PRESENT') return '';
    const state = String(disk.state || '');
    const isAllocated = Boolean(disk.pool_name && disk.pool_name !== '');
    if (state === 'RESILVERING') return 'resilvering';
    if (isAllocated) {
        if (state === 'OFFLINE')  return 'allocated-offline';
        if (state === 'ONLINE')   return 'allocated-healthy';
        if (state === 'DEGRADED') return 'error';
        if (state === 'FAULTED' || state === 'UNAVAIL' || state === 'REMOVED') return 'faulted';
    } else {
        if (state === 'ONLINE' || state === 'UNALLOCATED') return 'unallocated';
        if (state === 'DEGRADED') return 'unalloc-error';
        if (state === 'FAULTED' || state === 'UNAVAIL' || state === 'REMOVED') return 'unalloc-fault';
    }
    return '';
}

export function formatDiskInfo(disk, unit = 'C') {
    if (!disk || disk.status === 'EMPTY') {
        return { serial: '-', size: '-', pool: '\u00A0', index: '\u00A0', temperature: '\u00A0' };
    }
    const serialRaw = String(disk.sn || disk.serial || disk.serial_short || disk.dev_name || 'present');
    const serial = serialRaw.length > 3 ? serialRaw.slice(-3) : serialRaw;
    const sizeBytes = Number(disk.size_bytes || 0);
    const size = sizeBytes > 0 ? `${(sizeBytes / (1024 ** 4)).toFixed(2)} TB` : '-';
    const poolName = String(disk.pool_name ?? '').trim();
    const rawIndex = String(disk.pool_idx ?? '').trim();
    const normalizedIndex = rawIndex.replace(/^#/, '');
    const rawTemp = disk.temperature_c;
    const hasTemp = rawTemp !== null && rawTemp !== undefined && String(rawTemp).trim() !== '';
    const tempC = hasTemp ? Number(rawTemp) : NaN;
    let temperature = '\u00A0';
    if (Number.isFinite(tempC)) {
        temperature = String(unit).toUpperCase() === 'F'
            ? `${Math.round((tempC * 9) / 5 + 32)}\u00B0F`
            : `${Math.round(tempC)}\u00B0C`;
    }
    return {
        serial,
        size,
        pool: poolName || '\u00A0',
        index: normalizedIndex ? `#${normalizedIndex}` : '\u00A0',
        temperature
    };
}

export function getTemperatureSeverityClass(disk) {
    const rawTemp = disk?.temperature_c;
    if (rawTemp === null || rawTemp === undefined || String(rawTemp).trim() === '') return '';
    const tempC = Number(rawTemp);
    if (!Number.isFinite(tempC)) return '';
    if (tempC > 60) return 'temp-hot';
    if (tempC > 40) return 'temp-warn';
    return 'temp-normal';
}

export function buildOrderIndices(totalSlots, cols, rows, fillOrder) {
    const indices = [];
    if (fillOrder === 'column_major_ttb') {
        for (let col = 0; col < cols; col++) {
            for (let row = 0; row < rows; row++) {
                const index = row * cols + col;
                if (index < totalSlots) indices.push(index);
            }
        }
        return indices;
    }
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const index = row * cols + col;
            if (index < totalSlots) indices.push(index);
        }
    }
    return indices;
}

export function resolveGrid(chassisData, bayConfig) {
    const settings = chassisData?.settings || {};
    const maxBays = clampInt(settings.max_bays || 0, 1, 1, 999);
    const incomingDisks = Array.isArray(chassisData?.disks) ? chassisData.disks : [];
    const layout = normalizeLayout(bayConfig.layout);
    const totalBays = Math.max(maxBays, incomingDisks.length, 1);
    const rackUnits = clampInt(settings.rack_units || 2, 2, 1, 12);
    const presetKey = `${rackUnits}u_${layout}`;
    const preset = CHASSIS_BAY_PRESETS[presetKey] || null;

    const defaultCols = clampInt(
        preset?.cols ?? settings.cols ?? settings.bays_per_row,
        layout === 'horizontal' ? Math.max(1, Math.min(4, totalBays)) : totalBays,
        1, 64
    );
    const defaultRows = clampInt(
        preset?.rows ?? settings.rows,
        Math.ceil(totalBays / defaultCols),
        1, 64
    );
    const configuredCols = layout === 'horizontal' ? (bayConfig.grid_cols ?? bayConfig.bays_per_row) : undefined;
    const configuredRows = layout === 'horizontal' ? bayConfig.grid_rows : undefined;
    let cols = clampInt(configuredCols, defaultCols, 1, 64);
    let rows = clampInt(configuredRows, defaultRows, 1, 64);
    const targetSlots = Math.max(totalBays, cols * rows);
    if (cols * rows < targetSlots) rows = Math.ceil(targetSlots / cols);

    return { maxBays, layout, cols, rows, targetSlots: Math.max(targetSlots, 1) };
}

export function buildEnclosureModel(topologyKey, chassisData, data, layoutContext = {}) {
    const VERTICAL_SHORT_SIDE_ASPECT_COMP = 1.14;
    const settings = chassisData?.settings || {};
    const pciRaw = settings.pci_raw || topologyKey;
    const key = normalizeTopologyKey(topologyKey, pciRaw);
    const deviceConfig = data?.config?.devices?.[key] || data?.config?.devices?.[pciRaw] || {};
    const bayConfig = deviceConfig.bay || {};
    const chassisConfig = deviceConfig.chassis || {};
    const grid = resolveGrid(chassisData, bayConfig);
    const fillOrder = normalizeFillOrder(bayConfig.fill_order, bayConfig.drive_sequence);
    const orderIndices = buildOrderIndices(grid.targetSlots, grid.cols, grid.rows, fillOrder);
    const uiLayout = data?.config?.ui?.layout || {};
    const bayGapDefault = clampInt(uiLayout.bay_gap_px, GEOMETRY_DEFAULTS.BAY_GAP_PX, 1, 64);
    const bayGap = clampInt(bayConfig.gap_px, bayGapDefault, 1, 64);
    const chassisUnits = clampInt(chassisConfig.rack_units || 2, 2, 1, 12);
    const configuredWidthPx = clampInt(chassisConfig.width_px, 620, 320, 2600);
    const viewportWidthPx = clampInt(layoutContext.preferredWidthPx, configuredWidthPx, 320, 2600);
    const nineteenInMaxPx = clampInt(layoutContext.nineteenInMaxPx, 620, 320, 2600);
    const chassisWidthPx = Math.min(viewportWidthPx, nineteenInMaxPx);

    const rackWidthIn = Number(uiLayout.rack_width_in);
    const uHeightIn = Number(uiLayout.u_height_in);
    const safeRackWidthIn = Number.isFinite(rackWidthIn) && rackWidthIn > 0 ? rackWidthIn : GEOMETRY_DEFAULTS.RACK_WIDTH_MM / 25.4;
    const safeUHeightIn = Number.isFinite(uHeightIn) && uHeightIn > 0 ? uHeightIn : GEOMETRY_DEFAULTS.RACK_UNIT_HEIGHT_MM / 25.4;
    const ruHeightOverrides = uiLayout?.ru_height_in_overrides;
    const ruOverrideIn = Number(ruHeightOverrides?.[String(chassisUnits)]);
    const chassisHeightIn = Number.isFinite(ruOverrideIn) && ruOverrideIn > 0
        ? ruOverrideIn
        : chassisUnits * safeUHeightIn;

    const bodyHeightPx = Math.max(40, (chassisWidthPx * chassisHeightIn) / safeRackWidthIn);
    const bodyWidthPx = Math.max(120, chassisWidthPx - 32);
    const BODY_PADDING_PX = 5;
    const innerHeightPx = Math.max(1, bodyHeightPx - (2 * BODY_PADDING_PX));
    const shortMm = GEOMETRY_DEFAULTS.HDD_SHORT_MM;
    const longMm = GEOMETRY_DEFAULTS.HDD_LONG_MM;
    const nominalPxPerMm = bodyWidthPx / GEOMETRY_DEFAULTS.RACK_WIDTH_MM;

    let pxPerMm;
    if (grid.layout === 'horizontal') {
        const scaleByWidth  = (bodyWidthPx  - (grid.cols - 1) * bayGap) / (grid.cols * longMm);
        const scaleByHeight = (innerHeightPx - (grid.rows - 1) * bayGap) / (grid.rows * shortMm);
        pxPerMm = Math.max(0.1, Math.min(nominalPxPerMm, scaleByWidth, scaleByHeight) * 1.1);
    } else {
        const scaleByWidth  = (bodyWidthPx  - (grid.cols - 1) * bayGap) / (grid.cols * shortMm);
        const scaleByHeight = (innerHeightPx - (grid.rows - 1) * bayGap) / (grid.rows * longMm);
        pxPerMm = Math.max(0.1, Math.min(nominalPxPerMm, scaleByWidth, scaleByHeight));
    }

    const bayShortSidePx = Math.max(20, shortMm * pxPerMm);
    const bayLongSidePx  = Math.max(24, longMm  * pxPerMm);
    let bayWidthPx  = grid.layout === 'horizontal' ? bayLongSidePx  : bayShortSidePx;
    let bayHeightPx = grid.layout === 'horizontal' ? bayShortSidePx : bayLongSidePx;

    if (grid.layout === 'vertical') {
        // Compensate short-side appearance in vertical orientation without altering long-side length.
        bayWidthPx = Math.max(20, bayWidthPx * VERTICAL_SHORT_SIDE_ASPECT_COMP);
    }

    const gridWidthPx  = (grid.cols * bayWidthPx)  + ((grid.cols - 1) * bayGap);
    const gridHeightPx = (grid.rows * bayHeightPx) + ((grid.rows - 1) * bayGap);
    const widthFitScale  = bodyWidthPx  / Math.max(1, gridWidthPx);
    const heightFitScale = innerHeightPx / Math.max(1, gridHeightPx);
    if (grid.layout === 'horizontal') {
        const finalFitScale = Math.max(0.1, Math.min(1, widthFitScale, heightFitScale));
        if (finalFitScale < 1) {
            bayWidthPx  = Math.max(20, bayWidthPx  * finalFitScale);
            bayHeightPx = Math.max(24, bayHeightPx * finalFitScale);
        }
    } else {
        // For vertical bays, only width should be fit so long-side height remains unchanged.
        if (widthFitScale < 1) {
            bayWidthPx = Math.max(20, bayWidthPx * Math.max(0.1, widthFitScale));
        }
    }

    const contentReference = grid.layout === 'horizontal' ? { width: 100, height: 26 } : { width: 40, height: 100 };
    const bayContentScale = Math.max(0.55, Math.min(1, bayWidthPx / contentReference.width, bayHeightPx / contentReference.height));
    const bayTextCapPx = Math.max(7, Math.min(16, Math.min(bayWidthPx * 0.38, bayHeightPx * 0.42)));
    const bayTextCapSmallPx = Math.max(6, Math.min(14, bayTextCapPx * 0.82));

    const disks = Array.isArray(chassisData?.disks) ? chassisData.disks.slice(0, grid.targetSlots) : [];
    while (disks.length < grid.targetSlots) disks.push({ status: 'EMPTY' });

    const disksByVisualIndex = new Array(grid.targetSlots).fill({ status: 'EMPTY' });
    const latchNumberByVisualIndex = new Array(grid.targetSlots).fill(0);
    orderIndices.forEach((visualIndex, logicalIndex) => {
        disksByVisualIndex[visualIndex] = disks[logicalIndex] || { status: 'EMPTY' };
        latchNumberByVisualIndex[visualIndex] = logicalIndex + 1;
    });

    return {
        topologyKey, key, pciRaw,
        arrayAddress: settings.array_address || settings.array_id || '',
        hasBackplane: Boolean(settings.has_backplane),
        layout: grid.layout, fillOrder,
        cols: grid.cols, rows: grid.rows, targetSlots: grid.targetSlots,
        bayGap, chassisUnits, chassisWidthPx, bodyHeightPx,
        bayShortSidePx, bayLongSidePx, bayWidthPx, bayHeightPx,
        bayContentScale, bayTextCapPx, bayTextCapSmallPx,
        disksByVisualIndex, latchNumberByVisualIndex
    };
}
