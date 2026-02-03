import { getLEDClass } from './LEDManager.js';
import { getDiskData } from './DiskInfo.js';
import { createChassisHTML } from './Chassis.js';
import { createBayHTML } from './Bay.js';

let lastUIConfigSignature = '';

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
        if (flare.angle) root.style.setProperty('--legend-flare-angle', flare.angle);
        if (flare.offset_x) root.style.setProperty('--legend-flare-offset-x', flare.offset_x);
        if (flare.offset_y) root.style.setProperty('--legend-flare-offset-y', flare.offset_y);
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
        const res = await fetch('/data');
        const data = await res.json();
        const canvas = document.getElementById('canvas');

        applyUIConfig(data.config);
        
        requestAnimationFrame(() => {
            Object.keys(data.topology).forEach(pci => {
                const chassisData = data.topology[pci];
                let unit = document.getElementById(`unit-${pci}`);
                
                if (!unit) {
                    unit = document.createElement('div');
                    unit.id = `unit-${pci}`;
                    unit.className = 'storage-unit';
                    unit.innerHTML = createChassisHTML(pci, data);
                    canvas.appendChild(unit);
                }

                const slotContainer = document.getElementById(`slots-${pci}`);
                const maxBays = chassisData.settings.max_bays;
                slotContainer.style.gridTemplateColumns = `repeat(${maxBays}, 4.5vw)`;

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
    } catch (e) { console.error("Update failed", e); }
}

setInterval(update, 100); 
update();