import { getLEDClass } from './LEDManager.js';
import { getDiskData } from './DiskInfo.js';
import { createChassisHTML } from './Chassis.js';
import { createBayHTML } from './Bay.js';
import { MenuSystem } from './MenuSystem.js';
import { applyConfigMap, updateTextIfChanged, setClassIfChanged, debugLog } from './ui/utils.js';
import { resolveLayoutSettings, applyPhysicalLayout } from './ui/layoutGeometry.js';

let lastUIConfigSignature = '';
let lastStyleConfigSignature = '';
let menuSystem = null;
let activityMonitor = null;
let forceRedraw = false;
// DOM caches to reduce repeated queries
const unitsMap = new Map(); // pci -> unit element
const slotContainersMap = new Map(); // pci -> slot container element

function normalizeTopologyDeviceKey(topologyKey, pciRaw) {
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

// Listen for menu save/revert events
window.addEventListener('configSaved', (e) => {
    if (window.UI_DEBUG) console.log('configSaved event received:', e);
    forceRedraw = true;
    if (window.UI_DEBUG) console.log('Set forceRedraw to true, calling update');
    update();
}, true);

window.addEventListener('configReverted', (e) => {
    if (window.UI_DEBUG) console.log('configReverted event received:', e);
    forceRedraw = true;
    if (window.UI_DEBUG) console.log('Set forceRedraw to true, calling update');
    update();
}, true);

function applyStyleConfigFromJSON(styleConfig) {
    if (!styleConfig) return;
    
    const signature = JSON.stringify(styleConfig);
    if (signature === lastStyleConfigSignature) return;
    lastStyleConfigSignature = signature;

    const root = document.documentElement;
    
    // Apply fonts via mapping
    if (styleConfig.fonts) {
        const fontMap = {};
        if (styleConfig.fonts.default) {
            fontMap['--font-default'] = styleConfig.fonts.default;
            fontMap['--server-name-font'] = styleConfig.fonts.default;
            fontMap['--legend-font'] = styleConfig.fonts.default;
            fontMap['--bay-id-font'] = styleConfig.fonts.default;
            fontMap['--disk-serial-font'] = styleConfig.fonts.default;
            fontMap['--disk-size-font'] = styleConfig.fonts.default;
            fontMap['--disk-pool-font'] = styleConfig.fonts.default;
            fontMap['--disk-index-font'] = styleConfig.fonts.default;
        }
        if (styleConfig.fonts.monospace) {
            fontMap['--font-monospace'] = styleConfig.fonts.monospace;
            fontMap['--pci-address-font'] = styleConfig.fonts.monospace;
        }
        applyConfigMap(root, fontMap);
    }
    
    // Apply colors via mapping
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
        const map = {};
        Object.entries(colorMap).forEach(([key, cssVar]) => {
            if (styleConfig.colors[key]) map[cssVar] = styleConfig.colors[key];
        });
        applyConfigMap(root, map);
    }
    
    // Apply font sizes via mapping
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
        const map = {};
        Object.entries(sizeMap).forEach(([key, cssVar]) => {
            if (styleConfig.fontSizes[key]) map[cssVar] = styleConfig.fontSizes[key];
        });
        applyConfigMap(root, map);
    }
    
    console.log('Style config applied from config.json');
}


