import { GEOMETRY_DEFAULTS } from './geometry.js';

let activityMonitor = null;

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

function formatDiskInfo(disk) {
    if (!disk || disk.status === 'EMPTY') {
        return {
            serial: '-',
            size: '-',
            pool: '\u00A0',
            index: '\u00A0'
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

    return {
        serial,
        size,
        pool: poolName || '\u00A0',
        index: normalizedIndex ? `#${normalizedIndex}` : '\u00A0'
    };
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

    const defaultCols = layout === 'horizontal'
        ? Math.max(1, Math.min(4, maxBays || incomingDisks.length || 1))
        : Math.max(1, Math.min(16, maxBays || incomingDisks.length || 1));

    const configuredCols = bayConfig.grid_cols ?? bayConfig.bays_per_row;
    const configuredRows = bayConfig.grid_rows ?? chassisData?.settings?.rows;
    let cols = clampInt(configuredCols, defaultCols, 1, 64);
    let rows = clampInt(configuredRows, Math.ceil(maxBays / cols), 1, 64);

    const targetSlots = Math.max(maxBays, incomingDisks.length, cols * rows);
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

    if (layout === 'vertical') {
        // Strict fit: preserve aspect ratio and satisfy both width and height constraints.
        bayHeight = Math.min(maxBayHeightByHeight, maxBayWidthByWidth * ratio);
        bayWidth = bayHeight / ratio;
    } else {
        bayWidth = Math.min(maxBayWidthByWidth, maxBayHeightByHeight * ratio);
        bayHeight = bayWidth / ratio;
    }

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

    // 19-inch rack width model: same rack_units means same body height.
    const bodyHeightPx = Math.max(
        40,
        (chassisWidthPx * chassisUnits * safeUHeightIn) / safeRackWidthIn
    );
    const bodyWidthPx = Math.max(120, chassisWidthPx - 32);
    const ratio = GEOMETRY_DEFAULTS.HDD_LONG_MM / GEOMETRY_DEFAULTS.HDD_SHORT_MM;
    const bayDims = computeBayDimensions({
        layout: grid.layout,
        cols: grid.cols,
        rows: grid.rows,
        gapPx: bayGap,
        bodyWidthPx,
        bodyHeightPx,
        longToShortRatio: ratio
    });

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
        bayWidthPx: bayDims.bayWidthPx,
        bayHeightPx: bayDims.bayHeightPx,
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

    if (chartDimensions.chartHeight) rootStyle.setProperty('--chart-height', String(chartDimensions.chartHeight));
    if (chartDimensions.cardWidth) rootStyle.setProperty('--chart-card-width', String(chartDimensions.cardWidth));
    if (chartDimensions.containerGap) rootStyle.setProperty('--chart-container-gap', String(chartDimensions.containerGap));
    if (chartDimensions.chassisPadding) rootStyle.setProperty('--chart-chassis-padding', String(chartDimensions.chassisPadding));
    if (chartDimensions.lineTension !== undefined) rootStyle.setProperty('--chart-line-tension', String(chartDimensions.lineTension));
    if (chartDimensions.lineWidth !== undefined) rootStyle.setProperty('--chart-line-width', String(chartDimensions.lineWidth));
    if (chartDimensions.cardMarginRight) rootStyle.setProperty('--chart-card-margin-right', String(chartDimensions.cardMarginRight));

    const activityHostname = document.getElementById('activity-hostname');
    if (activityHostname) {
        activityHostname.textContent = hostname || 'Pool Activity';
    }
}

function bayMarkup(disk, latchNumber, layout) {
    const info = formatDiskInfo(disk);
    const emptyClass = !disk || disk.status === 'EMPTY' ? 'empty' : 'present';
    const statusClass = statusClassForDisk(disk);
    const activityClass = disk && disk.active === true ? 'active' : '';

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

function enclosureMarkup(model, hostname) {
    const bays = model.disksByVisualIndex.map((disk, index) => bayMarkup(
        disk,
        model.latchNumberByVisualIndex[index] || index + 1,
        model.layout
    )).join('');

    const enclosureId = model.arrayAddress ? `${model.pciRaw} / ${model.arrayAddress}` : model.pciRaw;
    const caption = model.hasBackplane ? 'Backplane Enclosure' : 'Direct-Attach Enclosure';

    return `
        <section class="chassis-card" style="--bay-gap:${model.bayGap}px; --chassis-width:${model.chassisWidthPx}px; --chassis-body-height:${model.bodyHeightPx}px; --bay-width:${model.bayWidthPx}px; --bay-height:${model.bayHeightPx}px;">
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
    const availableWidthPx = Math.max(320, canvas.clientWidth || Math.floor(window.innerWidth * 0.98));
    const perChassisWidthPx = Math.max(320, Math.floor((availableWidthPx - (gapPx * (chassisCount - 1))) / chassisCount));

    const models = chassisEntries.map(([topologyKey, chassisData]) =>
        buildEnclosureModel(topologyKey, chassisData, data, { preferredWidthPx: perChassisWidthPx })
    );

    if (models.length === 0) {
        canvas.innerHTML = '<div class="rebuild-note">No enclosure data returned from /data.</div>';
        return;
    }

    canvas.innerHTML = models.map(model => enclosureMarkup(model, hostname)).join('');

    if (!activityMonitor && window.ActivityMonitor) {
        activityMonitor = new window.ActivityMonitor();
        activityMonitor.initialize();
    } else if (activityMonitor && typeof activityMonitor.reflowLayout === 'function') {
        activityMonitor.reflowLayout();
    }
}

async function update() {
    try {
        const response = await fetch('/data?t=' + Date.now());
        const data = await response.json();
        render(data);
    } catch (error) {
        const canvas = document.getElementById('canvas');
        if (canvas) {
            canvas.innerHTML = '<div class="rebuild-note">Unable to fetch /data while in rebuild mode.</div>';
        }
    }
}

update();
setInterval(update, 2000);
