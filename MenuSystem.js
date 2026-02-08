// MenuSystem.js - Dynamic menu for customizing dashboard settings

export class MenuSystem {
    constructor(topology, currentConfig) {
        this.topology = topology;
        this.currentConfig = currentConfig;
        this.originalConfig = JSON.parse(JSON.stringify(currentConfig)); // Deep copy
        this.selectedDevice = null;
        this.isDirty = false;
        this.webSafeFonts = [
            'Arial',
            'Bookman',
            'Comic Sans MS',
            'Courier New',
            'Garamond',
            'Georgia',
 	    'Helvetica',
            'Impact',
            'Lucida Console',
            'Palatino',
            'Tahoma',
	    'Times New Roman',            
            'Trebuchet MS',
	    'Verdana'
        ];
        this.devices = Object.keys(topology);
        this.init();
    }

    init() {
        this.render();
        this.applyChangesToUI();
    }

    render() {
        const menuContainer = document.getElementById('menu-bar');
        if (!menuContainer) {
            const container = document.createElement('div');
            container.id = 'menu-bar';
            document.body.insertBefore(container, document.body.firstChild);
        }

        const { html, dropdownHTML } = this.buildMenuHTML();
        document.getElementById('menu-bar').innerHTML = html;
        
        // Append dropdowns directly to body to escape menu-bar stacking context
        dropdownHTML.forEach((dropdownHtml, idx) => {
            const temp = document.createElement('div');
            temp.innerHTML = dropdownHtml;
            const element = temp.firstElementChild;
            document.body.appendChild(element);
        });
        
        this.attachEventListeners();
    }