function applyStyleConfig(prefix, cfg) {
    if (!cfg || typeof cfg !== 'object') return;
    const root = document.documentElement;
    const map = {};
    if (cfg.color) map[`--${prefix}-color`] = cfg.color;
    if (cfg.font) map[`--${prefix}-font`] = cfg.font;
    if (cfg.size) map[`--${prefix}-size`] = cfg.size;

    const styles = Array.isArray(cfg.style) ? cfg.style.map(s => String(s).toLowerCase()) : [];
    const isBold = styles.includes('bold');
    const isItalic = styles.includes('italic');
    const isAllCaps = styles.includes('allcaps');

    map[`--${prefix}-weight`] = isBold ? '700' : '400';
    map[`--${prefix}-style`] = isItalic ? 'italic' : 'normal';
    map[`--${prefix}-transform`] = isAllCaps ? 'uppercase' : 'none';

    applyConfigMap(root, map);
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
    const map = {};
    if (ui.chassis) {
        if (ui.chassis.background_base) map['--chassis-bg-base'] = ui.chassis.background_base;
        if (ui.chassis.border) map['--chassis-border'] = ui.chassis.border;
        if (ui.chassis.shadow) map['--chassis-shadow'] = ui.chassis.shadow;
        if (ui.chassis.header_divider) map['--chassis-header-divider'] = ui.chassis.header_divider;
    }
    if (ui.bay) {
        if (ui.bay.background_base) map['--bay-bg-base'] = ui.bay.background_base;
        if (ui.bay.border) map['--bay-border'] = ui.bay.border;
        if (ui.bay.top_border) map['--bay-top-border'] = ui.bay.top_border;
    }
    if (ui.legend?.flare) {
        const flare = ui.legend.flare;
        if (flare.angle) map['--flare-angle'] = flare.angle;
        if (flare.offset_x) map['--flare-offset-x'] = flare.offset_x;
        if (flare.offset_y) map['--flare-offset-y'] = flare.offset_y;
    }
    if (ui.legend) {
        if (ui.legend.title_color) map['--legend-title-color'] = ui.legend.title_color;
        if (ui.legend.title_size) map['--legend-title-size'] = ui.legend.title_size;
        if (ui.legend.title_weight) map['--legend-title-weight'] = ui.legend.title_weight;
    }
    if (ui.layout) {
        const rackWidthIn = Number(ui.layout.rack_width_in);
        const uHeightIn = Number(ui.layout.u_height_in);
        const bayGapPx = Number(ui.layout.bay_gap_px);
        if (Number.isFinite(rackWidthIn) && rackWidthIn > 0) map['--rack-width-in'] = String(rackWidthIn);
        if (Number.isFinite(uHeightIn) && uHeightIn > 0) map['--rack-u-height-in'] = String(uHeightIn);
        if (Number.isFinite(bayGapPx) && bayGapPx >= 0) map['--bay-gap'] = `${bayGapPx}px`;
    }
    if (ui.led_colors) {
        const led = ui.led_colors;
        if (led.allocated_healthy) map['--led-allocated-healthy'] = led.allocated_healthy;
        if (led.allocated_offline) map['--led-allocated-offline'] = led.allocated_offline;
        if (led.error) map['--led-error'] = led.error;
        if (led.faulted) map['--led-faulted'] = led.faulted;
        if (led.resilvering) map['--led-resilvering'] = led.resilvering;
        if (led.unallocated) map['--led-unallocated'] = led.unallocated;
        if (led.unalloc_error) map['--led-unalloc-error'] = led.unalloc_error;
        if (led.unalloc_fault) map['--led-unalloc-fault'] = led.unalloc_fault;
        if (led.activity) map['--led-activity'] = led.activity;
    }
    applyConfigMap(root, map);
}

function updateAPIWarning(apiStatus) {
    let warningBar = document.getElementById('api-warning-bar');
    
    if (!apiStatus.available) {
        // Create warning bar if it doesn't exist
        if (!warningBar) {
            warningBar = document.createElement('div');
            warningBar.id = 'api-warning-bar';
            warningBar.className = 'api-warning-bar';
            document.body.insertBefore(warningBar, document.body.firstChild);
        }
        
        // Update warning message
        warningBar.innerHTML = `
            <div class="api-warning-content">
                <span class="api-warning-icon">⚠️</span>
                <span class="api-warning-text">TrueNAS Scale API has changed or is unavailable - ${apiStatus.error_message}</span>
                <span class="api-warning-fallback">(Using fallback mode)</span>
            </div>
        `;
        warningBar.style.display = 'flex';
        
        // Also change menu bar to red
        const menuBar = document.getElementById('menu-bar');
        if (menuBar) {
            menuBar.classList.add('api-error');
        }
    } else {
        // Remove warning if API is back online
        if (warningBar) {
            warningBar.style.display = 'none';
        }
        const menuBar = document.getElementById('menu-bar');
        if (menuBar) {
            menuBar.classList.remove('api-error');
        }
    }
}

