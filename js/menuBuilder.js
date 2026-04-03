// js/menuBuilder.js - HTML builders for menu panels and disk-array controls

const WEB_FONTS = [
    'Calibri, Candara, Segoe UI, Optima, Arial, sans-serif',
    'Arial, Helvetica, sans-serif',
    'Verdana, Geneva, sans-serif',
    'Trebuchet MS, Helvetica, sans-serif',
    'Georgia, Times New Roman, serif',
    'Courier New, Courier, monospace',
    'Impact, Charcoal, sans-serif',
    'Comic Sans MS, cursive',
    'Tahoma, Geneva, sans-serif',
    'Palatino Linotype, Book Antiqua, Palatino, serif'
];

export function toSafeId(str) {
    return String(str || '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function htmlEscape(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function normalizeKeyLR(topologyKey, pciRaw) {
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

export function getDiskArraysMenuSignature(topology, hostname) {
    const entries = Object.entries(topology || {}).map(([topologyKey, chassisData]) => {
        const settings = chassisData?.settings || {};
        return {
            topologyKey,
            pciRaw: settings.pci_raw || topologyKey,
            arrayAddress: settings.array_address || settings.array_id || '',
            hasBackplane: Boolean(settings.has_backplane),
            maxBays: settings.max_bays || 0
        };
    });
    return JSON.stringify({ hostname: hostname || '', entries });
}

function buildColorRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    return `
        <div class="menu-control-row">
            <label class="menu-ctrl-label" for="${id}">${labelText}</label>
            <div class="menu-ctrl-right">
                <span class="color-swatch" id="${id}-swatch" data-path="${configPath.join('|')}"></span>
                <input type="color" class="hidden-color-input" id="${id}" data-path="${configPath.join('|')}">
            </div>
        </div>`;
}

function buildFontRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    const opts = WEB_FONTS.map(f => `<option value="${f}">${f.split(',')[0].trim()}</option>`).join('');
    return `
        <div class="menu-control-row">
            <label class="menu-ctrl-label" for="${id}">${labelText}</label>
            <div class="menu-ctrl-right">
                <select class="menu-font-select" id="${id}" data-path="${configPath.join('|')}">${opts}</select>
            </div>
        </div>`;
}

function buildSliderRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    return `
        <div class="menu-control-row">
            <label class="menu-ctrl-label" for="${id}">${labelText}</label>
            <div class="menu-ctrl-right menu-slider-wrap">
                <input type="range" class="menu-slider" id="${id}" data-path="${configPath.join('|')}" min="0" max="100" step="1">
                <span class="menu-slider-value" id="${id}-val">50</span>
            </div>
        </div>`;
}

function buildPxSliderRow(labelText, configPath, min = 6, max = 24, step = 1) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    return `
        <div class="menu-control-row">
            <label class="menu-ctrl-label" for="${id}">${labelText}</label>
            <div class="menu-ctrl-right menu-slider-wrap">
                <input type="range" class="menu-slider" id="${id}" data-path="${configPath.join('|')}" data-value-format="px" data-base-min="${min}" data-base-max="${max}" data-base-step="${step}" min="${min}" max="${max}" step="${step}">
                <span class="menu-slider-value" id="${id}-val">10px</span>
            </div>
        </div>`;
}

function buildMappedPxSliderRow(labelText, configPath, outMinPx, outMaxPx) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    return `
        <div class="menu-control-row">
            <label class="menu-ctrl-label" for="${id}">${labelText}</label>
            <div class="menu-ctrl-right menu-slider-wrap">
                <input type="range" class="menu-slider" id="${id}" data-path="${configPath.join('|')}" data-value-format="mapped-px" data-map-min-px="${outMinPx}" data-map-max-px="${outMaxPx}" min="0" max="100" step="1">
                <span class="menu-slider-value" id="${id}-val">${outMinPx}px</span>
            </div>
        </div>`;
}

function buildStyleCheckboxRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    const options = [
        ['normal', 'Normal'],
        ['bold', 'Bold'],
        ['italic', 'Italic'],
        ['allcaps', 'AllCaps'],
        ['smallcaps', 'SmallCaps']
    ];
    const boxes = options.map(([value, text]) => `
        <label class="menu-style-option">
            <input type="checkbox" class="menu-style-checkbox" data-style-path="${configPath.join('|')}" data-style-value="${value}" id="${id}-${value}">
            <span>${text}</span>
        </label>`).join('');
    return `
        <div class="menu-control-row menu-style-row">
            <div class="menu-ctrl-label">${labelText}</div>
            <div class="menu-ctrl-right menu-style-options">${boxes}
            </div>
        </div>`;
}

function buildBayOrientationRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    const options = [['vertical', 'Vertical'], ['horizontal', 'Horizontal']];
    const radios = options.map(([value, text]) => `
        <label class="menu-shape-option">
            <input type="radio" class="menu-shape-radio" name="${id}" data-path="${configPath.join('|')}" data-radio-value="${value}" ${value === 'vertical' ? 'data-radio-default="true"' : ''} id="${id}-${value}">
            <span>${text}</span>
        </label>`).join('');
    return `
        <div class="menu-control-row menu-shape-row">
            <div class="menu-ctrl-label">${labelText}</div>
            <div class="menu-ctrl-right menu-shape-options">${radios}</div>
        </div>`;
}

function buildBayOrderRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    const options = [['left_to_right', 'Left-to-Right'], ['top_to_bottom', 'Top-to-Bottom']];
    const radios = options.map(([value, text]) => `
        <label class="menu-shape-option">
            <input type="radio" class="menu-shape-radio" name="${id}" data-path="${configPath.join('|')}" data-radio-value="${value}" ${value === 'left_to_right' ? 'data-radio-default="true"' : ''} id="${id}-${value}">
            <span>${text}</span>
        </label>`).join('');
    return `
        <div class="menu-control-row menu-shape-row">
            <div class="menu-ctrl-label">${labelText}</div>
            <div class="menu-ctrl-right menu-shape-options">${radios}</div>
        </div>`;
}

function buildGrillShapeRow(labelText, configPath) {
    const id = 'mc-' + toSafeId(configPath.join('-'));
    const shapes = [['solid', 'Solid'], ['round', 'Round'], ['square', 'Square'], ['triangle', 'Triangle'], ['hexagonal', 'Hex']];
    const radios = shapes.map(([value, text]) => `
        <label class="menu-shape-option">
            <input type="radio" class="menu-shape-radio" name="${id}" data-path="${configPath.join('|')}" data-radio-value="${value}" ${value === 'round' ? 'data-radio-default="true"' : ''} id="${id}-${value}">
            <span>${text}</span>
        </label>`).join('');
    return `
        <div class="menu-control-row menu-shape-row">
            <div class="menu-ctrl-label">${labelText}</div>
            <div class="menu-ctrl-right menu-shape-options">${radios}</div>
        </div>`;
}

