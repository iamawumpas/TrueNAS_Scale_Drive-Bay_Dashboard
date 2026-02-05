import { getLEDClass } from './LEDManager.js';
import { getDiskData } from './DiskInfo.js';
import { createChassisHTML } from './Chassis.js';
import { createBayHTML } from './Bay.js';
import { MenuSystem } from './MenuSystem.js';

let lastUIConfigSignature = '';
let lastStyleConfigSignature = '';
let menuSystem = null;
let activityMonitor = null;
let forceRedraw = false;

// Listen for menu save/revert events
window.addEventListener('configSaved', (e) => {
    console.log('configSaved event received:', e);
    forceRedraw = true;
    console.log('Set forceRedraw to true, calling update');
    update();
}, true);

window.addEventListener('configReverted', (e) => {
    console.log('configReverted event received:', e);
    forceRedraw = true;
    console.log('Set forceRedraw to true, calling update');
    update();
}, true);

function applyStyleConfigFromJSON(styleConfig) {
    if (!styleConfig) return;
    
    const signature = JSON.stringify(styleConfig);
    if (signature === lastStyleConfigSignature) return;
    lastStyleConfigSignature = signature;

    const root = document.documentElement;
    
    // Apply fonts
    if (styleConfig.fonts) {
        if (styleConfig.fonts.default) {
            root.style.setProperty('--font-default', styleConfig.fonts.default);
            // Update all font variables that use default font
            root.style.setProperty('--server-name-font', styleConfig.fonts.default);
            root.style.setProperty('--legend-font', styleConfig.fonts.default);
            root.style.setProperty('--bay-id-font', styleConfig.fonts.default);
            root.style.setProperty('--disk-serial-font', styleConfig.fonts.default);
            root.style.setProperty('--disk-size-font', styleConfig.fonts.default);
            root.style.setProperty('--disk-pool-font', styleConfig.fonts.default);
            root.style.setProperty('--disk-index-font', styleConfig.fonts.default);
        }
        if (styleConfig.fonts.monospace) {
            root.style.setProperty('--font-monospace', styleConfig.fonts.monospace);
            root.style.setProperty('--pci-address-font', styleConfig.fonts.monospace);
        }
    }
    
    // Apply colors
    if (styleConfig.colors) {
        const colorMap = {
            'serverName': '--server-name-color',
            'pciAddress': '--pci-address-color',
            'legend': '--legend-color',
            'legendTitle': '--legend-title-color',
            'bayId': '--bay-id-color',
            'diskSerial': '--disk-serial-color',
            'diskSize': '--disk-size-color',
            'diskPool': '--disk-pool-color',
            'diskIndex': '--disk-index-color',
            'chassisBgBase': '--chassis-bg-base',
            'chassisBorder': '--chassis-border',
            'chassisShadow': '--chassis-shadow',
            'bayBgBase': '--bay-bg-base',
            'bayBorder': '--bay-border',
            'bayTopBorder': '--bay-top-border',
            'ledAllocatedHealthy': '--led-allocated-healthy',
            'ledAllocatedOffline': '--led-allocated-offline',
            'ledError': '--led-error',
            'ledFaulted': '--led-faulted',
            'ledResilvering': '--led-resilvering',
            'ledUnallocated': '--led-unallocated',
            'ledUnallocError': '--led-unalloc-error',
            'ledUnallocFault': '--led-unalloc-fault',
            'ledActivity': '--led-activity'
        };
        
        Object.entries(colorMap).forEach(([key, cssVar]) => {
            if (styleConfig.colors[key]) {
                root.style.setProperty(cssVar, styleConfig.colors[key]);
            }
        });
    }
    
    // Apply font sizes
    if (styleConfig.fontSizes) {
        const sizeMap = {
            'legendTitle': '--legend-title-size',
            'legend': '--legend-size',
            'serverName': '--server-name-size',
            'pciAddress': '--pci-address-size',
            'bayId': '--bay-id-size',
            'diskSerial': '--disk-serial-size',
            'diskSize': '--disk-size-size',
            'diskPool': '--disk-pool-size',
            'diskIndex': '--disk-index-size'
        };
        
        Object.entries(sizeMap).forEach(([key, cssVar]) => {
            if (styleConfig.fontSizes[key]) {
                root.style.setProperty(cssVar, styleConfig.fontSizes[key]);
            }
        });
    }
    
    console.log('Style config applied from config.json');
}


