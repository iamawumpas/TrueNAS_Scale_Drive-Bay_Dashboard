import { GEOMETRY_DEFAULTS, CHASSIS_BAY_PRESETS } from './geometry.js';

let activityMonitor = null;
const DATA_FETCH_INTERVAL_MS = 200;
const DATA_FETCH_TIMEOUT_MS = 1500;
const DATA_FETCH_RETRY_DELAYS_MS = [150, 500];
const LAST_GOOD_TOPOLOGY_TTL_MS = 60000;

let lastGoodRenderPayload = null;
let lastGoodRenderAt = 0;
let lastAcceptedTopologyCount = 0;
let updateInFlight = false;

function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

async function fetchDataWithRetry() {
    const attempts = [0, ...DATA_FETCH_RETRY_DELAYS_MS];
    let lastError = null;

    for (let index = 0; index < attempts.length; index += 1) {
        if (index > 0) {
            await delay(attempts[index]);
        }
        try {
            return await fetchJsonWithTimeout(`/data?t=${Date.now()}`, DATA_FETCH_TIMEOUT_MS);
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('Failed to fetch /data');
}

function getTopologyEntries(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const topology = payload.topology;
    if (!topology || typeof topology !== 'object') return [];
    return Object.entries(topology);
}

function hasUsableTopology(payload) {
    return getTopologyEntries(payload).length > 0;
}

function hasFreshLastGoodTopology() {
    return Boolean(lastGoodRenderPayload) && (Date.now() - lastGoodRenderAt) < LAST_GOOD_TOPOLOGY_TTL_MS;
}

function isLikelyPartialTopology(payload) {
    if (!lastGoodRenderPayload || !hasFreshLastGoodTopology()) return false;
    const nextCount = getTopologyEntries(payload).length;
    return lastAcceptedTopologyCount > 1 && nextCount > 0 && nextCount < lastAcceptedTopologyCount;
}

function dispatchDashboardDataUpdate(payload) {
    window.dispatchEvent(new CustomEvent('dashboard-data-updated', {
        detail: { data: payload }
    }));
}

function rememberGoodPayload(payload) {
    lastGoodRenderPayload = payload;
    lastGoodRenderAt = Date.now();
    lastAcceptedTopologyCount = getTopologyEntries(payload).length;
    dispatchDashboardDataUpdate(payload);
}

function getRenderablePayload(payload) {
    if (hasUsableTopology(payload) && !isLikelyPartialTopology(payload)) {
        rememberGoodPayload(payload);
        return payload;
    }

    if (hasFreshLastGoodTopology()) {
        return lastGoodRenderPayload;
    }

    return payload;
}

function applyConfigMap(rootStyle, mapping) {
    Object.entries(mapping).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            rootStyle.setProperty(key, String(value));
        }
    });
}

function applyStyleConfig(rootStyle, prefix, configBlock) {
    if (!configBlock || typeof configBlock !== 'object') return;

    const styles = Array.isArray(configBlock.style)
        ? configBlock.style.map(value => String(value).toLowerCase())
        : [];

    applyConfigMap(rootStyle, {
        [`--${prefix}-color`]: configBlock.color,
        [`--${prefix}-font`]: configBlock.font,
        [`--${prefix}-size`]: configBlock.size,
        [`--${prefix}-weight`]: styles.includes('bold') ? '700' : '400',
        [`--${prefix}-style`]: styles.includes('italic') ? 'italic' : 'normal',
        [`--${prefix}-transform`]: styles.includes('allcaps') ? 'uppercase' : 'none',
        [`--${prefix}-variant`]: styles.includes('smallcaps') ? 'small-caps' : 'normal'
    });
}

function mixHex(hex, amount) {
    const value = String(hex || '').trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return value;
    const n = parseInt(value.slice(1), 16);
    let r = (n >> 16) & 0xff;
    let g = (n >> 8) & 0xff;
    let b = n & 0xff;
    if (amount >= 0) {
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
    } else {
        const a = 1 + amount;
        r = Math.round(r * a);
        g = Math.round(g * a);
        b = Math.round(b * a);
    }
    const out = (r << 16) | (g << 8) | b;
    return `#${out.toString(16).padStart(6, '0')}`;
}

function grillSliderScale(v) {
    const c = Math.max(0, Math.min(100, Number(v) || 50));
    const t = (c - 50) / 50;
    return Math.max(0.15, 1 + Math.sign(t) * Math.pow(Math.abs(t), 1.7) * 1.5);
}

function buildGrillImageCss(shape, holeColor, grillPx) {
    switch (shape) {
        case 'solid':
            return { opacity: '0' };
        case 'square': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'triangle': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,8 92,92 8,92" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'hexagonal': {
            const enc = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 93,27.5 93,72.5 50,95 7,72.5 7,27.5" fill="${holeColor}"/></svg>`);
            return { image: `url("data:image/svg+xml,${enc}")` };
        }
        case 'round':
        default: {
            return {
                image: `radial-gradient(circle, ${holeColor} 42%, transparent 45%), radial-gradient(circle, ${holeColor} 42%, transparent 45%)`,
                pos2: `calc(${grillPx}px / 2) calc(${grillPx}px / 2)`
            };
        }
    }
}

const scratchTextureCache = new Map();
const MAX_SCRATCH_CACHE_ENTRIES = 48;

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickScratchAngle() {
    // Random-ish angles with only a light center bias so the surface stays irregular.
    const roll = Math.random();
    if (roll < 0.55) return randomInt(-18, 18);
    if (roll < 0.85) return randomInt(-28, 28);
    return randomInt(-40, 40);
}

