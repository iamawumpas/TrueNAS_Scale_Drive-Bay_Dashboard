import { getLEDClass } from './LEDManager.js';
import { getDiskData } from './DiskInfo.js';
import { createChassisHTML } from './Chassis.js';
import { createBayHTML } from './Bay.js';

async function update() {
    try {
        const res = await fetch('/data');
        const data = await res.json();
        const canvas = document.getElementById('canvas');
        
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
                slotContainer.style.gridTemplateColumns = `repeat(${chassisData.disks.length}, 4.5vw)`;

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