    buildMenuHTML() {
        let menuHTML = '<div class="menu-container">';

        // Device selector (if multiple devices)
        if (this.devices.length > 1) {
            const deviceLabel = this.selectedDevice || this.devices[0];
            this.selectedDevice = this.selectedDevice || this.devices[0];
            menuHTML += `
                <div class="menu-item dropdown">
                    <button class="menu-button">${deviceLabel}</button>
                    <div class="dropdown-content">
                        ${this.devices.map(dev => `
                            <a href="#" data-device="${dev}" class="device-selector ${dev === this.selectedDevice ? 'active' : ''}">
                                ${dev}
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (this.devices.length === 1) {
            this.selectedDevice = this.devices[0];
        }

        // Chassis menu
        const chassisPanel = this.buildChassisPanel();
        menuHTML += `
            <div class="menu-item dropdown" data-dropdown="chassis">
                <button class="menu-button">Chassis Settings</button>
            </div>
        `;

        // Bay Settings menu
        const bayPanel = this.buildBayPanel();
        menuHTML += `
            <div class="menu-item dropdown" data-dropdown="bay">
                <button class="menu-button">Bay Settings</button>
            </div>
        `;

        // Environment menu
        const environmentPanel = this.buildEnvironmentPanel();
        menuHTML += `
            <div class="menu-item dropdown" data-dropdown="environment">
                <button class="menu-button">Dashboard Settings</button>
            </div>
        `;

        menuHTML += '</div>';
        
        // Build dropdown HTML separately - will be appended to body
        const dropdownHTML = [
            `<div class="dropdown-content chassis-panel" data-dropdown-content="chassis">${chassisPanel}</div>`,
            `<div class="dropdown-content bay-panel" data-dropdown-content="bay">${bayPanel}</div>`,
            `<div class="dropdown-content environment-panel" data-dropdown-content="environment">${environmentPanel}</div>`
        ];

        // Save and Revert buttons (appear only when dirty)
        if (this.isDirty) {
            menuHTML += `
                <div class="menu-buttons">
                    <button id="save-btn" class="save-btn">SAVE</button>
                    <button id="revert-btn" class="revert-btn">REVERT</button>
                </div>
            `;
        }

        menuHTML += '</div>';
        return { html: menuHTML, dropdownHTML };
    }

    buildChassisPanel() {
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const chassis = deviceConfig.chassis || {};

        return `
            <div class="panel-section">
                <h3>Chassis Appearance</h3>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Background Color</label>
                        <input type="color" class="color-picker" data-key="chassis.background_base" 
                            value="${this.hexToColor(chassis.background_base || '#1a1a1a')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="chassis.background_opacity" 
                            value="${chassis.background_opacity || '1'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Border Color</label>
                        <input type="color" class="color-picker" data-key="chassis.border" 
                            value="${this.hexToColor(chassis.border || '#333333')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="chassis.border_opacity" 
                            value="${chassis.border_opacity || '1'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Shadow Color</label>
                        <input type="color" class="color-picker" data-key="chassis.shadow" 
                            value="${this.hexToColor(chassis.shadow || 'rgba(0,0,0,0.8)')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="chassis.shadow_opacity" 
                            value="${chassis.shadow_opacity || '0.8'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Header Divider Color</label>
                        <input type="color" class="color-picker" data-key="chassis.header_divider" 
                            value="${this.hexToColor(chassis.header_divider || 'rgba(255,255,255,0.1)')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="chassis.header_divider_opacity" 
                            value="${chassis.header_divider_opacity || '0.1'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <label>Scratch Mask Opacity</label>
                <input type="range" class="range-slider" data-key="chassis.scratch_opacity" 
                    value="${chassis.scratch_opacity || '0.3'}" min="0" max="1" step="0.1">
            </div>

            <div class="panel-section">
                <h3>Font & Text</h3>

                <div class="inline-row">
                    <div class="inline-field" style="flex: 0.45; min-width: 100px;">
                        <label>Font</label>
                        <select class="font-select" data-key="chassis.font" style="width: 100%; max-width: 120px;">
                            ${this.webSafeFonts.map(f => `
                                <option value="${f}" ${(chassis.font === f) ? 'selected' : ''}>
                                    ${f}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="inline-field" style="flex: 0.2; min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <label style="text-align: center; width: 100%; margin-bottom: 4px;">Color</label>
                        <input type="color" class="color-picker" data-key="chassis.font_color" 
                            value="${this.hexToColor(chassis.font_color || '#ffffff')}" style="width: 32px; height: 32px; cursor: pointer;">
                    </div>

                    <div class="inline-field" style="flex: 0.35; min-width: 80px;">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="chassis.font_size" 
                            value="${chassis.font_size_scale || '50'}" min="0" max="100" step="1">
                    </div>
                </div>

                <label>Text Styles</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" class="style-checkbox" data-key="chassis.style" data-style="bold" 
                        ${chassis.style?.includes('bold') ? 'checked' : ''}> Bold</label>
                    <label><input type="checkbox" class="style-checkbox" data-key="chassis.style" data-style="italic" 
                        ${chassis.style?.includes('italic') ? 'checked' : ''}> Italic</label>
                </div>

                <label>Text Transform</label>
                <div class="radio-group">
                    <label><input type="radio" class="transform-radio" data-key="chassis.style" data-style="none" name="chassis-transform"
                        ${!chassis.style?.includes('allcaps') && !chassis.style?.includes('smallcaps') && !chassis.style?.includes('nocaps') ? 'checked' : ''}> Normal</label>
                    <label><input type="radio" class="transform-radio" data-key="chassis.style" data-style="nocaps" name="chassis-transform"
                        ${chassis.style?.includes('nocaps') ? 'checked' : ''}> no caps</label>
                    <label style="font-variant: small-caps;"><input type="radio" class="transform-radio" data-key="chassis.style" data-style="smallcaps" name="chassis-transform"
                        ${chassis.style?.includes('smallcaps') ? 'checked' : ''}> Small Caps</label>
                    <label style="text-transform: uppercase;"><input type="radio" class="transform-radio" data-key="chassis.style" data-style="allcaps" name="chassis-transform"
                        ${chassis.style?.includes('allcaps') ? 'checked' : ''}> All Caps</label>
                </div>
            </div>

            <div class="panel-section">
                <h3>Layout</h3>

                <label>Rows of Bays</label>
                <input type="number" class="number-input" data-key="chassis.rows" 
                    value="${chassis.rows || 1}" min="1" max="10">

                <label>Bays per Row (1-${this.getMaxBaysForDevice(this.selectedDevice)})</label>
                <input type="number" class="number-input" data-key="chassis.bays_per_row" 
                    value="${chassis.bays_per_row || 4}" min="1" max="${this.getMaxBaysForDevice(this.selectedDevice)}">
            </div>
        `;
    }

    buildEnvironmentPanel() {
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const environment = deviceConfig.environment || {};
        const flareAngleValue = this.getAngleValue(environment.flare_angle, 30);
        const port = this.currentConfig.network?.port || 8010;

        return `
            <div class="panel-section">
                <h3>Network Settings</h3>
                
                <label>Listening Port</label>
                <div class="inline-row">
                    <input type="number" class="port-input" data-key="network.port" 
                        value="${port}" min="1024" max="65535" step="1">
                    <span class="port-info" style="margin-left: 16px; font-size: 0.85rem; color: #999;">
                        (Restart required after change)
                    </span>
                </div>
            </div>

            <div class="panel-section">
                <h3>Page Background</h3>

                <label>Background Color</label>
                <input type="color" class="color-picker" data-key="environment.page_bg_color" 
                    value="${this.hexToColor(environment.page_bg_color || '#0a0a0a')}">
            </div>

            <div class="panel-section">
                <h3>Menu Styling</h3>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Menu Background</label>
                        <input type="color" class="color-picker" data-key="environment.menu_bg_color" 
                            value="${this.hexToColor(environment.menu_bg_color || '#2a2a2a')}">
                    </div>

                    <div class="inline-field">
                        <label>Menu Text Color</label>
                        <input type="color" class="color-picker" data-key="environment.menu_text_color" 
                            value="${this.hexToColor(environment.menu_text_color || '#ffffff')}">
                    </div>
                </div>

                <label>Menu Opacity</label>
                <input type="range" class="range-slider" data-key="environment.menu_opacity" 
                    value="${environment.menu_opacity || '100'}" min="0" max="100" step="1">
            </div>

            <div class="panel-section">
                <h3>Light Flare Effect</h3>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Flare Color</label>
                        <input type="color" class="color-picker" data-key="environment.flare_color" 
                            value="${this.hexToColor(environment.flare_color || '#ffffff')}">
                    </div>

                    <div class="inline-field">
                        <label>Angle</label>
                        <input type="range" class="range-slider" data-key="environment.flare_angle" 
                            value="${flareAngleValue}" min="0" max="360" step="1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Offset X (%)</label>
                        <input type="range" class="range-slider" data-key="environment.flare_offset_x" 
                            value="${environment.flare_offset_x || '10'}" min="-100" max="200" step="5">
                    </div>

                    <div class="inline-field">
                        <label>Offset Y (%)</label>
                        <input type="range" class="range-slider" data-key="environment.flare_offset_y" 
                            value="${environment.flare_offset_y || '10'}" min="-100" max="200" step="5">
                    </div>
                </div>

                <div class="inline-row compact">
                    <div class="inline-field">
                        <label>Intensity</label>
                        <input type="range" class="range-slider" data-key="environment.flare_opacity" 
                            value="${environment.flare_opacity || '0.15'}" min="0" max="0.3" step="0.01">
                    </div>

                    <div class="inline-field">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="environment.flare_size" 
                            value="${environment.flare_size || '50'}" min="0" max="100" step="1">
                    </div>

                    <div class="inline-field">
                        <label>Shape</label>
                        <input type="range" class="range-slider" data-key="environment.flare_shape" 
                            value="${environment.flare_shape || '50'}" min="0" max="100" step="1">
                    </div>
                </div>
            </div>
        `;
    }

    buildBayPanel() {
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const bay = deviceConfig.bay || {};

        return `
            <div class="panel-section">
                <h3>Bay Appearance</h3>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Background Color</label>
                        <input type="color" class="color-picker" data-key="bay.background_base" 
                            value="${this.hexToColor(bay.background_base || '#121212')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="bay.background_opacity" 
                            value="${bay.background_opacity || '1'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Border Color</label>
                        <input type="color" class="color-picker" data-key="bay.border" 
                            value="${this.hexToColor(bay.border || '#333333')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="bay.border_opacity" 
                            value="${bay.border_opacity || '1'}" min="0" max="1" step="0.1">
                    </div>
                </div>

                <div class="inline-row">
                    <div class="inline-field">
                        <label>Top Border Color</label>
                        <input type="color" class="color-picker" data-key="bay.top_border" 
                            value="${this.hexToColor(bay.top_border || '#444444')}">
                    </div>
                    <div class="inline-field">
                        <label>Opacity</label>
                        <input type="range" class="range-slider" data-key="bay.top_border_opacity" 
                            value="${bay.top_border_opacity || '1'}" min="0" max="1" step="0.1">
                    </div>
                </div>
            </div>

            <div class="panel-section">
                <h3>Grill Pattern</h3>

                <label>Honeycomb Size</label>
                <input type="range" class="range-slider" data-key="bay.grill_size_scale" 
                    value="${bay.grill_size_scale || '50'}" min="0" max="100" step="1">
            </div>

            <div class="panel-section">
                <h3>Pool Name (POOL)</h3>

                <div class="inline-row">
                    <div class="inline-field" style="flex: 0.45; min-width: 100px;">
                        <label>Font</label>
                        <select class="font-select" data-key="bay.pool_font">
                            ${this.webSafeFonts.map(f => `
                                <option value="${f}" ${(bay.pool_font === f) ? 'selected' : ''}>
                                    ${f}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="inline-field" style="flex: 0.2; min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <label style="text-align: center; width: 100%; margin-bottom: 4px;">Color</label>
                        <input type="color" class="color-picker" data-key="bay.pool_color" 
                            value="${this.hexToColor(bay.pool_color || '#ffffff')}" style="width: 32px; height: 32px; cursor: pointer;">
                    </div>

                    <div class="inline-field" style="flex: 0.35; min-width: 80px;">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="bay.pool_size_scale" 
                            value="${bay.pool_size_scale || '50'}" min="0" max="100" step="1">
                    </div>
                </div>

                <label>Text Styles</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.pool_style" data-style="bold" 
                        ${bay.pool_style?.includes('bold') ? 'checked' : ''}> Bold</label>
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.pool_style" data-style="italic" 
                        ${bay.pool_style?.includes('italic') ? 'checked' : ''}> Italic</label>
                </div>

                <label>Text Transform</label>
                <div class="radio-group">
                    <label><input type="radio" class="transform-radio" data-key="bay.pool_style" data-style="none" name="bay-pool-transform"
                        ${!bay.pool_style?.includes('allcaps') && !bay.pool_style?.includes('smallcaps') && !bay.pool_style?.includes('nocaps') ? 'checked' : ''}> Normal</label>
                    <label><input type="radio" class="transform-radio" data-key="bay.pool_style" data-style="nocaps" name="bay-pool-transform"
                        ${bay.pool_style?.includes('nocaps') ? 'checked' : ''}> no caps</label>
                    <label style="font-variant: small-caps;"><input type="radio" class="transform-radio" data-key="bay.pool_style" data-style="smallcaps" name="bay-pool-transform"
                        ${bay.pool_style?.includes('smallcaps') ? 'checked' : ''}> Small Caps</label>
                    <label style="text-transform: uppercase;"><input type="radio" class="transform-radio" data-key="bay.pool_style" data-style="allcaps" name="bay-pool-transform"
                        ${bay.pool_style?.includes('allcaps') ? 'checked' : ''}> All Caps</label>
                </div>
            </div>

            <div class="panel-section">
                <h3>Disk Number (IDX)</h3>

                <div class="inline-row">
                    <div class="inline-field" style="flex: 0.45; min-width: 100px;">
                        <label>Font</label>
                        <select class="font-select" data-key="bay.idx_font">
                            ${this.webSafeFonts.map(f => `
                                <option value="${f}" ${(bay.idx_font === f) ? 'selected' : ''}>
                                    ${f}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="inline-field" style="flex: 0.2; min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <label style="text-align: center; width: 100%; margin-bottom: 4px;">Color</label>
                        <input type="color" class="color-picker" data-key="bay.idx_color" 
                            value="${this.hexToColor(bay.idx_color || '#00ffff')}" style="width: 32px; height: 32px; cursor: pointer;">
                    </div>

                    <div class="inline-field" style="flex: 0.35; min-width: 80px;">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="bay.idx_size_scale" 
                            value="${bay.idx_size_scale || '50'}" min="0" max="100" step="1">
                    </div>
                </div>

                <label>Text Styles</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.idx_style" data-style="bold" 
                        ${bay.idx_style?.includes('bold') ? 'checked' : ''}> Bold</label>
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.idx_style" data-style="italic" 
                        ${bay.idx_style?.includes('italic') ? 'checked' : ''}> Italic</label>
                </div>

                <label>Text Transform</label>
                <div class="radio-group">
                    <label><input type="radio" class="transform-radio" data-key="bay.idx_style" data-style="none" name="bay-idx-transform"
                        ${!bay.idx_style?.includes('allcaps') && !bay.idx_style?.includes('smallcaps') && !bay.idx_style?.includes('nocaps') ? 'checked' : ''}> Normal</label>
                    <label><input type="radio" class="transform-radio" data-key="bay.idx_style" data-style="nocaps" name="bay-idx-transform"
                        ${bay.idx_style?.includes('nocaps') ? 'checked' : ''}> no caps</label>
                    <label style="font-variant: small-caps;"><input type="radio" class="transform-radio" data-key="bay.idx_style" data-style="smallcaps" name="bay-idx-transform"
                        ${bay.idx_style?.includes('smallcaps') ? 'checked' : ''}> Small Caps</label>
                    <label style="text-transform: uppercase;"><input type="radio" class="transform-radio" data-key="bay.idx_style" data-style="allcaps" name="bay-idx-transform"
                        ${bay.idx_style?.includes('allcaps') ? 'checked' : ''}> All Caps</label>
                </div>
            </div>

            <div class="panel-section">
                <h3>Disk Serial (SN)</h3>

                <div class="inline-row">
                    <div class="inline-field" style="flex: 0.45; min-width: 100px;">
                        <label>Font</label>
                        <select class="font-select" data-key="bay.sn_font">
                            ${this.webSafeFonts.map(f => `
                                <option value="${f}" ${(bay.sn_font === f) ? 'selected' : ''}>
                                    ${f}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="inline-field" style="flex: 0.2; min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <label style="text-align: center; width: 100%; margin-bottom: 4px;">Color</label>
                        <input type="color" class="color-picker" data-key="bay.sn_color" 
                            value="${this.hexToColor(bay.sn_color || '#ffff00')}" style="width: 32px; height: 32px; cursor: pointer;">
                    </div>

                    <div class="inline-field" style="flex: 0.35; min-width: 80px;">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="bay.sn_size_scale" 
                            value="${bay.sn_size_scale || '50'}" min="0" max="100" step="1">
                    </div>
                </div>

                <label>Text Styles</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.sn_style" data-style="bold" 
                        ${bay.sn_style?.includes('bold') ? 'checked' : ''}> Bold</label>
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.sn_style" data-style="italic" 
                        ${bay.sn_style?.includes('italic') ? 'checked' : ''}> Italic</label>
                </div>

                <label>Text Transform</label>
                <div class="radio-group">
                    <label><input type="radio" class="transform-radio" data-key="bay.sn_style" data-style="none" name="bay-sn-transform"
                        ${!bay.sn_style?.includes('allcaps') && !bay.sn_style?.includes('smallcaps') && !bay.sn_style?.includes('nocaps') ? 'checked' : ''}> Normal</label>
                    <label><input type="radio" class="transform-radio" data-key="bay.sn_style" data-style="nocaps" name="bay-sn-transform"
                        ${bay.sn_style?.includes('nocaps') ? 'checked' : ''}> no caps</label>
                    <label style="font-variant: small-caps;"><input type="radio" class="transform-radio" data-key="bay.sn_style" data-style="smallcaps" name="bay-sn-transform"
                        ${bay.sn_style?.includes('smallcaps') ? 'checked' : ''}> Small Caps</label>
                    <label style="text-transform: uppercase;"><input type="radio" class="transform-radio" data-key="bay.sn_style" data-style="allcaps" name="bay-sn-transform"
                        ${bay.sn_style?.includes('allcaps') ? 'checked' : ''}> All Caps</label>
                </div>
            </div>

            <div class="panel-section">
                <h3>Disk Size (SIZE)</h3>

                <div class="inline-row">
                    <div class="inline-field" style="flex: 0.45; min-width: 100px;">
                        <label>Font</label>
                        <select class="font-select" data-key="bay.size_font">
                            ${this.webSafeFonts.map(f => `
                                <option value="${f}" ${(bay.size_font === f) ? 'selected' : ''}>
                                    ${f}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="inline-field" style="flex: 0.2; min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <label style="text-align: center; width: 100%; margin-bottom: 4px;">Color</label>
                        <input type="color" class="color-picker" data-key="bay.size_color" 
                            value="${this.hexToColor(bay.size_color || '#ff00ff')}" style="width: 32px; height: 32px; cursor: pointer;">
                    </div>

                    <div class="inline-field" style="flex: 0.35; min-width: 80px;">
                        <label>Size</label>
                        <input type="range" class="range-slider" data-key="bay.size_size_scale" 
                            value="${bay.size_size_scale || '50'}" min="0" max="100" step="1">
                    </div>
                </div>

                <label>Text Styles</label>
                <div class="checkbox-group">
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.size_style" data-style="bold" 
                        ${bay.size_style?.includes('bold') ? 'checked' : ''}> Bold</label>
                    <label><input type="checkbox" class="style-checkbox" data-key="bay.size_style" data-style="italic" 
                        ${bay.size_style?.includes('italic') ? 'checked' : ''}> Italic</label>
                </div>

                <label>Text Transform</label>
                <div class="radio-group">
                    <label><input type="radio" class="transform-radio" data-key="bay.size_style" data-style="none" name="bay-size-transform"
                        ${!bay.size_style?.includes('allcaps') && !bay.size_style?.includes('smallcaps') && !bay.size_style?.includes('nocaps') ? 'checked' : ''}> Normal</label>
                    <label><input type="radio" class="transform-radio" data-key="bay.size_style" data-style="nocaps" name="bay-size-transform"
                        ${bay.size_style?.includes('nocaps') ? 'checked' : ''}> no caps</label>
                    <label style="font-variant: small-caps;"><input type="radio" class="transform-radio" data-key="bay.size_style" data-style="smallcaps" name="bay-size-transform"
                        ${bay.size_style?.includes('smallcaps') ? 'checked' : ''}> Small Caps</label>
                    <label style="text-transform: uppercase;"><input type="radio" class="transform-radio" data-key="bay.size_style" data-style="allcaps" name="bay-size-transform"
                        ${bay.size_style?.includes('allcaps') ? 'checked' : ''}> All Caps</label>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        // Menu dropdown click handlers - only open on click
        const menuButtons = document.querySelectorAll('.menu-button');
        menuButtons.forEach((btn, idx) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const menuItem = btn.closest('.menu-item');
                const dropdownType = menuItem.dataset.dropdown;
                const dropdown = document.querySelector(`[data-dropdown-content="${dropdownType}"]`);
                
                if (dropdown) {
                    // Close all other dropdowns
                    document.querySelectorAll('.dropdown-content').forEach(d => {
                        if (d !== dropdown) {
                            d.classList.remove('active');
                        }
                    });
                    // Toggle this dropdown
                    dropdown.classList.toggle('active');
                    
                    // Position the fixed dropdown below the button
                    if (dropdown.classList.contains('active')) {
                        const rect = btn.getBoundingClientRect();
                        dropdown.style.top = (rect.bottom + 4) + 'px';
                        dropdown.style.left = rect.left + 'px';
                    }
                }
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            // Don't close if clicking on a menu button, dropdown content, or action buttons
            const isMenuButton = e.target.closest('.menu-button');
            const isDropdownContent = e.target.closest('.dropdown-content');
            const isSaveBtn = e.target.closest('#save-btn');
            const isRevertBtn = e.target.closest('#revert-btn');
            
            if (!isMenuButton && !isDropdownContent && !isSaveBtn && !isRevertBtn) {
                document.querySelectorAll('.dropdown-content').forEach(d => {
                    d.classList.remove('active');
                });
            }
        });

        // Device selector
        document.querySelectorAll('.device-selector').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const newDevice = e.target.dataset.device;
                if (this.isDirty) {
                    const choice = confirm('You have unsaved changes. Save before switching devices?');
                    if (choice) {
                        this.save();
                    } else {
                        this.revert();
                    }
                }
                this.selectedDevice = newDevice;
                this.render();
            });
        });

        // Color pickers - use 'input' for real-time preview
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleColorChange(e);
            });
        });

        // Font selects - use 'change' for select elements
        const fontSelects = document.querySelectorAll('.font-select');
        fontSelects.forEach(select => {
            select.addEventListener('change', (e) => {
                this.handleInputChange(e);
            });
        });

        // Text inputs - use 'input' for real-time preview
        const textInputs = document.querySelectorAll('.text-input');
        textInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleInputChange(e);
            });
        });

        // Number inputs - use 'input' for real-time preview
        const numberInputs = document.querySelectorAll('.number-input');
        numberInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleInputChange(e);
            });
        });

        // Range sliders - use 'input' for real-time preview
        const rangeSliders = document.querySelectorAll('.range-slider');
        rangeSliders.forEach(input => {
            input.addEventListener('input', (e) => {
                this.handleInputChange(e);
            });
        });

        // Style checkboxes - use 'change'
        const styleCheckboxes = document.querySelectorAll('.style-checkbox');
        styleCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleStyleCheckbox(e);
            });
        });

        // Transform radios - use 'change'
        const transformRadios = document.querySelectorAll('.transform-radio');
        transformRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.handleTransformRadio(e);
            });
        });

        // Flare toggle - use 'change'
        const flareToggles = document.querySelectorAll('.flare-toggle');
        flareToggles.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.handleInputChange(e);
            });
        });

        // Port input - use 'input' for real-time validation
        const portInputs = document.querySelectorAll('.port-input');
        portInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const port = parseInt(e.target.value);
                if (port >= 1024 && port <= 65535) {
                    this.handleInputChange(e);
                }
            });
        });

        // Save button
        const saveBtn = document.getElementById('save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.save();
            });
        }

        // Revert button
        const revertBtn = document.getElementById('revert-btn');
        if (revertBtn) {
            revertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.revert();
            });
        }
    }

    handleColorChange(e) {
        const key = e.target.dataset.key;
        const value = e.target.value;
        this.setConfigValue(key, value);
        this.applyChangesToUI();
        this.markDirty();
    }

    handleInputChange(e) {
        const key = e.target.dataset.key;
        let value = e.target.value;

        // Handle checkboxes
        if (e.target.type === 'checkbox') {
            value = e.target.checked;
        }

        this.setConfigValue(key, value);
        this.applyChangesToUI();
        this.markDirty();
    }

    handleStyleCheckbox(e) {
        const key = e.target.dataset.key;
        const style = e.target.dataset.style;
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const keyPath = key.split('.');
        let obj = deviceConfig;

        // Navigate to the parent object
        for (let i = 0; i < keyPath.length - 1; i++) {
            if (!obj[keyPath[i]]) obj[keyPath[i]] = {};
            obj = obj[keyPath[i]];
        }

        if (!obj[keyPath[keyPath.length - 1]]) {
            obj[keyPath[keyPath.length - 1]] = [];
        }

        const styles = obj[keyPath[keyPath.length - 1]];
        if (e.target.checked) {
            if (!styles.includes(style)) styles.push(style);
        } else {
            const idx = styles.indexOf(style);
            if (idx > -1) styles.splice(idx, 1);
        }

        this.applyChangesToUI();
        this.markDirty();
    }

    handleTransformRadio(e) {
        const key = e.target.dataset.key;
        const style = e.target.dataset.style;
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const keyPath = key.split('.');
        let obj = deviceConfig;

        // Navigate to the parent object
        for (let i = 0; i < keyPath.length - 1; i++) {
            if (!obj[keyPath[i]]) obj[keyPath[i]] = {};
            obj = obj[keyPath[i]];
        }

        if (!obj[keyPath[keyPath.length - 1]]) {
            obj[keyPath[keyPath.length - 1]] = [];
        }

        const styles = obj[keyPath[keyPath.length - 1]];

        // Remove all previous transform styles (allcaps, smallcaps, nocaps)
        const transformStyles = ['allcaps', 'smallcaps', 'nocaps'];
        transformStyles.forEach(ts => {
            const idx = styles.indexOf(ts);
            if (idx > -1) styles.splice(idx, 1);
        });

        // Add the new transform style if not "none"
        if (style !== 'none' && !styles.includes(style)) {
            styles.push(style);
        }

        this.applyChangesToUI();
        this.markDirty();
    }

    setConfigValue(key, value) {
        const keys = key.split('.');
        
        // Check if this is a top-level config key (e.g., "network.port")
        if (keys[0] === 'network' || keys[0] === 'hardware') {
            // Handle top-level config
            console.log(`Setting top-level config value: ${key} = ${value}`);
            let obj = this.currentConfig;
            
            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) {
                    console.log(`Creating path: ${keys[i]}`);
                    obj[keys[i]] = {};
                }
                obj = obj[keys[i]];
            }
            
            const finalKey = keys[keys.length - 1];
            obj[finalKey] = value;
            console.log(`Set ${key} to ${value}`, 'Full config:', this.currentConfig);
        } else {
            // Handle device-specific config
            const deviceConfig = this.getDeviceConfig(this.selectedDevice);
            let obj = deviceConfig;

            console.log(`Setting device config value: ${key} = ${value}`);

            for (let i = 0; i < keys.length - 1; i++) {
                if (!obj[keys[i]]) {
                    console.log(`Creating path: ${keys[i]}`);
                    obj[keys[i]] = {};
                }
                obj = obj[keys[i]];
            }

            const finalKey = keys[keys.length - 1];
            obj[finalKey] = value;
            console.log(`Set ${key} to ${value}`, 'Full device config:', deviceConfig);
        }
    }

    normalizeDeviceKey(device) {
        // Convert hyphens to colons for config.json lookup
        // e.g., "0000-00-10-0" -> "0000:00:10.0"
        if (device.includes('-')) {
            const parts = device.split('-');
            return `${parts[0]}:${parts[1]}:${parts[2]}.${parts[3]}`;
        }
        return device;
    }

    getDeviceConfig(device) {
        if (!this.currentConfig.devices) {
            this.currentConfig.devices = {};
        }
        const normalizedKey = this.normalizeDeviceKey(device);
        if (!this.currentConfig.devices[normalizedKey]) {
            this.currentConfig.devices[normalizedKey] = {
                chassis: {},
                bay: {}
            };
        }
        return this.currentConfig.devices[normalizedKey];
    }

    getMaxBaysForDevice(device) {
        return this.topology[device].settings.max_bays || 16;
    }

    markDirty() {
        if (!this.isDirty) {
            this.isDirty = true;
            this.render();
        }
    }

    revert() {
        this.currentConfig = JSON.parse(JSON.stringify(this.originalConfig));
        this.isDirty = false;
        this.applyChangesToUI();
        this.render();
        
        // Update all input fields to reflect the reverted config
        this.updateInputFieldValues();
        
        // Close all menus after reverting
        document.querySelectorAll('.dropdown-content').forEach(d => {
            d.classList.remove('active');
        });
        
        // Hard refresh to ensure all changes are reverted
        setTimeout(() => {
            window.location.href = window.location.href;
        }, 300);
    }

    getConfigValue(key) {
        const keyPath = key.split('.');
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        let value = deviceConfig;
        
        for (let i = 0; i < keyPath.length; i++) {
            if (value && value[keyPath[i]] !== undefined) {
                value = value[keyPath[i]];
            } else {
                return undefined;
            }
        }
        return value;
    }

    updateInputFieldValues() {
        // Update all color pickers
        document.querySelectorAll('.color-picker').forEach(picker => {
            const key = picker.dataset.key;
            const value = this.getConfigValue(key);
            if (value) {
                picker.value = this.hexToColor(value);
            }
        });

        // Update all text inputs
        document.querySelectorAll('.text-input').forEach(input => {
            const key = input.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                input.value = value;
            }
        });

        // Update all number inputs
        document.querySelectorAll('.number-input').forEach(input => {
            const key = input.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                input.value = value;
            }
        });

        // Update all port inputs
        document.querySelectorAll('.port-input').forEach(input => {
            const key = input.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                input.value = value;
            }
        });

        // Update all range sliders
        document.querySelectorAll('.range-slider').forEach(slider => {
            const key = slider.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                if (key === 'environment.flare_angle') {
                    slider.value = this.getAngleValue(value, 30);
                } else {
                    slider.value = value;
                }
            } else if (key === 'environment.menu_opacity') {
                slider.value = 100;
            } else if (key === 'environment.flare_shape') {
                slider.value = 50;
            } else if (key === 'environment.flare_size') {
                slider.value = 50;
            }
        });

        // Update all font selects
        document.querySelectorAll('.font-select').forEach(select => {
            const key = select.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                select.value = value;
            }
        });

        // Update all checkboxes
        document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            const key = checkbox.dataset.key;
            const value = this.getConfigValue(key);
            if (value !== undefined) {
                checkbox.checked = value;
            }
        });

        // Update all radio buttons
        document.querySelectorAll('.transform-radio').forEach(radio => {
            const key = radio.dataset.key;
            const style = radio.dataset.style;
            const value = this.getConfigValue(key);
            if (value === style) {
                radio.checked = true;
            }
        });
    }

    async save() {
        try {
            console.log('Saving config:', this.currentConfig);
            
            // Check if port has changed
            const oldPort = this.originalConfig.network?.port || 8010;
            const newPort = this.currentConfig.network?.port || 8010;
            const portChanged = oldPort !== newPort;
            
            const response = await fetch('/save-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.currentConfig)
            });

            const data = await response.json();
            console.log('Save response:', data, 'Status:', response.status);

            if (!response.ok) {
                console.error('Save response:', data);
                alert(`Failed to save configuration: ${data.message || 'Unknown error'}`);
                return;
            }

            this.originalConfig = JSON.parse(JSON.stringify(this.currentConfig));
            this.isDirty = false;
            this.render();
            console.log('Configuration saved successfully');
            console.log('Dispatching configSaved event');
            
            // Force the app to reload config and redraw dashboard
            window.dispatchEvent(new CustomEvent('configSaved', { 
                detail: this.currentConfig,
                bubbles: true,
                composed: true
            }));
            
            // If port changed, trigger restart and show modal
            if (portChanged) {
                try {
                    // Trigger server restart
                    await fetch('/trigger-restart');
                    console.log('Server restart triggered');
                } catch (error) {
                    console.error('Failed to trigger restart:', error);
                }
                this.showPortChangeModal(oldPort, newPort);
            } else {
                // Close all menus after save
                document.querySelectorAll('.dropdown-content').forEach(d => {
                    d.classList.remove('active');
                });
                // Hard refresh for non-port changes
                setTimeout(() => {
                    window.location.href = window.location.href;
                }, 300);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert(`Error saving configuration: ${error.message}`);
        }
    }

    showPortChangeModal(oldPort, newPort) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'port-change-modal';
        modal.innerHTML = `
            <div class="port-change-modal-content">
                <h2>⚠️ Listening Port Changed</h2>
                <p><strong>Old Port:</strong> ${oldPort}</p>
                <p><strong>New Port:</strong> ${newPort}</p>
                <div class="port-change-warning">
                    <p>⚠️ <strong>Important:</strong> If you have bookmarked this dashboard or created shortcuts, you will need to update them to use the new port number.</p>
                </div>
                <button class="port-change-acknowledge-btn">I Understand, Continue</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add acknowledge button handler
        const acknowledgeBtn = modal.querySelector('.port-change-acknowledge-btn');
        acknowledgeBtn.addEventListener('click', () => {
            console.log(`User acknowledged port change. Waiting for server restart, then navigating to port ${newPort}...`);
            acknowledgeBtn.disabled = true;
            acknowledgeBtn.textContent = 'Redirecting...';
            
            // Wait for server to restart (2 seconds), then navigate
            setTimeout(() => {
                const newUrl = `http://${window.location.hostname}:${newPort}${window.location.pathname}${window.location.search}`;
                console.log(`Navigating to ${newUrl}`);
                window.location.href = newUrl;
            }, 2000);
        });
    }

    applyChangesToUI() {
        // Apply menu changes directly to CSS variables and DOM
        const deviceConfig = this.getDeviceConfig(this.selectedDevice);
        const root = document.documentElement;

        console.log('Applying changes for device:', this.selectedDevice, deviceConfig);

        // Apply chassis settings
        if (deviceConfig.chassis) {
            const chassis = deviceConfig.chassis;
            console.log('Chassis config:', chassis);
            
            // Apply colors with opacity
            if (chassis.background_base) {
                const opacity = chassis.background_opacity !== undefined ? chassis.background_opacity : 1;
                const color = this.hexToRgba(chassis.background_base, opacity);
                root.style.setProperty('--chassis-bg-base', color);
                console.log('Set --chassis-bg-base to', color);
                
                // Also check if the element exists and verify it's being applied
                const storageUnits = document.querySelectorAll('.storage-unit');
                console.log(`Found ${storageUnits.length} storage unit elements`);
                if (storageUnits.length > 0) {
                    const computedBg = window.getComputedStyle(storageUnits[0]).backgroundColor;
                    console.log('First storage-unit computed background-color:', computedBg);
                }
            }
            
            if (chassis.border) {
                const opacity = chassis.border_opacity !== undefined ? chassis.border_opacity : 1;
                const color = this.hexToRgba(chassis.border, opacity);
                root.style.setProperty('--chassis-border', color);
            }
            
            if (chassis.shadow) {
                const opacity = chassis.shadow_opacity !== undefined ? chassis.shadow_opacity : 0.8;
                const color = this.hexToRgba(chassis.shadow, opacity);
                root.style.setProperty('--chassis-shadow', color);
            }
            
            if (chassis.header_divider) {
                const opacity = chassis.header_divider_opacity !== undefined ? chassis.header_divider_opacity : 0.1;
                const color = this.hexToRgba(chassis.header_divider, opacity);
                root.style.setProperty('--chassis-header-divider', color);
            }
            
            if (chassis.scratch_opacity !== undefined) {
                root.style.setProperty('--chassis-scratch-opacity', chassis.scratch_opacity);
            }
            
            if (chassis.font) root.style.setProperty('--chassis-font', chassis.font);
            
            // Convert font_size_scale (0-100) to em (0.5-1.5)
            if (chassis.font_size_scale !== undefined) {
                const scaleValue = Number(chassis.font_size_scale);
                const safeSizeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const fontSizeEm = 0.5 + (safeSizeScale / 100) * 1.0;
                root.style.setProperty('--chassis-font-size', `${fontSizeEm}em`);
            }
            
            if (chassis.font_color) root.style.setProperty('--chassis-font-color', chassis.font_color);
            if (chassis.flare_angle) root.style.setProperty('--legend-flare-angle', chassis.flare_angle);
            if (chassis.flare_offset_x) root.style.setProperty('--legend-flare-offset-x', chassis.flare_offset_x);
            if (chassis.flare_offset_y) root.style.setProperty('--legend-flare-offset-y', chassis.flare_offset_y);
            if (chassis.flare_opacity) root.style.setProperty('--legend-flare-opacity', chassis.flare_opacity);
        }

        // Apply bay settings
        if (deviceConfig.bay) {
            const bay = deviceConfig.bay;
            console.log('Bay config:', bay);
            
            // Apply colors with opacity
            if (bay.background_base) {
                const opacity = bay.background_opacity !== undefined ? bay.background_opacity : 1;
                const color = this.hexToRgba(bay.background_base, opacity);
                root.style.setProperty('--bay-bg-base', color);
            }
            
            if (bay.border) {
                const opacity = bay.border_opacity !== undefined ? bay.border_opacity : 1;
                const color = this.hexToRgba(bay.border, opacity);
                root.style.setProperty('--bay-border', color);
            }
            
            if (bay.top_border) {
                const opacity = bay.top_border_opacity !== undefined ? bay.top_border_opacity : 1;
                const color = this.hexToRgba(bay.top_border, opacity);
                root.style.setProperty('--bay-top-border', color);
            }
            
            if (bay.grill_size) root.style.setProperty('--bay-grill-size', bay.grill_size);
            if (bay.grill_size_scale !== undefined) {
                const scaleValue = Number(bay.grill_size_scale);
                const safeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const grillSize = 10 + (safeScale / 100) * 10;
                root.style.setProperty('--bay-grill-size', `${grillSize}px`);
            }
            
            // Pool settings
            if (bay.pool_color) root.style.setProperty('--disk-pool-color', bay.pool_color);
            if (bay.pool_font) root.style.setProperty('--disk-pool-font', bay.pool_font);
            if (bay.pool_size) root.style.setProperty('--disk-pool-size', bay.pool_size);
            if (bay.pool_size_scale !== undefined) {
                const scaleValue = Number(bay.pool_size_scale);
                const safeSizeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const fontSizeVw = 0.5 + (safeSizeScale / 100) * 1.0;
                root.style.setProperty('--disk-pool-size', `${fontSizeVw}vw`);
            }
            if (bay.pool_style) {
                root.style.setProperty('--disk-pool-weight', this.getStyleWeight(bay.pool_style));
                root.style.setProperty('--disk-pool-style', this.getStyleFont(bay.pool_style));
                root.style.setProperty('--disk-pool-transform', this.getStyleTransform(bay.pool_style));
            }
            
            // Index settings
            if (bay.idx_color) root.style.setProperty('--disk-index-color', bay.idx_color);
            if (bay.idx_font) root.style.setProperty('--disk-index-font', bay.idx_font);
            if (bay.idx_size) root.style.setProperty('--disk-index-size', bay.idx_size);
            if (bay.idx_size_scale !== undefined) {
                const scaleValue = Number(bay.idx_size_scale);
                const safeSizeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const fontSizeVw = 0.5 + (safeSizeScale / 100) * 1.0;
                root.style.setProperty('--disk-index-size', `${fontSizeVw}vw`);
            }
            if (bay.idx_style) {
                root.style.setProperty('--disk-index-weight', this.getStyleWeight(bay.idx_style));
                root.style.setProperty('--disk-index-style', this.getStyleFont(bay.idx_style));
                root.style.setProperty('--disk-index-transform', this.getStyleTransform(bay.idx_style));
            }
            
            // Serial settings
            if (bay.sn_color) root.style.setProperty('--disk-serial-color', bay.sn_color);
            if (bay.sn_font) root.style.setProperty('--disk-serial-font', bay.sn_font);
            if (bay.sn_size) root.style.setProperty('--disk-serial-size', bay.sn_size);
            if (bay.sn_size_scale !== undefined) {
                const scaleValue = Number(bay.sn_size_scale);
                const safeSizeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const fontSizeVw = 0.5 + (safeSizeScale / 100) * 1.0;
                root.style.setProperty('--disk-serial-size', `${fontSizeVw}vw`);
            }
            if (bay.sn_style) {
                root.style.setProperty('--disk-serial-weight', this.getStyleWeight(bay.sn_style));
                root.style.setProperty('--disk-serial-style', this.getStyleFont(bay.sn_style));
                root.style.setProperty('--disk-serial-transform', this.getStyleTransform(bay.sn_style));
            }
            
            // Size settings
            if (bay.size_color) root.style.setProperty('--disk-size-color', bay.size_color);
            if (bay.size_font) root.style.setProperty('--disk-size-font', bay.size_font);
            if (bay.size_size) root.style.setProperty('--disk-size-size', bay.size_size);
            if (bay.size_size_scale !== undefined) {
                const scaleValue = Number(bay.size_size_scale);
                const safeSizeScale = Number.isFinite(scaleValue) ? Math.min(100, Math.max(0, scaleValue)) : 50;
                const fontSizeVw = 0.5 + (safeSizeScale / 100) * 1.0;
                root.style.setProperty('--disk-size-size', `${fontSizeVw}vw`);
            }
            if (bay.size_style) {
                root.style.setProperty('--disk-size-weight', this.getStyleWeight(bay.size_style));
                root.style.setProperty('--disk-size-style', this.getStyleFont(bay.size_style));
                root.style.setProperty('--disk-size-transform', this.getStyleTransform(bay.size_style));
            }
        }

        // Apply environment settings (always apply, even if not explicitly configured)
        const env = deviceConfig.environment || {};
        
        // Flare Color
        const flareColor = env.flare_color || '#ffffff';
        root.style.setProperty('--flare-color', flareColor);

        // Flare Angle (0-360 degrees)
        const flareAngle = this.getAngleValue(env.flare_angle, 30);
        root.style.setProperty('--flare-angle', `${flareAngle}deg`);

        // Flare Offset X (percentage, can be negative or > 100)
        const flareOffsetX = env.flare_offset_x !== undefined ? env.flare_offset_x : 10;
        root.style.setProperty('--flare-offset-x', `${flareOffsetX}%`);

        // Flare Offset Y (percentage, can be negative or > 100)
        const flareOffsetY = env.flare_offset_y !== undefined ? env.flare_offset_y : 10;
        root.style.setProperty('--flare-offset-y', `${flareOffsetY}%`);

        // Flare Opacity (0-0.3 range for subtle effect)
        const flareOpacity = env.flare_opacity !== undefined ? env.flare_opacity : 0.15;
        const safeOpacity = Number(flareOpacity);
        root.style.setProperty('--flare-opacity', String(safeOpacity));

        // Flare Shape (0-100 slider, converts to gradient spread 2%-20%)
        const shapeValue = env.flare_shape !== undefined ? Number(env.flare_shape) : 50;
        const safeShape = Number.isFinite(shapeValue) ? Math.min(100, Math.max(0, shapeValue)) : 50;
        const spread = 2 + (safeShape / 100) * 18;
        root.style.setProperty('--flare-spread', `${spread}%`);

        // Flare Size (0-100 slider, converts to scale 0.5-1.5)
        const sizeValue = env.flare_size !== undefined ? Number(env.flare_size) : 50;
        const safeSize = Number.isFinite(sizeValue) ? Math.min(100, Math.max(0, sizeValue)) : 50;
        const sizeScale = 0.5 + (safeSize / 100) * 1.0;
        root.style.setProperty('--flare-size', String(sizeScale));
        
        // Apply page background
        if (env.page_bg_color) {
            root.style.setProperty('--page-bg-color', env.page_bg_color);
            document.body.style.backgroundColor = env.page_bg_color;
        }
        
        // Apply menu styling
        if (env.menu_bg_color) {
            root.style.setProperty('--menu-bg-color', env.menu_bg_color);
        }
        
        if (env.menu_text_color) {
            root.style.setProperty('--menu-text-color', env.menu_text_color);
        }
        
        // Always set menu opacity, default to 1 if not specified
        {
            const menuOpacityPercent = env.menu_opacity !== undefined ? Number(env.menu_opacity) : 100;
            const safePercent = Number.isFinite(menuOpacityPercent) ? Math.min(100, Math.max(0, menuOpacityPercent)) : 100;
            const menuOpacity = 0.75 + (safePercent / 100) * 0.25;
            root.style.setProperty('--menu-opacity', menuOpacity.toFixed(2));
        }

        // Force a reflow to apply CSS changes
        void document.documentElement.offsetHeight;
        console.log('Applied changes to UI for device:', this.selectedDevice);
    }

    getStyleWeight(styles) {
        if (!styles || !Array.isArray(styles)) return '700';
        return styles.includes('bold') ? 'bold' : 'normal';
    }

    getStyleFont(styles) {
        if (!styles || !Array.isArray(styles)) return 'normal';
        return styles.includes('italic') ? 'italic' : 'normal';
    }

    getStyleTransform(styles) {
        if (!styles || !Array.isArray(styles)) return 'none';
        if (styles.includes('allcaps')) return 'uppercase';
        if (styles.includes('smallcaps')) return 'small-caps';
        if (styles.includes('nocaps')) return 'lowercase';
        return 'none';
    }

    stylesToCSS(styles) {
        // Legacy function - kept for compatibility
        if (!styles || !Array.isArray(styles)) return '';
        let css = '';
        if (styles.includes('allcaps')) css += ' uppercase';
        if (styles.includes('smallcaps')) css += ' small-caps';
        if (styles.includes('nocaps')) css += ' lowercase';
        if (styles.includes('bold')) css += ' bold';
        if (styles.includes('italic')) css += ' italic';
        return css.trim();
    }

    getAngleValue(value, fallback = 30) {
        if (value === undefined || value === null) return fallback;
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value.replace('deg', '').trim());
            return Number.isFinite(parsed) ? parsed : fallback;
        }
        return fallback;
    }

    hexToColor(hex) {
        // Convert various color formats to hex for color picker
        if (hex.startsWith('#')) return hex;
        if (hex.startsWith('rgba')) {
            // Parse rgba and return as hex
            const match = hex.match(/\d+/g);
            if (match) {
                return '#' + match.slice(0, 3).map(x => {
                    const num = parseInt(x);
                    return ('0' + num.toString(16)).slice(-2);
                }).join('');
            }
        }
        return '#1a1a1a'; // Fallback
    }

    hexToRgba(hex, opacity = 1) {
        // Convert hex color to rgba with specified opacity
        let r, g, b;
        
        if (hex.startsWith('#')) {
            // Parse hex color
            const hexValue = hex.slice(1);
            if (hexValue.length === 6) {
                r = parseInt(hexValue.substring(0, 2), 16);
                g = parseInt(hexValue.substring(2, 4), 16);
                b = parseInt(hexValue.substring(4, 6), 16);
            } else if (hexValue.length === 3) {
                r = parseInt(hexValue[0] + hexValue[0], 16);
                g = parseInt(hexValue[1] + hexValue[1], 16);
                b = parseInt(hexValue[2] + hexValue[2], 16);
            }
        } else if (hex.startsWith('rgba')) {
            // Parse rgba and extract r, g, b
            const match = hex.match(/\d+/g);
            if (match && match.length >= 3) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        } else if (hex.startsWith('rgb')) {
            // Parse rgb
            const match = hex.match(/\d+/g);
            if (match && match.length >= 3) {
                r = parseInt(match[0]);
                g = parseInt(match[1]);
                b = parseInt(match[2]);
            }
        }
        
        if (r !== undefined && g !== undefined && b !== undefined) {
            return `rgba(${r}, ${g}, ${b}, ${opacity})`;
        }
        
        return hex; // Fallback to original if parsing fails
    }
}