function buildRandomScratchTexture(levelRaw, densityRaw, intensityRaw) {
    const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
    const level = clamp(levelRaw);
    const density = clamp(densityRaw);
    const intensity = clamp(intensityRaw);
    const key = `${level}|${density}|${intensity}`;
    if (scratchTextureCache.has(key)) return scratchTextureCache.get(key);

    if (level <= 0) {
        scratchTextureCache.set(key, 'none');
        return 'none';
    }

    const levelUnit = level / 100;
    const densityUnit = density / 100;
    const intensityUnit = intensity / 100;

    // 100% level + high density yields a heavily scratched surface.
    const totalScratchCount = Math.max(1, Math.round(levelUnit * (8 + densityUnit * 32)));

    let deepMin = 0;
    let deepMax = 0;
    if (intensityUnit > 0) {
        if (intensityUnit <= 0.5) {
            const t = intensityUnit / 0.5;
            deepMin = Math.round(t * 1);
            deepMax = Math.max(deepMin, Math.round(t * 2));
        } else {
            const t = (intensityUnit - 0.5) / 0.5;
            deepMin = Math.round(1 + t * 7);
            deepMax = Math.round(2 + t * 8);
        }
    }

    const deepScaleByLevel = Math.max(0, levelUnit);
    deepMin = Math.round(deepMin * deepScaleByLevel);
    deepMax = Math.round(deepMax * deepScaleByLevel);
    const deepCount = Math.min(totalScratchCount, deepMax > 0 ? randomInt(deepMin, Math.max(deepMin, deepMax)) : 0);

    const layers = [];
    const lightAlpha = 0.04 + intensityUnit * 0.08;
    const deepAlpha = 0.14 + intensityUnit * 0.22;
    const clusterCount = Math.max(0, Math.round(totalScratchCount * 0.18));
    const clusterAnchors = Array.from({ length: clusterCount }, () => ({
        start: randomInt(8, 88),
        angle: pickScratchAngle()
    }));

    for (let i = 0; i < totalScratchCount; i += 1) {
        const isDeep = i < deepCount;
        const useCluster = clusterAnchors.length > 0 && Math.random() < 0.55;
        const anchor = useCluster ? clusterAnchors[randomInt(0, clusterAnchors.length - 1)] : null;
        const angle = anchor ? Math.max(-40, Math.min(40, anchor.angle + randomInt(-6, 6))) : pickScratchAngle();
        const start = anchor ? Math.max(3, Math.min(95, anchor.start + randomInt(-7, 7))) : randomInt(3, 95);
        const width = isDeep ? 2 : 1;
        const extraLength = isDeep ? randomInt(0, 2) : randomInt(0, 1);
        const end = Math.min(99, start + width + extraLength);
        const color = isDeep ? `rgba(0,0,0,${deepAlpha.toFixed(3)})` : `rgba(255,255,255,${lightAlpha.toFixed(3)})`;
        layers.push(
            `linear-gradient(${angle}deg, transparent ${start}%, ${color} ${start}%, ${color} ${end}%, transparent ${end}%)`
        );
    }

    const texture = layers.length > 0 ? layers.join(', ') : 'none';
    scratchTextureCache.set(key, texture);
    if (scratchTextureCache.size > MAX_SCRATCH_CACHE_ENTRIES) {
        const oldestKey = scratchTextureCache.keys().next().value;
        scratchTextureCache.delete(oldestKey);
    }
    return texture;
}

function normalizeTopologyKey(topologyKey, pciRaw) {
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

function clampInt(value, fallback, min = 1, max = 999) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeLayout(value) {
    return String(value || '').toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
}

function normalizeFillOrder(rawValue, legacyValue) {
    const value = String(rawValue || '').toLowerCase();
    if (value === 'column_major_ttb' || value === 'ttb' || value === 'top_to_bottom') {
        return 'column_major_ttb';
    }
    if (value === 'row_major_ltr' || value === 'ltr' || value === 'left_to_right') {
        return 'row_major_ltr';
    }

    const legacy = String(legacyValue || '').toLowerCase();
    if (legacy === 'vertical') {
        return 'column_major_ttb';
    }
    return 'row_major_ltr';
}

function statusClassForDisk(disk) {
    // Non-present/empty bays: no class → dark LED (matches old: status !== 'PRESENT' → '')
    if (!disk || disk.status !== 'PRESENT') return '';

    const state = String(disk.state || '');
    const isAllocated = Boolean(disk.pool_name && disk.pool_name !== '');

    // Priority 1: Resilvering (white) regardless of allocation
    if (state === 'RESILVERING') return 'resilvering';

    if (isAllocated) {
        if (state === 'OFFLINE')   return 'allocated-offline'; // blinks green/gray
        if (state === 'ONLINE')    return 'allocated-healthy'; // solid green
        if (state === 'DEGRADED')  return 'error';             // solid orange
        if (state === 'FAULTED')   return 'faulted';           // solid red
        if (state === 'UNAVAIL')   return 'faulted';           // solid red
        if (state === 'REMOVED')   return 'faulted';           // solid red
    } else {
        if (state === 'ONLINE' || state === 'UNALLOCATED') return 'unallocated'; // solid purple
        if (state === 'DEGRADED')  return 'unalloc-error';     // blinks purple/orange
        if (state === 'FAULTED')   return 'unalloc-fault';     // blinks purple/red
        if (state === 'UNAVAIL')   return 'unalloc-fault';     // blinks purple/red
        if (state === 'REMOVED')   return 'unalloc-fault';     // blinks purple/red
    }
    return '';
}

function formatDiskInfo(disk, unit = 'C') {
    if (!disk || disk.status === 'EMPTY') {
        return {
            serial: '-',
            size: '-',
            pool: '\u00A0',
            index: '\u00A0',
            temperature: '\u00A0'
        };
    }

    const serialRaw = String(disk.sn || disk.serial || disk.serial_short || disk.dev_name || 'present');
    const serial = serialRaw.length > 3 ? serialRaw.slice(-3) : serialRaw;
    const sizeBytes = Number(disk.size_bytes || 0);
    const size = sizeBytes > 0
        ? `${(sizeBytes / (1024 ** 4)).toFixed(2)} TB`
        : '-';
    const poolName = String(disk.pool_name ?? '').trim();
    const rawIndex = String(disk.pool_idx ?? '').trim();
    const normalizedIndex = rawIndex.replace(/^#/, '');
    const rawTemp = disk.temperature_c;
    const hasTemp = rawTemp !== null && rawTemp !== undefined && String(rawTemp).trim() !== '';
    const tempC = hasTemp ? Number(rawTemp) : NaN;
    let temperature = '\u00A0';
    if (Number.isFinite(tempC)) {
        if (String(unit).toUpperCase() === 'F') {
            const tempF = Math.round((tempC * 9) / 5 + 32);
            temperature = `${tempF}\u00B0F`;
        } else {
            temperature = `${Math.round(tempC)}\u00B0C`;
        }
    }

    return {
        serial,
        size,
        pool: poolName || '\u00A0',
        index: normalizedIndex ? `#${normalizedIndex}` : '\u00A0',
        temperature
    };
}

function getTemperatureSeverityClass(disk) {
    const rawTemp = disk?.temperature_c;
    const hasTemp = rawTemp !== null && rawTemp !== undefined && String(rawTemp).trim() !== '';
    if (!hasTemp) return '';

    const tempC = Number(rawTemp);
    if (!Number.isFinite(tempC)) return '';

    if (tempC > 60) return 'temp-hot';
    if (tempC > 40) return 'temp-warn';
    return 'temp-normal';
}

function buildOrderIndices(totalSlots, cols, rows, fillOrder) {
    const indices = [];
    if (fillOrder === 'column_major_ttb') {
        for (let col = 0; col < cols; col += 1) {
            for (let row = 0; row < rows; row += 1) {
                const index = row * cols + col;
                if (index < totalSlots) indices.push(index);
            }
        }
        return indices;
    }

    for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
            const index = row * cols + col;
            if (index < totalSlots) indices.push(index);
        }
    }
    return indices;
}