function applyStyleConfig(prefix, cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    const root = document.documentElement;
    if (cfg.color) root.style.setProperty(`--${prefix}-color`, cfg.color);
    if (cfg.font) root.style.setProperty(`--${prefix}-font`, cfg.font);
    if (cfg.size) root.style.setProperty(`--${prefix}-size`, cfg.size);

    const styles = Array.isArray(cfg.style) ? cfg.style.map(s => String(s).toLowerCase()) : [];
    const isBold = styles.includes('bold');
    const isItalic = styles.includes('italic');
    const isAllCaps = styles.includes('allcaps');

    root.style.setProperty(`--${prefix}-weight`, isBold ? '700' : '400');
    root.style.setProperty(`--${prefix}-style`, isItalic ? 'italic' : 'normal');
    root.style.setProperty(`--${prefix}-transform`, isAllCaps ? 'uppercase' : 'none');
}

function applyUIConfig(config) {
    const ui = config?.ui;
    if (!ui || typeof ui !== 'object') return;
    const signature = JSON.stringify(ui);
    if (signature === lastUIConfigSignature) return;
    lastUIConfigSignature = signature;

    applyStyleConfig('server-name', ui.server_name);
    applyStyleConfig('pci-address', ui.pci_address);
    applyStyleConfig('legend', ui.legend);
    applyStyleConfig('bay-id', ui.bay_id);
    applyStyleConfig('disk-serial', ui.disk_serial);
    applyStyleConfig('disk-size', ui.disk_size);
    applyStyleConfig('disk-pool', ui.disk_pool);
    applyStyleConfig('disk-index', ui.disk_index);

    const root = document.documentElement;
    if (ui.chassis) {
        if (ui.chassis.background_base) root.style.setProperty('--chassis-bg-base', ui.chassis.background_base);
        if (ui.chassis.border) root.style.setProperty('--chassis-border', ui.chassis.border);
        if (ui.chassis.shadow) root.style.setProperty('--chassis-shadow', ui.chassis.shadow);
        if (ui.chassis.header_divider) root.style.setProperty('--chassis-header-divider', ui.chassis.header_divider);
    }
    if (ui.bay) {
        if (ui.bay.background_base) root.style.setProperty('--bay-bg-base', ui.bay.background_base);
        if (ui.bay.border) root.style.setProperty('--bay-border', ui.bay.border);
        if (ui.bay.top_border) root.style.setProperty('--bay-top-border', ui.bay.top_border);
    }
    if (ui.legend?.flare) {
        const flare = ui.legend.flare;
        if (flare.angle) root.style.setProperty('--flare-angle', flare.angle);
        if (flare.offset_x) root.style.setProperty('--flare-offset-x', flare.offset_x);
        if (flare.offset_y) root.style.setProperty('--flare-offset-y', flare.offset_y);
    }
    if (ui.legend) {
        if (ui.legend.title_color) root.style.setProperty('--legend-title-color', ui.legend.title_color);
        if (ui.legend.title_size) root.style.setProperty('--legend-title-size', ui.legend.title_size);
        if (ui.legend.title_weight) root.style.setProperty('--legend-title-weight', ui.legend.title_weight);
    }
    if (ui.led_colors) {
        const led = ui.led_colors;
        if (led.allocated_healthy) root.style.setProperty('--led-allocated-healthy', led.allocated_healthy);
        if (led.allocated_offline) root.style.setProperty('--led-allocated-offline', led.allocated_offline);
        if (led.error) root.style.setProperty('--led-error', led.error);
        if (led.faulted) root.style.setProperty('--led-faulted', led.faulted);
        if (led.resilvering) root.style.setProperty('--led-resilvering', led.resilvering);
        if (led.unallocated) root.style.setProperty('--led-unallocated', led.unallocated);
        if (led.unalloc_error) root.style.setProperty('--led-unalloc-error', led.unalloc_error);
        if (led.unalloc_fault) root.style.setProperty('--led-unalloc-fault', led.unalloc_fault);
        if (led.activity) root.style.setProperty('--led-activity', led.activity);
    }
}

