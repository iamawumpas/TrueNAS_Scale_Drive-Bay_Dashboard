// js/renderer.js — HTML markup builders and DOM render loop with incremental diffing

import { buildEnclosureModel } from './topology.js';
import { applyUiVariables, applyDeviceVariables } from './styleVars.js';
import { formatDiskInfo, statusClassForDisk, getTemperatureSeverityClass } from './topology.js';

const DASHBOARD_SCENE_REFERENCE_WIDTH_PX = 1280;
const DASHBOARD_SCENE_REFERENCE_HEIGHT_PX = 800;

// Per-chassis model cache for DOM diffing
const previousModels = new Map();

export function computeDashboardSceneScale(availableWidthPx) {
    const viewportHeightPx = Math.max(
        1,
        window.innerHeight || document.documentElement.clientHeight || DASHBOARD_SCENE_REFERENCE_HEIGHT_PX
    );
    const widthScale = availableWidthPx / DASHBOARD_SCENE_REFERENCE_WIDTH_PX;
    const heightScale = viewportHeightPx / DASHBOARD_SCENE_REFERENCE_HEIGHT_PX;
    return Math.max(0.5, Math.min(1.15, Math.min(widthScale, heightScale)));
}

export function bayMarkup(disk, latchNumber, layout, tempUnit = 'C') {
    const info = formatDiskInfo(disk, tempUnit);
    const emptyClass = !disk || disk.status === 'EMPTY' ? 'empty' : 'present';
    const statusClass = statusClassForDisk(disk);
    const activityClass = disk && disk.active === true ? 'active' : '';
    const tempSeverityClass = getTemperatureSeverityClass(disk);

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
                    <div class="info-line info-line-temp">
                        <span class="info-temp ${tempSeverityClass}">${info.temperature}</span>
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

export function enclosureMarkup(model, hostname, tempUnit = 'C') {
    const bays = model.disksByVisualIndex.map((disk, index) => bayMarkup(
        disk,
        model.latchNumberByVisualIndex[index] || index + 1,
        model.layout,
        tempUnit
    )).join('');

    const enclosureId = model.arrayAddress ? `${model.pciRaw} / ${model.arrayAddress}` : model.pciRaw;
    const caption = model.hasBackplane ? 'Backplane Enclosure' : 'Direct-Attach Enclosure';

    return `
        <section class="chassis-card" data-key="${model.key}" style="--bay-gap:${model.bayGap}px; --chassis-width:${model.chassisWidthPx}px; --chassis-body-height:${model.bodyHeightPx}px; --bay-width:${model.bayWidthPx}px; --bay-height:${model.bayHeightPx}px; --bay-scale:${model.bayContentScale}; --bay-text-cap-px:${model.bayTextCapPx}px; --bay-text-cap-small-px:${model.bayTextCapSmallPx}px;">
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

// Produce a compact hash string of the disk states for DOM-diff comparison.
// Only includes fields that drive visible output — lets us skip re-rendering
// cards whose drives have not changed.
function diskStateHash(disksByVisualIndex) {
    return disksByVisualIndex.map(d => {
        if (!d || d.status === 'EMPTY') return 'E';
        return [
            d.status,
            d.state,
            d.pool_name || '',
            d.active ? '1' : '0',
            d.temperature_c ?? ''
        ].join('|');
    }).join(',');
}

// Compare two models for structural equality (layout/dimensions, not disk data).
function structuralFingerprint(model) {
    return [
        model.key,
        model.layout,
        model.cols,
        model.rows,
        model.targetSlots,
        model.chassisWidthPx,
        model.bodyHeightPx,
        model.bayWidthPx,
        model.bayHeightPx,
        model.bayGap
    ].join('|');
}

export function render(data, activityMonitorRef) {
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

    const dashboardContainer = document.getElementById('dashboard-wrapper');
    const containerWidth = dashboardContainer?.clientWidth || window.innerWidth;
    const availableWidthPx = Math.max(320, canvas.clientWidth || Math.floor(containerWidth * 0.98));
    const canvasStyle = window.getComputedStyle(canvas);
    const gapPx = parseFloat(canvasStyle.columnGap || canvasStyle.gap || '16') || 16;
    const perChassisWidthPx = chassisCount === 1
        ? Math.max(320, Math.floor(availableWidthPx * 0.95))
        : Math.max(320, Math.floor((availableWidthPx - gapPx) / 2));
    const nineteenInMaxPx = perChassisWidthPx;

    const sceneScale = Number(computeDashboardSceneScale(availableWidthPx).toFixed(3));
    document.documentElement.style.setProperty('--dashboard-scene-scale', String(sceneScale));

    const activeConfig = (window.__previewConfig__ && typeof window.__previewConfig__ === 'object')
        ? window.__previewConfig__
        : data?.config;
    const tempUnit = String(activeConfig?.ui?.drive_temperature?.unit || 'C').toUpperCase() === 'F' ? 'F' : 'C';
    const renderData = { ...data, config: activeConfig || data?.config || {} };

    const models = chassisEntries.map(([topologyKey, chassisData]) =>
        buildEnclosureModel(topologyKey, chassisData, renderData, {
            preferredWidthPx: perChassisWidthPx,
            nineteenInMaxPx
        })
    );

    if (models.length === 0) {
        canvas.innerHTML = '<div class="rebuild-note">No enclosure data returned from /data.</div>';
        previousModels.clear();
        return;
    }

    // Build the set of keys in this render pass for stale-entry cleanup
    const currentKeys = new Set(models.map(m => m.key));

    // Remove cached entries for chassis that are no longer present
    for (const key of previousModels.keys()) {
        if (!currentKeys.has(key)) previousModels.delete(key);
    }

    // Determine whether the full canvas needs rebuilding (key order or count changed)
    const existingCards = Array.from(canvas.querySelectorAll('.chassis-card'));
    const existingKeys = existingCards.map(el => el.dataset.key);
    const keyOrderChanged =
        existingKeys.length !== models.length ||
        models.some((m, i) => existingKeys[i] !== m.key);

    if (keyOrderChanged) {
        // Full rebuild — structure changed (chassis added/removed/reordered)
        canvas.innerHTML = models.map(m => enclosureMarkup(m, hostname, tempUnit)).join('');
        models.forEach(m => {
            previousModels.set(m.key, {
                structural: structuralFingerprint(m),
                diskHash: diskStateHash(m.disksByVisualIndex)
            });
        });
    } else {
        // Incremental update — only patch cards that changed
        models.forEach(model => {
            const prev = previousModels.get(model.key);
            const newStructural = structuralFingerprint(model);
            const newDiskHash = diskStateHash(model.disksByVisualIndex);

            if (!prev || prev.structural !== newStructural) {
                // Dimensions or layout changed — replace the entire card
                const existingCard = canvas.querySelector(`.chassis-card[data-key="${model.key}"]`);
                if (existingCard) {
                    const replacement = document.createElement('div');
                    replacement.innerHTML = enclosureMarkup(model, hostname, tempUnit).trim();
                    existingCard.replaceWith(replacement.firstElementChild);
                }
            } else if (prev.diskHash !== newDiskHash) {
                // Only disk states changed — patch LEDs, temperatures, and bay classes in-place
                const card = canvas.querySelector(`.chassis-card[data-key="${model.key}"]`);
                if (card) {
                    const bays = card.querySelectorAll('.bay-shell');
                    model.disksByVisualIndex.forEach((disk, i) => {
                        const bayEl = bays[i];
                        if (!bayEl) return;

                        const info = formatDiskInfo(disk, tempUnit);
                        const emptyClass = !disk || disk.status === 'EMPTY' ? 'empty' : 'present';
                        const statusClass = statusClassForDisk(disk);
                        const activityClass = disk && disk.active === true ? 'active' : '';
                        const tempSeverityClass = getTemperatureSeverityClass(disk);

                        bayEl.className = `bay-shell bay-${model.layout} ${emptyClass}`;

                        const statusLed = bayEl.querySelector('.status-led');
                        if (statusLed) statusLed.className = `led status-led ${statusClass}`;

                        const activityLed = bayEl.querySelector('.activity-led');
                        if (activityLed) activityLed.className = `led activity-led ${activityClass}`;

                        const tempEl = bayEl.querySelector('.info-temp');
                        if (tempEl) {
                            tempEl.className = `info-temp ${tempSeverityClass}`;
                            tempEl.textContent = info.temperature;
                        }

                        const serialEl = bayEl.querySelector('.info-serial');
                        if (serialEl) serialEl.textContent = info.serial;

                        const sizeEl = bayEl.querySelector('.info-size');
                        if (sizeEl) sizeEl.textContent = info.size;

                        const poolEl = bayEl.querySelector('.info-pool');
                        if (poolEl) poolEl.textContent = info.pool;

                        const idxEl = bayEl.querySelector('.info-idx');
                        if (idxEl) idxEl.textContent = info.index;
                    });
                }
            }
            // else: no change — skip entirely

            previousModels.set(model.key, {
                structural: newStructural,
                diskHash: newDiskHash
            });
        });
    }

    applyDeviceVariables(activeConfig);

    // Return the activity monitor ref back (caller manages it)
    return { needsActivityMonitor: true };
}