function resolveGrid(chassisData, bayConfig) {
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
        1,
        64
    );
    const defaultRows = clampInt(
        preset?.rows ?? settings.rows,
        Math.ceil(totalBays / defaultCols),
        1,
        64
    );

    // Preserve established horizontal grid tuning, but keep vertical deterministic
    // so legacy horizontal grid values cannot break vertical rendering.
    const configuredCols = layout === 'horizontal' ? (bayConfig.grid_cols ?? bayConfig.bays_per_row) : undefined;
    const configuredRows = layout === 'horizontal' ? bayConfig.grid_rows : undefined;
    let cols = clampInt(configuredCols, defaultCols, 1, 64);
    let rows = clampInt(configuredRows, defaultRows, 1, 64);

    const targetSlots = Math.max(totalBays, cols * rows);
    if (cols * rows < targetSlots) {
        rows = Math.ceil(targetSlots / cols);
    }

    return {
        maxBays,
        layout,
        cols,
        rows,
        targetSlots: Math.max(targetSlots, 1)
    };
}

function computeBayDimensions({
    layout,
    cols,
    rows,
    gapPx,
    bodyWidthPx,
    bodyHeightPx,
    longToShortRatio
}) {
    const safeCols = Math.max(1, cols);
    const safeRows = Math.max(1, rows);
    const safeGap = Math.max(0, gapPx);
    const safeBodyWidth = Math.max(120, bodyWidthPx);
    const safeBodyHeight = Math.max(40, bodyHeightPx);
    const ratio = Number.isFinite(longToShortRatio) && longToShortRatio > 1 ? longToShortRatio : 3.5;

    let bayWidth;
    let bayHeight;

    const maxBayWidthByWidth = (safeBodyWidth - (safeCols - 1) * safeGap) / safeCols;
    const maxBayHeightByHeight = (safeBodyHeight - (safeRows - 1) * safeGap) / safeRows;

    // All bays are portrait (tall/narrow). layout only governs grid arrangement, not bay orientation.
    // Height fills the available row cell; width derives from the aspect ratio.
    bayHeight = maxBayHeightByHeight;
    bayWidth = bayHeight / ratio;

    return {
        bayWidthPx: Math.max(20, bayWidth),
        bayHeightPx: Math.max(24, bayHeight)
    };
}

function buildEnclosureModel(topologyKey, chassisData, data, layoutContext = {}) {
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
    const chassisWidthPx = viewportWidthPx;
    const rackWidthIn = Number(uiLayout.rack_width_in);
    const uHeightIn = Number(uiLayout.u_height_in);
    const safeRackWidthIn = Number.isFinite(rackWidthIn) && rackWidthIn > 0 ? rackWidthIn : GEOMETRY_DEFAULTS.RACK_WIDTH_MM / 25.4;
    const safeUHeightIn = Number.isFinite(uHeightIn) && uHeightIn > 0 ? uHeightIn : GEOMETRY_DEFAULTS.RACK_UNIT_HEIGHT_MM / 25.4;
    const ruHeightOverrides = uiLayout?.ru_height_in_overrides;
    const ruOverrideIn = Number(ruHeightOverrides?.[String(chassisUnits)]);
    const chassisHeightIn = Number.isFinite(ruOverrideIn) && ruOverrideIn > 0
        ? ruOverrideIn
        : chassisUnits * safeUHeightIn;

    // Rack-unit model: same rack_units always means same chassis body height.
    const bodyHeightPx = Math.max(
        40,
        (chassisWidthPx * chassisHeightIn) / safeRackWidthIn
    );
    const bodyWidthPx = Math.max(120, chassisWidthPx - 32);

    const BODY_PADDING_PX = 5; // matches .chassis-body padding
    const innerHeightPx = Math.max(1, bodyHeightPx - (2 * BODY_PADDING_PX));
    const shortMm = GEOMETRY_DEFAULTS.HDD_SHORT_MM;
    const longMm = GEOMETRY_DEFAULTS.HDD_LONG_MM;

    // Per-layout scale: each chassis fills its own grid independently.
    // Both chassis share the same bodyHeightPx; bay sizes differ by layout.
    // horizontal: bay renders as long_side(W) × short_side(H)
    // vertical:   bay renders as short_side(W) × long_side(H)
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

    const bayWidthPx  = grid.layout === 'horizontal' ? bayLongSidePx  : bayShortSidePx * 1.21;
    const bayHeightPx = grid.layout === 'horizontal' ? bayShortSidePx : bayLongSidePx;

    const disks = Array.isArray(chassisData?.disks) ? chassisData.disks.slice(0, grid.targetSlots) : [];
    while (disks.length < grid.targetSlots) disks.push({ status: 'EMPTY' });

    const disksByVisualIndex = new Array(grid.targetSlots).fill({ status: 'EMPTY' });
    const latchNumberByVisualIndex = new Array(grid.targetSlots).fill(0);

    orderIndices.forEach((visualIndex, logicalIndex) => {
        disksByVisualIndex[visualIndex] = disks[logicalIndex] || { status: 'EMPTY' };
        latchNumberByVisualIndex[visualIndex] = logicalIndex + 1;
    });

    return {
        topologyKey,
        key,
        pciRaw,
        arrayAddress: settings.array_address || settings.array_id || '',
        hasBackplane: Boolean(settings.has_backplane),
        layout: grid.layout,
        fillOrder,
        cols: grid.cols,
        rows: grid.rows,
        targetSlots: grid.targetSlots,
        bayGap,
        chassisUnits,
        chassisWidthPx,
        bodyHeightPx,
        bayShortSidePx,
        bayLongSidePx,
        bayWidthPx,
        bayHeightPx,
        disksByVisualIndex,
        latchNumberByVisualIndex
    };
}