export function buildDashboardPanel() {
    return `
        <div class="dropdown-panel" id="dashboard-panel">
            <div class="panel-section">
                <div class="panel-section-title">Page</div>
                ${buildColorRow('Background Color', ['ui', 'environment', 'page_bg_color'])}
            </div>
            <div class="panel-section">
                <div class="panel-section-title">Menu</div>
                ${buildColorRow('Background Color', ['ui', 'menu', 'background'])}
                ${buildColorRow('Text Color', ['ui', 'menu', 'text'])}
                ${buildFontRow('Font', ['ui', 'menu', 'font'])}
                <div class="panel-subsection">
                    <div class="panel-subsection-title">Section Name</div>
                    ${buildColorRow('Colour', ['ui', 'menu', 'section_name', 'color'])}
                    ${buildPxSliderRow('Font Size', ['ui', 'menu', 'section_name', 'size'], 8, 24, 1)}
                    ${buildStyleCheckboxRow('Font Style', ['ui', 'menu', 'section_name', 'style'])}
                </div>
                ${buildColorRow('Control Background Colour', ['ui', 'menu', 'controls', 'background'])}
                ${buildColorRow('Control Highlight Colour', ['ui', 'menu', 'controls', 'focus_border'])}
                ${buildSliderRow('Dropdown Transparency', ['ui', 'menu', 'dropdown_opacity'])}
            </div>
            <div class="panel-section">
                <div class="panel-section-title">Reset</div>
                <div class="menu-control-row menu-action-row">
                    <div class="menu-ctrl-label">Restore all defaults</div>
                    <div class="menu-ctrl-right">
                        <button class="menu-action-btn menu-reset-btn" id="menu-reset-btn" type="button">RESET ALL</button>
                    </div>
                </div>
                <div class="menu-reset-note">Rewrites config.json from service defaults. Hard refresh runs in 3s.</div>
            </div>
            <div class="panel-section">
                <div class="panel-section-title">Repository Sync</div>
                <div class="menu-control-row menu-style-row repo-sync-toggle-row">
                    <div class="menu-ctrl-right menu-style-options">
                        <label class="menu-style-option repo-sync-option">
                            <input type="checkbox" id="menu-repo-sync-enabled" data-path="ui|menu|repo_sync|enabled">
                            <span>Allow manual update checks and downloading and restoring of missing file(s)</span>
                        </label>
                    </div>
                </div>
                <div class="menu-control-row menu-action-row repo-sync-action-row">
                    <div class="menu-ctrl-label">Repository Actions</div>
                    <div class="menu-ctrl-right repo-sync-action-buttons">
                        <button class="menu-action-btn repo-sync-action-btn" id="menu-repo-check-btn" type="button">CHECK UPDATES</button>
                        <button class="menu-action-btn repo-sync-action-btn" id="menu-repo-restore-btn" type="button">RESTORE MISSING FILES</button>
                    </div>
                </div>
                <div class="menu-reset-note" id="menu-repo-sync-status">Repo sync disabled.</div>
            </div>
        </div>`;
}

export function buildActivityMonitorPanel() {
    return `
        <div class="dropdown-panel activity-monitor-panel" id="activity-monitor-panel">
            <div class="panel-section">
                <div class="panel-section-title">Graphs</div>
                ${buildColorRow('Read Colour', ['chart', 'colors', 'readColor'])}
                ${buildColorRow('Write Colour', ['chart', 'colors', 'writeColor'])}
                ${buildColorRow('Grid Colour', ['chart', 'colors', 'yAxisGridColor'])}
                <div class="panel-subsection">
                    <div class="panel-subsection-title">Graph Title</div>
                    ${buildSliderRow('Font Size', ['chart', 'typography', 'graph_title_size_scale'])}
                    ${buildColorRow('Colour', ['chart', 'colors', 'graphTitleColor'])}
                </div>
                <div class="panel-subsection">
                    <div class="panel-subsection-title">y-axis Label</div>
                    ${buildSliderRow('Font Size', ['chart', 'typography', 'y_axis_label_size_scale'])}
                    ${buildColorRow('Colour', ['chart', 'colors', 'yAxisLabelColor'])}
                </div>
                <div class="panel-subsection">
                    <div class="panel-subsection-title">Legend Text</div>
                    ${buildSliderRow('Font Size', ['chart', 'typography', 'legend_text_size_scale'])}
                    ${buildColorRow('Colour', ['ui', 'activity', 'legend_color'])}
                </div>
                <div class="panel-subsection panel-subsection-last">
                    <div class="panel-subsection-title">Manual Size</div>
                    ${buildMappedPxSliderRow('Height', ['chart', 'dimensions', 'chartHeight'], 25, 150)}
                    ${buildMappedPxSliderRow('Length', ['chart', 'dimensions', 'cardWidth'], 100, 500)}
                </div>
            </div>
            <div class="panel-section">
                <div class="panel-section-title">Chassis</div>
                ${buildColorRow('Colour', ['ui', 'activity', 'chassis_color'])}
                ${buildSliderRow('Decoration Level', ['ui', 'activity', 'decoration_level'])}
                ${buildSliderRow('Decoration Density', ['ui', 'activity', 'decoration_density'])}
                ${buildSliderRow('Decoration Intensity', ['ui', 'activity', 'decoration_intensity'])}
                <div class="panel-subsection">
                    <div class="panel-subsection-title">Server Name</div>
                    ${buildFontRow('Font Name', ['ui', 'activity', 'server_name', 'font'])}
                    ${buildStyleCheckboxRow('Font Style', ['ui', 'activity', 'server_name', 'style'])}
                    ${buildColorRow('Colour', ['ui', 'activity', 'server_name', 'color'])}
                </div>
            </div>
        </div>`;
}