async function update() {
    try {
        // Ensure flare variables are set with defaults immediately
        const root = document.documentElement;
        if (!root.style.getPropertyValue('--flare-opacity')) {
            root.style.setProperty('--flare-opacity', '0.225');
            root.style.setProperty('--flare-spread', '20%');
            root.style.setProperty('--flare-offset-x', '50%');
            root.style.setProperty('--flare-offset-y', '50%');
            root.style.setProperty('--flare-angle', '45deg');
            root.style.setProperty('--flare-size', '1');
        }
        
        // Load style configuration from config.json with cache busting
        try {
            const styleRes = await fetch('/style-config?' + Date.now());
            if (styleRes.ok) {
                const styleConfig = await styleRes.json();
                applyStyleConfigFromJSON(styleConfig);
            } else {
                console.warn('Failed to fetch style-config:', styleRes.status);
            }
        } catch (styleErr) {
            console.warn('Style config fetch error:', styleErr);
        }
        
        const res = await fetch('/data');
        const data = await res.json();
        const canvas = document.getElementById('canvas');

        applyUIConfig(data.config);
        
        requestAnimationFrame(() => {
            Object.keys(data.topology).forEach(pci => {
                const chassisData = data.topology[pci];
                let unit = document.getElementById(`unit-${pci}`);
                
                if (!unit || forceRedraw) {
                    console.log(`${forceRedraw ? 'Force redraw' : 'First draw'} for unit-${pci}`);
                    if (unit) {
                        console.log(`Removing existing unit-${pci}`);
                        unit.remove();
                    }
                    unit = document.createElement('div');
                    unit.id = `unit-${pci}`;
                    unit.className = 'storage-unit';
                    unit.innerHTML = createChassisHTML(pci, data);
                    canvas.appendChild(unit);
                    console.log(`Created new unit-${pci}`);
                }

                const slotContainer = document.getElementById(`slots-${pci}`);
                const maxBays = chassisData.settings.max_bays;
                const rows = chassisData.settings.rows || 1;
                const baysPerRow = chassisData.settings.bays_per_row || maxBays;
                
                // Set grid layout with proper row and column configuration
                slotContainer.style.gridTemplateColumns = `repeat(${baysPerRow}, 4.5vw)`;
                slotContainer.style.gridAutoRows = '35vh';

                const warning = document.getElementById(`capacity-warning-${pci}`);
                if (warning) {
                    warning.style.display = chassisData.settings.capacity_unknown ? 'block' : 'none';
                }

                chassisData.disks.forEach((disk, idx) => {
                    let el = document.getElementById(`disk-${pci}-${idx}`);
                    if (!el) {
                        el = document.createElement('div'); 
                        el.className = 'caddy';
                        el.id = `disk-${pci}-${idx}`;
                        el.innerHTML = createBayHTML(idx); 
                        slotContainer.appendChild(el);
                    }
                    
                    const info = getDiskData(disk);
                    el.querySelector('.status-led').className = `led status-led ${getLEDClass(disk)}`;
                    el.querySelector('.activity-led').classList.toggle('active', disk.active === true);
                    
                    const cells = {
                        '.sn-cell': info.sn,
                        '.size-cell': info.size,
                        '.pool-cell': info.pool,
                        '.idx-cell': info.idx
                    };

                    Object.entries(cells).forEach(([selector, val]) => {
                        const cell = el.querySelector(selector);
                        if (!val || val === '&nbsp;' || val.includes('&nbsp;')) {
                            cell.textContent = '\u00A0';
                        } else {
                            cell.textContent = val;
                        }
                    });
                });
            });
        });

        // Initialize menu system on first update
        if (!menuSystem) {
            menuSystem = new MenuSystem(data.topology, data.config);
        } else if (forceRedraw) {
            // After redraw, reapply CSS variables from menu system
            console.log('Reapplying CSS variables after redraw');
            menuSystem.applyChangesToUI();
        }
        
        // Initialize activity monitor on first update
        if (!activityMonitor && window.ActivityMonitor) {
            activityMonitor = new window.ActivityMonitor();
            activityMonitor.initialize();
        }
        
        // Reset force redraw flag
        if (forceRedraw) {
            console.log('Resetting forceRedraw flag to false');
        }
        forceRedraw = false;
    } catch (e) { console.error("Update failed", e); }
}

setInterval(update, 100); 
update();
