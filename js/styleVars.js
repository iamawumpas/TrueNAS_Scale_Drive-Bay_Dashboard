// js/styleVars.js — CSS custom property injection for UI and per-device overrides

import {
    mixHex,
    applyConfigMap,
    applyStyleConfig,
    grillSliderScale,
    buildGrillImageCss,
    getDecorationTextureFn,
    sliderToUnit,
    sliderToScale
} from './utils.js';

export function applyUiVariables(config, hostname) {
    const rootStyle = document.documentElement.style;
    const ui = config?.ui || {};
    const menu = ui.menu || {};
    const hasMenuStyle = Array.isArray(menu.style);
    const menuStyles = hasMenuStyle
        ? menu.style.map(v => String(v).toLowerCase())
        : [];
    const sectionName = menu.section_name || {};
    const hasSectionNameStyle = Array.isArray(sectionName.style);
    const sectionNameStyles = hasSectionNameStyle
        ? sectionName.style.map(v => String(v).toLowerCase())
        : [];
    const subsectionName = menu.subsection_name || {};
    const hasSubsectionNameStyle = Array.isArray(subsectionName.style);
    const subsectionNameStyles = hasSubsectionNameStyle
        ? subsectionName.style.map(v => String(v).toLowerCase())
        : [];
    const menuControls = menu.controls || {};
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
        '--pool-state-text-shadow': ui.pool?.state_text_shadow,
        '--menu-bg-color': menu.background,
        '--menu-border-color': menu.border,
        '--menu-text-color': menu.text,
        '--menu-button-text': menu.button_text,
        '--menu-opacity': menu.opacity,
        '--menu-font-family': menu.font,
        '--menu-font-size': menu.size,
        '--menu-font-weight': hasMenuStyle ? (menuStyles.includes('bold') ? '700' : '400') : undefined,
        '--menu-font-style': hasMenuStyle ? (menuStyles.includes('italic') ? 'italic' : 'normal') : undefined,
        '--menu-font-transform': hasMenuStyle ? (menuStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined,
        '--menu-font-variant': hasMenuStyle ? (menuStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined,
        '--menu-label-color': menu.label_color,
        '--menu-section-title-color': sectionName.color || menu.section_title_color,
        '--menu-section-title-size': sectionName.size,
        '--menu-section-title-weight': hasSectionNameStyle ? (sectionNameStyles.includes('bold') ? '700' : '400') : undefined,
        '--menu-section-title-style': hasSectionNameStyle ? (sectionNameStyles.includes('italic') ? 'italic' : 'normal') : undefined,
        '--menu-section-title-transform': hasSectionNameStyle ? (sectionNameStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined,
        '--menu-section-title-variant': hasSectionNameStyle ? (sectionNameStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined,
        '--menu-subsection-title-size': subsectionName.size,
        '--menu-subsection-title-weight': hasSubsectionNameStyle ? (subsectionNameStyles.includes('bold') ? '700' : '400') : undefined,
        '--menu-subsection-title-style': hasSubsectionNameStyle ? (subsectionNameStyles.includes('italic') ? 'italic' : 'normal') : undefined,
        '--menu-subsection-title-transform': hasSubsectionNameStyle ? (subsectionNameStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined,
        '--menu-subsection-title-variant': hasSubsectionNameStyle ? (subsectionNameStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined,
        '--menu-dropdown-bg': menu.background,
        '--menu-dropdown-border': menu.dropdown_border,
        '--menu-dropdown-shadow': menu.dropdown_shadow,
        '--menu-dropdown-opacity': menu.dropdown_opacity !== undefined ? (0.5 + (Number(menu.dropdown_opacity) / 100) * 0.5) : 1.0,
        '--menu-control-bg': menuControls.background,
        '--menu-control-border': menuControls.border,
        '--menu-control-text': menuControls.text,
        '--menu-control-focus-border': menuControls.focus_border
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
    if (chartColors.graphTitleColor) rootStyle.setProperty('--activity-title-color', String(chartColors.graphTitleColor));

    if (chartDimensions.chartHeight) rootStyle.setProperty('--chart-height', String(chartDimensions.chartHeight));
    if (chartDimensions.cardWidth) rootStyle.setProperty('--chart-card-width', String(chartDimensions.cardWidth));
    if (chartDimensions.containerGap) rootStyle.setProperty('--chart-container-gap', String(chartDimensions.containerGap));
    if (chartDimensions.chassisPadding) rootStyle.setProperty('--chart-chassis-padding', String(chartDimensions.chassisPadding));
    if (chartDimensions.lineTension !== undefined) rootStyle.setProperty('--chart-line-tension', String(chartDimensions.lineTension));
    if (chartDimensions.lineWidth !== undefined) rootStyle.setProperty('--chart-line-width', String(chartDimensions.lineWidth));
    if (chartDimensions.cardMarginRight) rootStyle.setProperty('--chart-card-margin-right', String(chartDimensions.cardMarginRight));

    if (ui.activity?.chassis_color) {
        const base = String(ui.activity.chassis_color);
        rootStyle.setProperty('--activity-chassis-bg', base);
        rootStyle.setProperty('--activity-chassis-gradient-start', mixHex(base, -0.35));
        rootStyle.setProperty('--activity-chassis-gradient-mid-a', mixHex(base, -0.12));
        rootStyle.setProperty('--activity-chassis-gradient-mid-b', mixHex(base, 0.08));
        rootStyle.setProperty('--activity-chassis-gradient-end', mixHex(base, -0.32));
    }

    const decorationLevel = Number(ui.activity?.decoration_level ?? 50);
    const decorationDensity = Number(ui.activity?.decoration_density ?? 50);
    const decorationIntensity = Number(ui.activity?.decoration_intensity ?? 50);
    const decorationOpacity = sliderToUnit(decorationLevel) * sliderToUnit(decorationIntensity) * 0.09;
    const buildRandomDecorationTexture = getDecorationTextureFn();
    const decorationTexture = buildRandomDecorationTexture(decorationLevel, decorationDensity, decorationIntensity);
    rootStyle.setProperty('--activity-chassis-stripe', `rgba(255,255,255,${decorationOpacity.toFixed(4)})`);
    rootStyle.setProperty('--activity-random-decorations', decorationTexture);

    const typography = chart.typography || {};
    rootStyle.setProperty('--chart-graph-title-scale', sliderToScale(typography.graph_title_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-legend-text-scale', sliderToScale(typography.legend_text_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-y-axis-label-font-size', `${Math.max(6, Math.round(9 * sliderToScale(typography.y_axis_label_size_scale)))}px`);

    const activityHostname = document.getElementById('activity-hostname');
    if (activityHostname) {
        activityHostname.textContent = hostname || 'Pool Activity';
    }
}

export function applyDeviceVariables(config) {
    const devices = config?.devices || {};
    const globalHoleColor = config?.ui?.bay?.grill_hole_color || '#000000';
    const globalSizeScale = Math.min(100, Math.max(0, Number(config?.ui?.bay?.grill_size_scale ?? 50)));
    const baseGrillPx = 10 + (globalSizeScale / 100) * 10;

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

    const buildRandomDecorationTexture = getDecorationTextureFn();

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

        const hasDecorationOverride =
            chassisDev.decoration_level !== undefined ||
            chassisDev.decoration_density !== undefined ||
            chassisDev.decoration_intensity !== undefined;

        if (hasDecorationOverride) {
            const decorationLevel = Number(chassisDev.decoration_level ?? 50);
            const decorationDensity = Number(chassisDev.decoration_density ?? 50);
            const decorationIntensity = Number(chassisDev.decoration_intensity ?? 50);
            const decorationOpacity = sliderToUnit(decorationLevel) * sliderToUnit(decorationIntensity) * 0.09;
            const decorationTexture = buildRandomDecorationTexture(decorationLevel, decorationDensity, decorationIntensity);
            el.style.setProperty('--enc-chassis-stripe', `rgba(255,255,255,${decorationOpacity.toFixed(4)})`);
            el.style.setProperty('--enc-chassis-decorations', decorationTexture);
        } else {
            el.style.removeProperty('--enc-chassis-stripe');
            el.style.removeProperty('--enc-chassis-decorations');
        }
    });
}