export function buildDiskArraysPanel(topology, hostname) {
    let panelSections = '';
    Object.entries(topology || {}).forEach(([topologyKey, chassisData]) => {
        const settings = chassisData?.settings || {};
        const pciRaw = settings.pci_raw || topologyKey;
        const key = normalizeKeyLR(topologyKey, pciRaw);
        const arrayAddress = settings.array_address || settings.array_id || '';
        const hasBackplane = Boolean(settings.has_backplane);
        const caption = hasBackplane ? 'Backplane Enclosure' : 'Direct-Attach Enclosure';
        const enclosureId = arrayAddress ? `${pciRaw} / ${arrayAddress}` : pciRaw;

        panelSections += `
            <div class="da-enclosure" data-key="${htmlEscape(key)}">
                <button class="da-enclosure-header" type="button">
                    <span class="da-toggle">&#9654;</span>
                    <div class="da-enclosure-title">
                        <span class="da-enclosure-name">${htmlEscape(hostname)}<span class="da-enclosure-caption">${htmlEscape(caption)}</span></span>
                        <span class="da-enclosure-addr">${htmlEscape(enclosureId)}</span>
                    </div>
                </button>
                <div class="da-enclosure-body" hidden>
                    <div class="panel-section">
                        <div class="panel-section-title">Chassis</div>
                        ${buildColorRow('Colour', ['devices', key, 'chassis', 'color'])}
                        ${buildSliderRow('Decoration Level', ['devices', key, 'chassis', 'decoration_level'])}
                        ${buildSliderRow('Decoration Density', ['devices', key, 'chassis', 'decoration_density'])}
                        ${buildSliderRow('Decoration Intensity', ['devices', key, 'chassis', 'decoration_intensity'])}
                    </div>
                    <div class="panel-section">
                        <div class="panel-section-title">Drive Bay</div>
                        ${buildBayOrientationRow('Bay Orientation', ['devices', key, 'bay', 'layout'])}
                        ${buildBayOrderRow('Bay Order', ['devices', key, 'bay', 'fill_order'])}
                        ${buildColorRow('Door Colour', ['devices', key, 'bay', 'door_color'])}
                        ${buildGrillShapeRow('Shape', ['devices', key, 'bay', 'grill_shape'])}
                        ${buildSliderRow('Grill Size', ['devices', key, 'bay', 'grill_size_scale'])}
                    </div>
                </div>
            </div>`;
    });

    return `
        <button class="menu-button" id="disk-arrays-menu-btn" type="button">Disk Arrays</button>
        <div class="dropdown-panel disk-arrays-panel" id="disk-arrays-panel">
            ${panelSections}
        </div>`;
}

export function buildMenuBarMarkup() {
    return `
        <div class="menu-container">
            <div class="menu-left-group">
                <div class="menu-dropdown-wrapper">
                    <button class="menu-button" id="dashboard-menu-btn" type="button">Dashboard</button>
                    ${buildDashboardPanel()}
                </div>
                <div class="menu-dropdown-wrapper">
                    <button class="menu-button" id="activity-monitor-menu-btn" type="button">Activity Monitor</button>
                    ${buildActivityMonitorPanel()}
                </div>
            </div>
            <div class="menu-right-group">
                <button class="menu-button legend-menu-btn" id="legend-menu-btn" type="button">Legend</button>
                <div class="menu-buttons">
                    <button class="save-btn" id="menu-save-btn" disabled>SAVE</button>
                    <button class="revert-btn" id="menu-revert-btn" disabled>REVERT</button>
                </div>
            </div>
        </div>
    `;
}
