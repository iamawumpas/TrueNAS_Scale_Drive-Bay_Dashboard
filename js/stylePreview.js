// js/stylePreview.js - style application helpers for menu live preview

import {
    applyConfigMap,
    mixHex,
    getDecorationTextureFn,
    sliderToUnit,
    sliderToScale
} from './utils.js';
import { applyDeviceVariables } from './styleVars.js';

let recreateTimer = null;

function hexToRgbComponents(hex) {
    const clean = String(hex || '').replace('#', '');
    if (clean.length !== 6) return null;
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

export function scheduleChartRecreation() {
    if (recreateTimer) return;
    recreateTimer = setTimeout(() => {
        recreateTimer = null;
        if (window.activityMonitor && typeof window.activityMonitor.recreateCharts === 'function') {
            window.activityMonitor.recreateCharts();
        }
    }, 120);
}

export function applyActivityVariables(config) {
    const rootStyle = document.documentElement.style;
    const activity = config?.ui?.activity || {};
    const chartColors = config?.chart?.colors || {};
    const typography = config?.chart?.typography || {};
    const setOrClear = (name, value) => {
        if (value === undefined || value === null || value === '') {
            rootStyle.removeProperty(name);
            return;
        }
        rootStyle.setProperty(name, String(value));
    };

    setOrClear('--activity-chassis-bg', activity.chassis_color);
    setOrClear('--activity-legend-color', activity.legend_color);

    const serverName = activity.server_name || {};
    const serverStyles = Array.isArray(serverName.style) ? serverName.style.map(v => String(v).toLowerCase()) : [];
    setOrClear('--activity-server-name-color', serverName.color);
    setOrClear('--activity-server-name-font', serverName.font);
    setOrClear('--activity-server-name-weight', serverStyles.includes('bold') ? '700' : '400');
    setOrClear('--activity-server-name-style', serverStyles.includes('italic') ? 'italic' : 'normal');
    setOrClear('--activity-server-name-transform', serverStyles.includes('allcaps') ? 'uppercase' : 'none');
    setOrClear('--activity-server-name-variant', serverStyles.includes('smallcaps') ? 'small-caps' : 'normal');

    const subtextColor = mixHex(String(serverName.color || '#ffffff'), -0.30);
    setOrClear('--activity-subtext-color-derived', subtextColor);

    const decorationLevel = Number(activity.decoration_level ?? 50);
    const decorationDensity = Number(activity.decoration_density ?? 50);
    const decorationIntensity = Number(activity.decoration_intensity ?? 50);
    const decorationOpacity = sliderToUnit(decorationLevel) * sliderToUnit(decorationIntensity) * 0.09;
    const decorationTexture = getDecorationTextureFn()(decorationLevel, decorationDensity, decorationIntensity);
    rootStyle.setProperty('--activity-chassis-stripe', `rgba(255,255,255,${decorationOpacity.toFixed(4)})`);
    rootStyle.setProperty('--activity-random-decorations', decorationTexture);

    if (chartColors.readColor) {
        rootStyle.setProperty('--chart-read-color', String(chartColors.readColor));
        rootStyle.setProperty('--chart-read-dot-color', String(chartColors.readColor));
        const rgb = hexToRgbComponents(chartColors.readColor);
        if (rgb) {
            rootStyle.setProperty('--chart-read-gradient-top', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
            rootStyle.setProperty('--chart-read-gradient-bottom', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        }
    } else {
        rootStyle.removeProperty('--chart-read-color');
        rootStyle.removeProperty('--chart-read-dot-color');
        rootStyle.removeProperty('--chart-read-gradient-top');
        rootStyle.removeProperty('--chart-read-gradient-bottom');
    }

    if (chartColors.writeColor) {
        rootStyle.setProperty('--chart-write-color', String(chartColors.writeColor));
        rootStyle.setProperty('--chart-write-dot-color', String(chartColors.writeColor));
        const rgb = hexToRgbComponents(chartColors.writeColor);
        if (rgb) {
            rootStyle.setProperty('--chart-write-gradient-top', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.5)`);
            rootStyle.setProperty('--chart-write-gradient-bottom', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        }
    } else {
        rootStyle.removeProperty('--chart-write-color');
        rootStyle.removeProperty('--chart-write-dot-color');
        rootStyle.removeProperty('--chart-write-gradient-top');
        rootStyle.removeProperty('--chart-write-gradient-bottom');
    }

    setOrClear('--chart-y-axis-label-color', chartColors.yAxisLabelColor);
    setOrClear('--chart-y-axis-grid-color', chartColors.yAxisGridColor);
    setOrClear('--activity-title-color', chartColors.graphTitleColor);
    rootStyle.setProperty('--chart-graph-title-scale', sliderToScale(typography.graph_title_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-legend-text-scale', sliderToScale(typography.legend_text_size_scale).toFixed(3));
    rootStyle.setProperty('--chart-y-axis-label-font-size', `${Math.max(6, Math.round(9 * sliderToScale(typography.y_axis_label_size_scale)))}px`);
}

export function applyMenuVariables(config) {
    const menu = config?.ui?.menu || {};
    const sectionName = menu.section_name || {};
    const hasSectionNameStyle = Array.isArray(sectionName.style);
    const sectionNameStyles = Array.isArray(sectionName.style)
        ? sectionName.style.map(v => String(v).toLowerCase())
        : [];
    const controls = menu.controls || {};
    const buttons = menu.buttons || {};
    const warning = menu.warning || {};
    const rootStyle = document.documentElement.style;

    const dropdownOpacity = menu.dropdown_opacity !== undefined
        ? (0.5 + (Number(menu.dropdown_opacity) / 100) * 0.5)
        : 1.0;

    applyConfigMap(rootStyle, {
        '--menu-bg-color': menu.background,
        '--menu-border-color': menu.border,
        '--menu-text-color': menu.text,
        '--menu-button-text': menu.button_text,
        '--menu-opacity': menu.opacity,
        '--menu-dropdown-opacity': dropdownOpacity,
        '--menu-font-family': menu.font,
        '--menu-font-size': menu.size,
        '--menu-label-color': menu.label_color,
        '--menu-section-title-color': sectionName.color || menu.section_title_color,
        '--menu-section-title-size': sectionName.size,
        '--menu-section-title-weight': hasSectionNameStyle ? (sectionNameStyles.includes('bold') ? '700' : '400') : undefined,
        '--menu-section-title-style': hasSectionNameStyle ? (sectionNameStyles.includes('italic') ? 'italic' : 'normal') : undefined,
        '--menu-section-title-transform': hasSectionNameStyle ? (sectionNameStyles.includes('allcaps') ? 'uppercase' : 'none') : undefined,
        '--menu-section-title-variant': hasSectionNameStyle ? (sectionNameStyles.includes('smallcaps') ? 'small-caps' : 'normal') : undefined,
        '--menu-dropdown-bg': menu.dropdown_background,
        '--menu-dropdown-border': menu.dropdown_border,
        '--menu-dropdown-shadow': menu.dropdown_shadow,
        '--menu-control-bg': controls.background,
        '--menu-control-border': controls.border,
        '--menu-control-text': controls.text,
        '--menu-control-focus-border': controls.focus_border,
        '--menu-save-bg': buttons.save_bg,
        '--menu-save-hover-bg': buttons.save_hover_bg,
        '--menu-save-glow': buttons.save_glow,
        '--menu-revert-bg': buttons.revert_bg,
        '--menu-revert-hover-bg': buttons.revert_hover_bg,
        '--menu-revert-glow': buttons.revert_glow,
        '--menu-warning-bg': warning.background,
        '--menu-warning-border': warning.border,
        '--menu-warning-text': warning.text
    });
}

export function applyEnclosurePreview(config) {
    applyDeviceVariables(config);
}