function applyUiVariables(config, hostname) {
    const rootStyle = document.documentElement.style;
    const ui = config?.ui || {};
    const leds = config?.ui?.led_colors;

    applyConfigMap(rootStyle, {
        '--font-default': config?.fonts?.default,
        '--font-monospace': config?.fonts?.monospace,
        '--page-bg-color': ui.environment?.page_bg_color,
        '--body-text-color': ui.environment?.body_text_color ?? ui.chassis?.font_color,
        '--rebuild-note-border': ui.environment?.rebuild_border,
        '--rebuild-note-bg': ui.environment?.rebuild_bg,
        '--rebuild-note-color': ui.environment?.rebuild_color,
        '--dashboard-max-width': ui.layout?.dashboard_max_width,
        '--dashboard-gap': ui.layout?.dashboard_gap,
        '--dashboard-top-gap': ui.layout?.dashboard_top_gap,
        '--chassis-bg-base': ui.chassis?.background_base,
        '--chassis-card-bg': ui.chassis?.background_base,
        '--chassis-body-bg': ui.chassis?.background_base,
        '--chassis-card-border': ui.chassis?.border,
        '--chassis-border': ui.chassis?.border,
        '--chassis-shadow': ui.chassis?.shadow,
        '--chassis-header-divider': ui.chassis?.header_divider,
        '--chassis-font-color': ui.chassis?.font_color,
        '--chassis-meta-color': ui.chassis?.meta_color,
        '--chassis-subtitle-color': ui.chassis?.subtitle_color,
        '--legend-chassis-stripe': ui.chassis?.stripe,
        '--legend-chassis-gradient-start': ui.chassis?.gradient_start,
        '--legend-chassis-gradient-mid-a': ui.chassis?.gradient_mid_a,
        '--legend-chassis-gradient-mid-b': ui.chassis?.gradient_mid_b,
        '--legend-chassis-gradient-end': ui.chassis?.gradient_end,
        '--activity-chassis-stripe': ui.chassis?.stripe,
        '--activity-chassis-gradient-start': ui.chassis?.gradient_start,
        '--activity-chassis-gradient-mid-a': ui.chassis?.gradient_mid_a,
        '--activity-chassis-gradient-mid-b': ui.chassis?.gradient_mid_b,
        '--activity-chassis-gradient-end': ui.chassis?.gradient_end,
        '--bay-bg-base': ui.bay?.background_base,
        '--bay-bg-gradient-start': ui.bay?.bg_gradient_start ?? ui.bay?.background_base,
        '--bay-bg-gradient-end': ui.bay?.bg_gradient_end,
        '--bay-border': ui.bay?.border,
        '--bay-top-border': ui.bay?.top_border,
        '--bay-text-color': ui.bay?.text_color,
        '--bay-empty-text-color': ui.bay?.empty_text_color,
        '--bay-led-panel-bg': ui.bay?.led_panel_bg,
        '--bay-grill-hole-color': ui.bay?.grill_hole_color,
        '--latch-gradient-start': ui.latch?.gradient_start,
        '--latch-gradient-mid': ui.latch?.gradient_mid,
        '--latch-gradient-end': ui.latch?.gradient_end,
        '--latch-border-color': ui.latch?.border_color,
        '--led-dark-core': ui.led_shell?.dark_core,
        '--led-dark-highlight': ui.led_shell?.dark_highlight,
        '--led-shell-border': ui.led_shell?.border,
        '--led-shell-shadow': ui.led_shell?.shadow,
        '--activity-card-bg': ui.activity?.card_bg,
        '--activity-card-border-top': ui.activity?.card_border_top,
        '--activity-card-border-left': ui.activity?.card_border_left,
        '--activity-card-border-right': ui.activity?.card_border_right,
        '--activity-card-border-bottom': ui.activity?.card_border_bottom,
        '--activity-card-shadow-inner': ui.activity?.card_shadow_inner,
        '--activity-card-shadow-outer': ui.activity?.card_shadow_outer,
        '--activity-card-glare': ui.activity?.card_glare,
        '--activity-title-color': ui.activity?.title_color,
        '--activity-legend-color': ui.activity?.legend_color,
        '--pool-faulted-gradient-start': ui.pool?.faulted_gradient_start,
        '--pool-faulted-gradient-end': ui.pool?.faulted_gradient_end,
        '--pool-faulted-border': ui.pool?.faulted_border,
        '--pool-faulted-shadow': ui.pool?.faulted_shadow,
        '--pool-degraded-bg': ui.pool?.degraded_bg,
        '--pool-degraded-border': ui.pool?.degraded_border,
        '--pool-state-text-color': ui.pool?.state_text_color,
        '--pool-state-text-bg': ui.pool?.state_text_bg,
        '--pool-state-text-shadow': ui.pool?.state_text_shadow
    });

    applyStyleConfig(rootStyle, 'server-name', ui.server_name);
    applyStyleConfig(rootStyle, 'pci-address', ui.pci_address);
    applyStyleConfig(rootStyle, 'legend', ui.legend);
    applyStyleConfig(rootStyle, 'enclosure-label', ui.enclosure_label);
    applyStyleConfig(rootStyle, 'bay-id', ui.bay_id);
    applyStyleConfig(rootStyle, 'disk-serial', ui.disk_serial);
    applyStyleConfig(rootStyle, 'disk-size', ui.disk_size);
    applyStyleConfig(rootStyle, 'disk-pool', ui.disk_pool);
    applyStyleConfig(rootStyle, 'disk-index', ui.disk_index);
    applyStyleConfig(rootStyle, 'disk-temp', ui.drive_temperature);

    applyConfigMap(rootStyle, {
        '--legend-title-color': ui.legend?.title_color,
        '--legend-title-size': ui.legend?.title_size,
        '--legend-title-weight': ui.legend?.title_weight,
        '--legend-chassis-bg': ui.chassis?.background_base,
        '--legend-chassis-border': ui.chassis?.border,
        '--legend-chassis-shadow': ui.chassis?.shadow,
        '--activity-chassis-bg': ui.chassis?.background_base,
        '--activity-chassis-border': ui.chassis?.border,
        '--activity-chassis-shadow': ui.chassis?.shadow,
        '--activity-header-color': ui.chassis?.font_color,
        '--activity-subtext-color': ui.pci_address?.color
    });

    const activityServerName = ui.activity?.server_name || {};
    const activityServerNameStyles = Array.isArray(activityServerName.style)
        ? activityServerName.style.map(value => String(value).toLowerCase())
        : [];
    const serverNameColor = String(activityServerName.color || '#ffffff');
    const subtextColor = mixHex(serverNameColor, -0.30);
    applyConfigMap(rootStyle, {
        '--activity-server-name-color': serverNameColor,
        '--activity-server-name-font': activityServerName.font,
        '--activity-server-name-weight': activityServerNameStyles.includes('bold') ? '700' : '400',
        '--activity-server-name-style': activityServerNameStyles.includes('italic') ? 'italic' : 'normal',
        '--activity-server-name-transform': activityServerNameStyles.includes('allcaps') ? 'uppercase' : 'none',
        '--activity-server-name-variant': activityServerNameStyles.includes('smallcaps') ? 'small-caps' : 'normal',
        '--activity-subtext-color-derived': subtextColor
    });

    const enclosureLabelScale = Number(ui.enclosure_label?.size_scale);
    if (Number.isFinite(enclosureLabelScale) && enclosureLabelScale > 0) {
        rootStyle.setProperty('--enclosure-label-scale', String(enclosureLabelScale / 100));
    }

    if (leds && typeof leds === 'object') {
        const mapping = {
            allocated_healthy: '--led-allocated-healthy',
            allocated_offline: '--led-allocated-offline',
            error: '--led-error',
            faulted: '--led-faulted',
            resilvering: '--led-resilvering',
            unallocated: '--led-unallocated',
            unalloc_error: '--led-unalloc-error',
            unalloc_fault: '--led-unalloc-fault',
            activity: '--led-activity'
        };
        applyConfigMap(rootStyle, Object.fromEntries(
            Object.entries(mapping).map(([key, cssVar]) => [cssVar, leds[key]])
        ));
    }

    const bay = config?.ui?.bay;
    if (bay) {
        if (bay.grill_size) {
            rootStyle.setProperty('--bay-grill-size', String(bay.grill_size));
        } else if (bay.grill_size_scale !== undefined) {
            const safeScale = Math.min(100, Math.max(0, Number(bay.grill_size_scale) || 50));
            const grillSize = 10 + (safeScale / 100) * 10;
            rootStyle.setProperty('--bay-grill-size', `${grillSize}px`);
        }
    }

    const chart = config?.chart || {};
    const chartColors = chart.colors || {};
    const chartDimensions = chart.dimensions || {};

    if (chartColors.readColor) {
        rootStyle.setProperty('--chart-read-color', String(chartColors.readColor));
        rootStyle.setProperty('--chart-read-dot-color', String(chartColors.readDotColor || chartColors.readColor));
    }
    if (chartColors.writeColor) {
        rootStyle.setProperty('--chart-write-color', String(chartColors.writeColor));
        rootStyle.setProperty('--chart-write-dot-color', String(chartColors.writeDotColor || chartColors.writeColor));
    }
    if (chartColors.readGradientTop) rootStyle.setProperty('--chart-read-gradient-top', String(chartColors.readGradientTop));
    if (chartColors.readGradientBottom) rootStyle.setProperty('--chart-read-gradient-bottom', String(chartColors.readGradientBottom));
    if (chartColors.writeGradientTop) rootStyle.setProperty('--chart-write-gradient-top', String(chartColors.writeGradientTop));
    if (chartColors.writeGradientBottom) rootStyle.setProperty('--chart-write-gradient-bottom', String(chartColors.writeGradientBottom));
    if (chartColors.yAxisLabelColor) rootStyle.setProperty('--chart-y-axis-label-color', String(chartColors.yAxisLabelColor));
    if (chartColors.yAxisGridColor) rootStyle.setProperty('--chart-y-axis-grid-color', String(chartColors.yAxisGridColor));
    // Graph title color (chart.colors.graphTitleColor overrides ui.activity.title_color)
    if (chartColors.graphTitleColor) rootStyle.setProperty('--activity-title-color', String(chartColors.graphTitleColor));

    if (chartDimensions.chartHeight) rootStyle.setProperty('--chart-height', String(chartDimensions.chartHeight));
    if (chartDimensions.cardWidth) rootStyle.setProperty('--chart-card-width', String(chartDimensions.cardWidth));
    if (chartDimensions.containerGap) rootStyle.setProperty('--chart-container-gap', String(chartDimensions.containerGap));
    if (chartDimensions.chassisPadding) rootStyle.setProperty('--chart-chassis-padding', String(chartDimensions.chassisPadding));
    if (chartDimensions.lineTension !== undefined) rootStyle.setProperty('--chart-line-tension', String(chartDimensions.lineTension));
    if (chartDimensions.lineWidth !== undefined) rootStyle.setProperty('--chart-line-width', String(chartDimensions.lineWidth));
    if (chartDimensions.cardMarginRight) rootStyle.setProperty('--chart-card-margin-right', String(chartDimensions.cardMarginRight));

    // Activity chassis color override (ui.activity.chassis_color takes precedence over ui.chassis.background_base)
    if (ui.activity?.chassis_color) {
        const base = String(ui.activity.chassis_color);
        rootStyle.setProperty('--activity-chassis-bg', base);
        // Also override gradient stops so the chosen chassis color is visibly reflected.
        rootStyle.setProperty('--activity-chassis-gradient-start', mixHex(base, -0.35));
        rootStyle.setProperty('--activity-chassis-gradient-mid-a', mixHex(base, -0.12));
        rootStyle.setProperty('--activity-chassis-gradient-mid-b', mixHex(base, 0.08));
        rootStyle.setProperty('--activity-chassis-gradient-end', mixHex(base, -0.32));
    }

    // Scratch controls: random scratch generation with intensity-driven deep 2x width scratches.
    const clampSlider = (v) => Math.max(0, Math.min(100, Number(v ?? 50)));
    const curveCentered = (v, power = 1.7) => {
        const t = (clampSlider(v) - 50) / 50;
        return Math.sign(t) * Math.pow(Math.abs(t), power);
    };
    const sliderToUnit = (v) => (curveCentered(v) + 1) / 2;
    const sliderToScale = (v) => Math.max(0.15, 1 + curveCentered(v) * 1.5);

    const scratchLevel = Number(ui.activity?.scratch_level ?? 50);
    const scratchDensity = Number(ui.activity?.scratch_density ?? 50);
    const scratchIntensity = Number(ui.activity?.scratch_intensity ?? 50);
    const scratchOpacity = (sliderToUnit(scratchLevel) * sliderToUnit(scratchIntensity) * 0.09);
    const scratchTexture = buildRandomScratchTexture(
        scratchLevel,
        scratchDensity,
        scratchIntensity
    );
    rootStyle.setProperty('--activity-chassis-stripe', `rgba(255,255,255,${scratchOpacity.toFixed(4)})`);
    rootStyle.setProperty('--activity-random-scratches', scratchTexture);

    // Chart typography scale CSS vars (0-100 scale; 50 = ×1.0; 0 = ×0.25 min; 100 = ×2.5)
    const typography = chart.typography || {};
    rootStyle.setProperty('--chart-graph-title-scale', sliderToScale(typography.graph_title_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-legend-text-scale', sliderToScale(typography.legend_text_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-y-axis-label-font-size', `${Math.max(6, Math.round(9 * sliderToScale(typography.y_axis_label_size_scale)))}px`);

    const activityHostname = document.getElementById('activity-hostname');
    if (activityHostname) {
        activityHostname.textContent = hostname || 'Pool Activity';
    }
}

function applyDeviceVariables(config) {
    const devices = config?.devices || {};
    const globalHoleColor = config?.ui?.bay?.grill_hole_color || '#000000';
    const globalSizeScale = Math.min(100, Math.max(0, Number(config?.ui?.bay?.grill_size_scale ?? 50)));
    const baseGrillPx = 10 + (globalSizeScale / 100) * 10;
    const clampSlider = (v) => Math.max(0, Math.min(100, Number(v ?? 50)));
    const curveCentered = (v, power = 1.7) => {
        const t = (clampSlider(v) - 50) / 50;
        return Math.sign(t) * Math.pow(Math.abs(t), power);
    };
    const sliderToUnit = (v) => (curveCentered(v) + 1) / 2;
    const setOrClear = (el, name, value) => {
        if (value === undefined || value === null || value === '') {
            el.style.removeProperty(name);
            return;
        }
        el.style.setProperty(name, String(value));
    };
    const applyTextStyleOverride = (el, cssPrefix, styleCfg) => {
        const cfg = styleCfg || {};
        const styles = Array.isArray(cfg.style) ? cfg.style.map(v => String(v).toLowerCase()) : [];
        const hasStyleOverride = Array.isArray(cfg.style);

        setOrClear(el, `--${cssPrefix}-color`, cfg.color);
        setOrClear(el, `--${cssPrefix}-font`, cfg.font);
        setOrClear(el, `--${cssPrefix}-size`, cfg.size);
        setOrClear(el, `--${cssPrefix}-weight`, hasStyleOverride ? (styles.includes('bold') ? '700' : '400') : undefined);
        setOrClear(el, `--${cssPrefix}-style`, hasStyleOverride ? (styles.includes('italic') ? 'italic' : 'normal') : undefined);
        setOrClear(el, `--${cssPrefix}-transform`, hasStyleOverride ? (styles.includes('allcaps') ? 'uppercase' : 'none') : undefined);
        setOrClear(el, `--${cssPrefix}-variant`, hasStyleOverride ? (styles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined);
    };
    Object.entries(devices).forEach(([key, devCfg]) => {
        const el = document.querySelector(`.chassis-card[data-key="${key}"]`);
        if (!el) return;

        const bayDev = devCfg?.bay || {};
        const doorColor = bayDev.door_color;
        const hasDoorColor = !!(doorColor && /^#[0-9a-fA-F]{6}$/.test(doorColor));
        if (hasDoorColor) {
            el.style.setProperty('--enc-bay-bg-start', mixHex(doorColor, -0.10));
            el.style.setProperty('--enc-bay-bg-end', mixHex(doorColor, -0.30));
            el.style.setProperty('--enc-latch-start', mixHex(doorColor, 0.15));
            el.style.setProperty('--enc-latch-mid', doorColor);
            el.style.setProperty('--enc-latch-end', mixHex(doorColor, -0.20));
        }
        const grillShape = bayDev.grill_shape || 'round';
        const holeColor = hasDoorColor ? mixHex(doorColor, -0.50) : globalHoleColor;
        const sizeScale = bayDev.grill_size_scale;
        const grillPx = sizeScale !== undefined
            ? Math.max(2, Math.round(baseGrillPx * grillSliderScale(sizeScale)))
            : baseGrillPx;
        el.style.removeProperty('--enc-grill-opacity');
        el.style.removeProperty('--enc-grill-image');
        el.style.removeProperty('--enc-grill-size');
        el.style.removeProperty('--enc-grill-pos2');
        if (grillShape !== 'round' || hasDoorColor || sizeScale !== undefined) {
            const g = buildGrillImageCss(grillShape, holeColor, grillPx);
            if (g.opacity !== undefined) el.style.setProperty('--enc-grill-opacity', g.opacity);
            if (g.image) el.style.setProperty('--enc-grill-image', g.image);
            if (sizeScale !== undefined) el.style.setProperty('--enc-grill-size', `${grillPx}px`);
            if (g.pos2) el.style.setProperty('--enc-grill-pos2', g.pos2);
        }

        const chassisDev = devCfg?.chassis || {};
        const chassisColor = chassisDev.color;
        const hasChassisColor = !!(chassisColor && /^#[0-9a-fA-F]{6}$/.test(chassisColor));

        if (hasChassisColor) {
            el.style.setProperty('--enc-chassis-bg', chassisColor);
            el.style.setProperty('--enc-chassis-bg-body', mixHex(chassisColor, -0.18));
            el.style.setProperty('--enc-chassis-gradient-start', mixHex(chassisColor, -0.35));
            el.style.setProperty('--enc-chassis-gradient-mid-a', mixHex(chassisColor, -0.12));
            el.style.setProperty('--enc-chassis-gradient-mid-b', mixHex(chassisColor, 0.08));
            el.style.setProperty('--enc-chassis-gradient-end', mixHex(chassisColor, -0.32));
        } else {
            el.style.removeProperty('--enc-chassis-bg');
            el.style.removeProperty('--enc-chassis-bg-body');
            el.style.removeProperty('--enc-chassis-gradient-start');
            el.style.removeProperty('--enc-chassis-gradient-mid-a');
            el.style.removeProperty('--enc-chassis-gradient-mid-b');
            el.style.removeProperty('--enc-chassis-gradient-end');
        }

        const serverName = chassisDev.server_name || {};
        const serverStyles = Array.isArray(serverName.style)
            ? serverName.style.map(v => String(v).toLowerCase())
            : [];
        const hasServerStyleOverride = Array.isArray(serverName.style);

        setOrClear(el, '--server-name-color', serverName.color);
        setOrClear(el, '--server-name-font', serverName.font);
        setOrClear(el, '--server-name-weight', hasServerStyleOverride ? (serverStyles.includes('bold') ? '700' : '400') : undefined);
        setOrClear(el, '--server-name-style', hasServerStyleOverride ? (serverStyles.includes('italic') ? 'italic' : 'normal') : undefined);
        setOrClear(el, '--server-name-transform', hasServerStyleOverride ? (serverStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined);
        setOrClear(el, '--server-name-variant', hasServerStyleOverride ? (serverStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined);
        setOrClear(el, '--pci-address-color', chassisDev?.pci_address?.color);

        applyTextStyleOverride(el, 'disk-pool', bayDev.disk_pool);
        applyTextStyleOverride(el, 'disk-index', bayDev.disk_index);
        applyTextStyleOverride(el, 'disk-serial', bayDev.disk_serial);
        applyTextStyleOverride(el, 'disk-size', bayDev.disk_size);
        applyTextStyleOverride(el, 'disk-temp', bayDev.drive_temperature);

        const hasScratchOverride =
            chassisDev.scratch_level !== undefined ||
            chassisDev.scratch_density !== undefined ||
            chassisDev.scratch_intensity !== undefined;

        if (hasScratchOverride) {
            const scratchLevel = Number(chassisDev.scratch_level ?? 50);
            const scratchDensity = Number(chassisDev.scratch_density ?? 50);
            const scratchIntensity = Number(chassisDev.scratch_intensity ?? 50);
            const scratchOpacity = (sliderToUnit(scratchLevel) * sliderToUnit(scratchIntensity) * 0.09);
            const scratchTexture = buildRandomScratchTexture(
                scratchLevel,
                scratchDensity,
                scratchIntensity
            );
            el.style.setProperty('--enc-chassis-stripe', `rgba(255,255,255,${scratchOpacity.toFixed(4)})`);
            el.style.setProperty('--enc-chassis-scratches', scratchTexture);
        } else {
            el.style.removeProperty('--enc-chassis-stripe');
            el.style.removeProperty('--enc-chassis-scratches');
        }
    });
}

function bayMarkup(disk, latchNumber, layout, tempUnit = 'C') {
    const info = formatDiskInfo(disk, tempUnit);
    const emptyClass = !disk || disk.status === 'EMPTY' ? 'empty' : 'present';
    const statusClass = statusClassForDisk(disk);
    const activityClass = disk && disk.active === true ? 'active' : '';
    const tempSeverityClass = getTemperatureSeverityClass(disk);

    return `
        <div class="bay-shell bay-${layout} ${emptyClass}">
            <div class="bay-content">
                <div class="led-panel led-panel-${layout}">
                    <span class="led status-led ${statusClass}"></span>
                    <span class="led activity-led ${activityClass}"></span>
                </div>
                <div class="info-panel${layout === 'vertical' ? ' info-panel-vertical' : ''}">
                    <div class="info-line">
                        <span class="info-serial">${info.serial}</span>
                        <span class="info-size">${info.size}</span>
                    </div>
                    <div class="info-line info-line-temp">
                        <span class="info-temp ${tempSeverityClass}">${info.temperature}</span>
                    </div>
                    <div class="info-line">
                        <span class="info-pool">${info.pool}</span>
                        <span class="info-idx">${info.index}</span>
                    </div>
                </div>
            </div>
            <div class="latch latch-${layout}"><span class="latch-num">${latchNumber}</span></div>
        </div>
    `;
}

function enclosureMarkup(model, hostname, tempUnit = 'C', contentScale = 1.0) {
    const bays = model.disksByVisualIndex.map((disk, index) => bayMarkup(
        disk,
        model.latchNumberByVisualIndex[index] || index + 1,
        model.layout,
        tempUnit
    )).join('');

    const enclosureId = model.arrayAddress ? `${model.pciRaw} / ${model.arrayAddress}` : model.pciRaw;
    const caption = model.hasBackplane ? 'Backplane Enclosure' : 'Direct-Attach Enclosure';

    return `
        <section class="chassis-card" data-key="${model.key}" style="--bay-gap:${model.bayGap}px; --chassis-width:${model.chassisWidthPx}px; --chassis-body-height:${model.bodyHeightPx}px; --bay-width:${model.bayWidthPx}px; --bay-height:${model.bayHeightPx}px; --bay-scale:${contentScale};">
            <header class="chassis-head">
                <div class="title-group">
                    <h2 class="chassis-title">${hostname}<span class="chassis-caption">${caption}</span></h2>
                    <p class="chassis-subtitle">${enclosureId}</p>
                </div>
            </header>
            <div class="chassis-body">
                <div class="bays-grid" style="grid-template-columns: repeat(${model.cols}, var(--bay-width)); grid-template-rows: repeat(${model.rows}, var(--bay-height));">
                    ${bays}
                </div>
            </div>
        </section>
    `;
}

function render(data) {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;

    const topology = data?.topology || {};
    const hostname = data?.hostname || 'Storage';
    applyUiVariables(data?.config, hostname);

    const previewConfig = window.__previewConfig__;
    if (previewConfig && typeof previewConfig === 'object') {
        applyUiVariables(previewConfig, hostname);
    }

    const chassisEntries = Object.entries(topology);
    const chassisCount = Math.max(1, chassisEntries.length);
    const canvasStyle = window.getComputedStyle(canvas);
    const gapPx = parseFloat(canvasStyle.columnGap || canvasStyle.gap || '16') || 16;
    
    // Use container width instead of viewport width for better iframe support
    const dashboardContainer = document.getElementById('dashboard-wrapper');
    const containerWidth = dashboardContainer?.clientWidth || window.innerWidth;
    const availableWidthPx = Math.max(320, canvas.clientWidth || Math.floor(containerWidth * 0.98));
    const perChassisWidthPx = Math.max(320, Math.floor((availableWidthPx - (gapPx * (chassisCount - 1))) / chassisCount));

    const activeConfig = (window.__previewConfig__ && typeof window.__previewConfig__ === 'object')
        ? window.__previewConfig__
        : data?.config;
    // Content scale is explicitly tuned for the supported layout envelope:
    // 1 chassis wide => scale interior bay content up to match chassis growth.
    // 2 chassis wide => baseline sizing (no extra scaling).
    const referenceWidthPx = Math.max(320, Math.floor((availableWidthPx - gapPx) / 2));
    const contentScale = chassisCount === 1
        ? parseFloat((perChassisWidthPx / referenceWidthPx).toFixed(3))
        : 1.0;
    const tempUnit = String(activeConfig?.ui?.drive_temperature?.unit || 'C').toUpperCase() === 'F' ? 'F' : 'C';
    const renderData = {
        ...data,
        config: activeConfig || data?.config || {}
    };

    const models = chassisEntries.map(([topologyKey, chassisData]) =>
        buildEnclosureModel(topologyKey, chassisData, renderData, { preferredWidthPx: perChassisWidthPx })
    );

    if (models.length === 0) {
        canvas.innerHTML = '<div class="rebuild-note">No enclosure data returned from /data.</div>';
        return;
    }

    canvas.innerHTML = models.map(model => enclosureMarkup(model, hostname, tempUnit, contentScale)).join('');

    applyDeviceVariables(activeConfig);

    if (!activityMonitor && window.ActivityMonitor) {
        activityMonitor = new window.ActivityMonitor();
        activityMonitor.initialize();
    } else if (activityMonitor && typeof activityMonitor.reflowLayout === 'function') {
        activityMonitor.reflowLayout();
    }
}

async function update() {
    if (updateInFlight) return;
    updateInFlight = true;
    try {
        const data = await fetchDataWithRetry();
        const renderable = getRenderablePayload(data);

        if (hasUsableTopology(renderable)) {
            render(renderable);
            return;
        }

        if (!hasFreshLastGoodTopology()) {
            const canvas = document.getElementById('canvas');
            if (canvas) {
                canvas.innerHTML = '<div class="rebuild-note">No enclosure data returned from /data.</div>';
            }
        }
    } catch (error) {
        if (hasFreshLastGoodTopology()) {
            render(lastGoodRenderPayload);
        } else {
            const canvas = document.getElementById('canvas');
            if (canvas) {
                canvas.innerHTML = '<div class="rebuild-note">Unable to fetch /data while in rebuild mode.</div>';
            }
        }
    } finally {
        updateInFlight = false;
    }
}

update();
setInterval(update, DATA_FETCH_INTERVAL_MS);