async function update() {
    try {
        // Ensure flare variables are set with defaults immediately
        const root = document.documentElement;
        if (!root.style.getPropertyValue('--flare-opacity')) {
            const flareDefaults = {
                '--flare-opacity': '0.225',
                '--flare-spread': '20%',
                '--flare-offset-x': '50%',
                '--flare-offset-y': '50%',
                '--flare-angle': '45deg',
                '--flare-size': '1'
            };
            applyConfigMap(root, flareDefaults);
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
        
        const res = await fetch('/data?' + Date.now());
        const data = await res.json();
        
        // Check API status and show warning if API has changed/failed
        updateAPIWarning(data.api_status || { available: true, error_message: "" });
        
        // Set UI debug flag from config (so debugLog can be gated)
        try { window.UI_DEBUG = !!(data.config && data.config.ui && data.config.ui.debug); } catch (e) { window.UI_DEBUG = false; }
        const canvas = document.getElementById('canvas');

        applyUIConfig(data.config);
        
        requestAnimationFrame(() => {
            const effectiveConfig = (menuSystem && menuSystem.isDirty)
                ? menuSystem.currentConfig
                : data.config;
            const allHeaderHeights = Array.from(document.querySelectorAll('.chassis-header'))
                .map(el => el.getBoundingClientRect().height)
                .filter(h => Number.isFinite(h) && h > 0);
            const sharedHeaderHeight = allHeaderHeights.length > 0 ? Math.max(...allHeaderHeights) : 0;

            Object.keys(data.topology).forEach(pci => {
                const chassisData = data.topology[pci];
                let unit = unitsMap.get(pci) || document.getElementById(`unit-${pci}`);

                if (!unit || forceRedraw) {
                    if (window.UI_DEBUG) console.log(`${forceRedraw ? 'Force redraw' : 'First draw'} for unit-${pci}`);
                    if (unit) {
                        if (window.UI_DEBUG) console.log(`Removing existing unit-${pci}`);
                        unit.remove();
                        unitsMap.delete(pci);
                        slotContainersMap.delete(pci);
                    }
                    unit = document.createElement('div');
                    unit.id = `unit-${pci}`;
                    unit.className = 'storage-unit';
                    unit.innerHTML = createChassisHTML(pci, data);
                    canvas.appendChild(unit);
                    unitsMap.set(pci, unit);
                    // Apply device-specific per-unit CSS overrides immediately so new elements inherit them
                    try {
                        const pciRawLocal = chassisData.settings.pci_raw || pci;
                        const deviceKeyLocal = normalizeTopologyDeviceKey(pci, pciRawLocal);
                        const deviceCfgLocal = effectiveConfig?.devices?.[deviceKeyLocal] || effectiveConfig?.devices?.[pciRawLocal] || {};
                        const unitMap = {};
                        // Bay height (per-device override)
                        const bh = deviceCfgLocal.bay?.height || 35;
                        unitMap['--bay-height'] = `${bh}vh`;
                        // Apply any bay background override if present
                        if (deviceCfgLocal.bay?.background_base) unitMap['--bay-bg-base'] = deviceCfgLocal.bay.background_base;
                        applyConfigMap(unit, unitMap);
                        // If slots container exists immediately, set its grid rows
                        const sc = document.getElementById(`slots-${pci}`);
                        if (sc) sc.style.gridAutoRows = 'auto';
                    } catch (e) { /* non-fatal */ }
                    if (window.UI_DEBUG) console.log(`Created new unit-${pci}`);
                }

                let slotContainer = slotContainersMap.get(pci) || document.getElementById(`slots-${pci}`);
                if (!slotContainer && unit) {
                    slotContainer = document.getElementById(`slots-${pci}`);
                    if (slotContainer) slotContainersMap.set(pci, slotContainer);
                }
                const maxBays = chassisData.settings.max_bays;
                
                // Get device-specific bay config using per-chassis key first, then legacy pci_raw key.
                const pciRaw = chassisData.settings.pci_raw || pci;
                const deviceKey = normalizeTopologyDeviceKey(pci, pciRaw);
                const deviceConfig = effectiveConfig?.devices?.[deviceKey] || effectiveConfig?.devices?.[pciRaw] || {};
                const bayHeight = deviceConfig.bay?.height || 35;
                const bayLayout = String(deviceConfig.bay?.layout || 'vertical').toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
                const driveSequence = String(deviceConfig.bay?.drive_sequence || bayLayout).toLowerCase() === 'horizontal' ? 'horizontal' : 'vertical';
                const layoutSettings = resolveLayoutSettings(effectiveConfig, deviceConfig);

                if (unit) {
                    const hostScaleRaw = Number(deviceConfig?.chassis?.hostname_size_scale ?? 100);
                    const idScaleRaw = Number(deviceConfig?.chassis?.device_id_size_scale ?? 100);
                    const hostScale = Number.isFinite(hostScaleRaw) ? Math.min(200, Math.max(50, hostScaleRaw)) / 100 : 1;
                    const idScale = Number.isFinite(idScaleRaw) ? Math.min(200, Math.max(50, idScaleRaw)) / 100 : 1;
                    unit.style.setProperty('--server-name-scale', `${hostScale}`);
                    unit.style.setProperty('--pci-address-scale', `${idScale}`);
                }

                // Layout policy:
                // - Vertical orientation: fit up to 16 drives/row in chassis width.
                // - Horizontal orientation: fixed 4 drives/row.
                const baysPerRow = bayLayout === 'horizontal'
                    ? Math.max(1, Math.min(4, maxBays))
                    : Math.max(1, Math.min(16, maxBays));
                const rows = Math.max(1, Math.ceil(maxBays / baysPerRow));
                
                // Apply bay height only if not in preview mode (menuSystem not dirty)
                // This prevents overwriting live preview changes every 100ms
                if (!menuSystem || !menuSystem.isDirty) {
                    const storageUnit = unitsMap.get(pci) || document.getElementById(`unit-${pci}`);
                    if (storageUnit) {
                        const desired = `${bayHeight}vh`;
                        const current = storageUnit.style.getPropertyValue('--bay-height');
                        if (current !== desired) applyConfigMap(storageUnit, {'--bay-height': desired});
                    }
                    if (slotContainer) {
                        if (slotContainer.style.gridAutoRows !== 'auto') slotContainer.style.gridAutoRows = 'auto';
                    }
                }
                
                // Set grid layout, bay orientation, and drive sequencing.
                if (slotContainer) {
                    slotContainer.style.gridTemplateColumns = `repeat(${baysPerRow}, minmax(0, 1fr))`;
                    slotContainer.style.gridAutoFlow = driveSequence === 'vertical' ? 'column' : 'row';
                    slotContainer.style.gridTemplateRows = driveSequence === 'vertical' ? `repeat(${rows}, auto)` : '';

                    const storageUnit = unitsMap.get(pci) || document.getElementById(`unit-${pci}`);
                    applyPhysicalLayout({
                        storageUnit,
                        slotContainer,
                        baysPerRow,
                        rows,
                        maxBays,
                        bayLayout,
                        settings: {
                            ...layoutSettings,
                            headerHeightPx: Math.max(layoutSettings.headerHeightPx || 0, sharedHeaderHeight)
                        }
                    });
                    slotContainer.dataset.bayLayout = bayLayout;
                    slotContainer.dataset.driveSequence = driveSequence;
                }

                const warning = document.getElementById(`capacity-warning-${pci}`);
                if (warning) {
                    warning.style.display = chassisData.settings.capacity_unknown ? 'block' : 'none';
                }

                // Pad disks array with empty slots so full computed grid renders.
                const targetCapacity = Math.max(rows * baysPerRow, maxBays);
                while (chassisData.disks.length < targetCapacity) {
                    chassisData.disks.push({ status: 'EMPTY' });
                }

                chassisData.disks.forEach((disk, idx) => {
                    let el = document.getElementById(`disk-${pci}-${idx}`);
                    if (!el) {
                        const slot = document.createElement('div');
                        slot.className = 'bay-slot';
                        el = document.createElement('div'); 
                        el.className = 'caddy';
                        el.id = `disk-${pci}-${idx}`;
                        el.innerHTML = createBayHTML(idx);
                        slot.appendChild(el);
                        if (slotContainer) slotContainer.appendChild(slot);
                    }
                    
                    const info = getDiskData(disk);
                    const statusLed = el.querySelector('.status-led');
                    if (statusLed) setClassIfChanged(statusLed, `led status-led ${getLEDClass(disk)}`);
                    const activityLed = el.querySelector('.activity-led');
                    if (activityLed) activityLed.classList.toggle('active', disk.active === true);

                    const cells = {
                        '.sn-cell': info.sn,
                        '.size-cell': info.size,
                        '.pool-cell': info.pool,
                        '.idx-cell': info.idx
                    };

                    Object.entries(cells).forEach(([selector, val]) => {
                        const cell = el.querySelector(selector);
                        if (!cell) return;
                        if (!val || val === '&nbsp;' || (typeof val === 'string' && val.includes('&nbsp;'))) {
                            updateTextIfChanged(cell, '\u00A0');
                        } else {
                            updateTextIfChanged(cell, val);
                        }
                    });
                });
            });
            // Initialize menu system on first update (after DOM elements were created)
            if (!menuSystem) {
                menuSystem = new MenuSystem(data.topology, data.config);
            } else if (forceRedraw) {
                // After redraw, reapply CSS variables from menu system
                console.log('Reapplying CSS variables after redraw');
                menuSystem.applyChangesToUI();
            }

            // Initialize activity monitor on first update (after DOM available)
            if (!activityMonitor && window.ActivityMonitor) {
                activityMonitor = new window.ActivityMonitor();
                activityMonitor.initialize();
            }
        });
        
        // Reset force redraw flag
        if (forceRedraw) {
            console.log('Resetting forceRedraw flag to false');
        }
        forceRedraw = false;
    } catch (e) { console.error("Update failed", e); }
}

setInterval(update, 100); 
update();
