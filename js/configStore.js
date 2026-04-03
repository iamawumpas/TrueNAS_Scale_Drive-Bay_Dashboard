// js/configStore.js — config state, CRUD operations, path normalization

export let originalConfig = null;
export let workingConfig = null;
export let isDirty = false;

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

export function getNestedValue(obj, path) {
    if (!obj || !Array.isArray(path)) return undefined;
    return path.reduce((cur, key) => (cur && typeof cur === 'object' ? cur[key] : undefined), obj);
}

export function initConfig(config) {
    originalConfig = config;
    workingConfig = deepClone(config);
    isDirty = false;
}

export function setWorkingConfigFrom(config) {
    workingConfig = deepClone(config);
}

export function setOriginalConfigSnapshot() {
    originalConfig = deepClone(workingConfig);
}

export function markClean() {
    isDirty = false;
}

export function normalizeMenuControlValue(path, rawValue) {
    if (!Array.isArray(path) || rawValue === undefined || rawValue === null) return rawValue;
    if (path[0] !== 'devices' || path[2] !== 'bay') return rawValue;

    const key = String(path[3] || '').toLowerCase();
    const value = String(rawValue).trim().toLowerCase();

    if (key === 'layout') {
        if (value === 'horizontal' || value === 'h') return 'horizontal';
        if (value === 'vertical' || value === 'v') return 'vertical';
        return rawValue;
    }
    if (key === 'fill_order') {
        if (value === 'row_major_ltr' || value === 'ltr' || value === 'left_to_right' || value === 'horizontal') return 'left_to_right';
        if (value === 'column_major_ttb' || value === 'ttb' || value === 'top_to_bottom' || value === 'vertical') return 'top_to_bottom';
        return rawValue;
    }
    return rawValue;
}

export function getLegacyMenuFallback(path) {
    if (!Array.isArray(path) || path[0] !== 'devices' || path.length < 3) return undefined;
    const deviceKey = path[1];
    const legacyDriveSequence = getNestedValue(workingConfig, ['devices', deviceKey, 'bay', 'drive_sequence']);
    if (legacyDriveSequence === undefined || legacyDriveSequence === null) return undefined;

    const key = String(path[3] || '').toLowerCase();
    if (key === 'layout') {
        const n = normalizeMenuControlValue(path, legacyDriveSequence);
        return (n === 'horizontal' || n === 'vertical') ? n : undefined;
    }
    if (key === 'fill_order') {
        const n = normalizeMenuControlValue(path, legacyDriveSequence);
        return (n === 'left_to_right' || n === 'top_to_bottom') ? n : undefined;
    }
    return undefined;
}

export function getDefaultForMenuPath(path) {
    if (!Array.isArray(path) || path.length === 0) return undefined;
    const current = getNestedValue(workingConfig, path);
    if (current !== undefined && current !== null) return current;
    if (path[0] !== 'devices' || path.length < 3) return undefined;

    const relative = path.slice(2).join('|');

    const mapToUi = {
        'chassis|server_name|font': ['ui', 'server_name', 'font'],
        'chassis|server_name|style': ['ui', 'server_name', 'style'],
        'chassis|server_name|color': ['ui', 'server_name', 'color'],
        'chassis|pci_address|color': ['ui', 'pci_address', 'color'],
        'bay|grill_size_scale': ['ui', 'bay', 'grill_size_scale'],
        'bay|disk_pool|font': ['ui', 'disk_pool', 'font'],
        'bay|disk_pool|size': ['ui', 'disk_pool', 'size'],
        'bay|disk_pool|style': ['ui', 'disk_pool', 'style'],
        'bay|disk_pool|color': ['ui', 'disk_pool', 'color'],
        'bay|disk_index|font': ['ui', 'disk_index', 'font'],
        'bay|disk_index|size': ['ui', 'disk_index', 'size'],
        'bay|disk_index|style': ['ui', 'disk_index', 'style'],
        'bay|disk_index|color': ['ui', 'disk_index', 'color'],
        'bay|disk_serial|font': ['ui', 'disk_serial', 'font'],
        'bay|disk_serial|size': ['ui', 'disk_serial', 'size'],
        'bay|disk_serial|style': ['ui', 'disk_serial', 'style'],
        'bay|disk_serial|color': ['ui', 'disk_serial', 'color'],
        'bay|disk_size|font': ['ui', 'disk_size', 'font'],
        'bay|disk_size|size': ['ui', 'disk_size', 'size'],
        'bay|disk_size|style': ['ui', 'disk_size', 'style'],
        'bay|disk_size|color': ['ui', 'disk_size', 'color'],
        'bay|drive_temperature|font': ['ui', 'drive_temperature', 'font'],
        'bay|drive_temperature|size': ['ui', 'drive_temperature', 'size'],
        'bay|drive_temperature|style': ['ui', 'drive_temperature', 'style'],
        'bay|drive_temperature|color': ['ui', 'drive_temperature', 'color']
    };

    const literalDefaults = {
        'chassis|decoration_level': 50,
        'chassis|decoration_density': 50,
        'chassis|decoration_intensity': 50,
        'bay|layout': 'vertical',
        'bay|fill_order': 'left_to_right',
        'bay|grill_shape': 'round'
    };

    if (Object.prototype.hasOwnProperty.call(literalDefaults, relative)) return literalDefaults[relative];

    const legacyFallback = getLegacyMenuFallback(path);
    if (legacyFallback !== undefined && legacyFallback !== null) return legacyFallback;

    const uiPath = mapToUi[relative];
    if (uiPath) {
        const fallback = getNestedValue(workingConfig, uiPath);
        if (fallback !== undefined && fallback !== null) return fallback;
    }
    return undefined;
}

export function setConfigValueSilent(path, value) {
    if (!workingConfig || !Array.isArray(path) || path.length === 0 || value === undefined) return false;
    const current = getNestedValue(workingConfig, path);
    if (JSON.stringify(current) === JSON.stringify(value)) return false;

    let cursor = workingConfig;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[path[path.length - 1]] = deepClone(value);
    return true;
}

export function setConfigValue(path, value) {
    if (!workingConfig || !Array.isArray(path) || path.length === 0) return;

    let cursor = workingConfig;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
    }
    cursor[path[path.length - 1]] = value;

    // Sync derived dot-color values
    const joinedPath = path.join('|');
    if (joinedPath === 'chart|colors|readColor') {
        if (!workingConfig.chart) workingConfig.chart = {};
        if (!workingConfig.chart.colors) workingConfig.chart.colors = {};
        workingConfig.chart.colors.readDotColor = value;
    }
    if (joinedPath === 'chart|colors|writeColor') {
        if (!workingConfig.chart) workingConfig.chart = {};
        if (!workingConfig.chart.colors) workingConfig.chart.colors = {};
        workingConfig.chart.colors.writeDotColor = value;
    }

    isDirty = true;

    window.dispatchEvent(new CustomEvent('menu-config-changed', {
        detail: {
            joinedPath,
            p0: path[0],
            p1: path[1],
            workingConfig
        }
    }));
}
