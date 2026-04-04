import {
    originalConfig,
    workingConfig,
    isDirty,
    deepClone,
    getNestedValue,
    normalizeMenuControlValue,
    initConfig,
    setConfigValue,
    setWorkingConfigFrom,
    setOriginalConfigSnapshot,
    markClean,
    getDefaultForMenuPath,
    setConfigValueSilent
} from './js/configStore.js';
import {
    applyMenuVariables,
    applyActivityVariables,
    applyEnclosurePreview,
    scheduleChartRecreation
} from './js/stylePreview.js';
import {
    buildMenuBarMarkup,
    buildDiskArraysPanel,
    getDiskArraysMenuSignature
} from './js/menuBuilder.js';

let saveButton = null;
let revertButton = null;
let legendButton = null;
let servicesButton = null;
let servicesStatusNote = null;
let servicesTableBody = null;
let legendBackdrop = null;
let statusEl = null;
let alertsStatusEl = null;
let alertsMuteButton = null;
let repoSyncStatusEl = null;
let repoSyncCheckButton = null;
let repoSyncRestoreButton = null;
let lastAlertsPayload = null;
let lastRepoSyncStatusPayload = null;
let lastTopology = null;
let lastHostname = null;
let lastDiskArraysMenuSignature = '';
let responsiveSliderRefreshTimer = null;
let isResetInProgress = false;

function setPreviewConfig(config) {
    window.__previewConfig__ = deepClone(config || {});
    window.dispatchEvent(new CustomEvent('dashboard-preview-config-updated'));
}

function updateDirtyUI() {
    if (!saveButton || !revertButton) return;
    const buttonContainer = saveButton.closest('.menu-buttons');
    saveButton.disabled = !isDirty;
    revertButton.disabled = !isDirty;
    if (buttonContainer) {
        buttonContainer.classList.toggle('dirty', isDirty);
    }
}

async function fetchPayload() {
    const response = await fetch('/data?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch /data');
    return await response.json();
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-panel.open').forEach(panel => {
        panel.classList.remove('open');
        const trigger = panel.dataset.trigger ? document.getElementById(panel.dataset.trigger) : null;
        trigger?.classList.remove('active');
    });
}

function openDropdown(panel, trigger) {
    closeLegendOverlay();
    syncPanelValues(panel);
    panel.classList.add('open');
    trigger.classList.add('active');
}

function collectPanelPaths(panel) {
    const collected = new Set();
    if (!panel) return collected;
    panel.querySelectorAll('[data-path]').forEach(el => {
        if (el.dataset.path) collected.add(el.dataset.path);
    });
    panel.querySelectorAll('[data-style-path]').forEach(el => {
        if (el.dataset.stylePath) collected.add(el.dataset.stylePath);
    });
    return collected;
}

function hydrateMissingMenuDefaults() {
    if (!workingConfig) return false;
    let changed = false;

    document.querySelectorAll('.dropdown-panel').forEach(panel => {
        const paths = collectPanelPaths(panel);
        paths.forEach(pathStr => {
            const path = pathStr.split('|');
            const current = getNestedValue(workingConfig, path);
            if (current !== undefined && current !== null && current !== '') {
                const normalizedCurrent = normalizeMenuControlValue(path, current);
                if (JSON.stringify(normalizedCurrent) !== JSON.stringify(current)) {
                    if (setConfigValueSilent(path, normalizedCurrent)) changed = true;
                }
                return;
            }
            const fallback = getDefaultForMenuPath(path);
            if (fallback === undefined || fallback === null) return;
            const normalizedFallback = normalizeMenuControlValue(path, fallback);
            if (setConfigValueSilent(path, normalizedFallback)) changed = true;
        });
    });

    if (changed) {
        setPreviewConfig(workingConfig);
    }

    return changed;
}

function getControlContextMetrics() {
    const dashboard = document.getElementById('dashboard-wrapper');
    const menuBar = document.getElementById('menu-bar');
    const width = Math.max(1, Math.round(dashboard?.clientWidth || menuBar?.clientWidth || window.innerWidth || 1));
    const height = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1));
    const isLandscape = width > height;
    const isCoarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    const enclosureCount = Math.max(1, Object.keys(lastTopology || {}).length);

    return { width, height, isLandscape, isCoarsePointer, enclosureCount };
}

function getAdaptivePxSliderScale() {
    const ctx = getControlContextMetrics();
    let scale = 1;

    if (ctx.isCoarsePointer && ctx.isLandscape && ctx.height <= 500) {
        scale = ctx.enclosureCount > 1 ? 0.72 : 0.80;
    } else if (ctx.isCoarsePointer && ctx.width <= 480) {
        scale = 0.90;
    } else if (ctx.isCoarsePointer && ctx.width <= 900) {
        scale = 0.95;
    }

    return Math.max(0.65, Math.min(1.0, scale));
}

function applyAdaptivePxSliderRanges(panel) {
    const pxScale = getAdaptivePxSliderScale();
    panel.querySelectorAll('input[type="range"][data-value-format="px"]').forEach(input => {
        const baseMin = Number(input.dataset.baseMin || input.min || 6);
        const baseMax = Number(input.dataset.baseMax || input.max || 24);
        const baseStep = Number(input.dataset.baseStep || input.step || 1);

        const min = Math.max(5, Math.round(baseMin * Math.max(pxScale, 0.85)));
        const max = Math.max(min + 2, Math.round(baseMax * pxScale));
        input.min = String(min);
        input.max = String(max);
        input.step = String(Number.isFinite(baseStep) && baseStep > 0 ? baseStep : 1);

        const currentVal = Number(input.value);
        if (Number.isFinite(currentVal)) {
            const clampedVal = Math.min(max, Math.max(min, currentVal));
            input.value = String(clampedVal);
            const valEl = panel.querySelector(`#${input.id}-val`);
            if (valEl) valEl.textContent = `${Math.round(clampedVal)}px`;
        }
    });
}

function scheduleResponsiveSliderRefresh() {
    if (responsiveSliderRefreshTimer) return;
    responsiveSliderRefreshTimer = setTimeout(() => {
        responsiveSliderRefreshTimer = null;
        document.querySelectorAll('.dropdown-panel.open').forEach(panel => {
            syncPanelValues(panel);
        });
    }, 120);
}

function syncPanelValues(panel) {
    applyAdaptivePxSliderRanges(panel);

    panel.querySelectorAll('[data-path]').forEach(el => {
        const path = el.dataset.path.split('|');
        const rawVal = getNestedValue(workingConfig, path);
        const val = normalizeMenuControlValue(path, rawVal);

        if (el.classList.contains('color-swatch')) {
            el.style.background = val || '#000000';
        } else if (el.type === 'color') {
            const hex = val ? (val.match(/#[0-9a-fA-F]{3,8}/) || [])[0] || '#000000' : '#000000';
            el.value = hex;
        } else if (el.type === 'range') {
            const isPx = String(el.dataset.valueFormat || '').toLowerCase() === 'px';
            const isMappedPx = String(el.dataset.valueFormat || '').toLowerCase() === 'mapped-px';
            let num;
            let displayText;

            if (isMappedPx) {
                const mapMin = Number(el.dataset.mapMinPx || 0);
                const mapMax = Number(el.dataset.mapMaxPx || 100);
                const span = Math.max(1, mapMax - mapMin);
                const pxValRaw = val !== undefined ? Number(String(val).replace('px', '')) : mapMin;
                const pxVal = Number.isFinite(pxValRaw) ? Math.min(mapMax, Math.max(mapMin, pxValRaw)) : mapMin;
                num = Math.round(((pxVal - mapMin) / span) * 100);
                displayText = `${Math.round(pxVal)}px`;
            } else {
                if (val !== undefined) {
                    if (isPx) {
                        const parsed = Number(String(val).replace('px', '').replace('pt', ''));
                        num = Number.isFinite(parsed) ? parsed : 10;
                    } else {
                        const parsed = Number(val);
                        num = Number.isFinite(parsed) ? parsed : 50;
                    }
                } else {
                    num = isPx ? 10 : 50;
                }
                displayText = isPx ? `${num}px` : String(num);
            }

            el.value = num;
            const valEl = panel.querySelector(`#${el.id}-val`);
            if (valEl) valEl.textContent = displayText;
        } else if (el.tagName === 'SELECT') {
            if (val !== undefined && val !== null) el.value = String(val);
        } else if (el.type === 'checkbox' && el.dataset.path) {
            el.checked = Boolean(val);
        }
    });

    panel.querySelectorAll('input[data-style-path]').forEach(input => {
        const path = input.dataset.stylePath.split('|');
        const styles = getNestedValue(workingConfig, path);
        const active = Array.isArray(styles) ? styles.map(v => String(v).toLowerCase()) : [];
        input.checked = active.includes(String(input.dataset.styleValue).toLowerCase());
    });

    panel.querySelectorAll('input[type="radio"][data-path]').forEach(input => {
        const path = input.dataset.path.split('|');
        const rawVal = getNestedValue(workingConfig, path);
        const val = normalizeMenuControlValue(path, rawVal);
        if (val !== undefined && val !== null) {
            input.checked = (String(val) === String(input.dataset.radioValue));
        } else if (input.dataset.radioDefault) {
            input.checked = true;
        }
    });

    if (panel.id === 'dashboard-panel') {
        updateAlertsMuteControls(lastAlertsPayload);
        updateRepoSyncControls();
    }
}

function applyWorkingConfig() {
    if (!workingConfig) return;
    applyMenuVariables(workingConfig);
    applyActivityVariables(workingConfig);
    applyEnclosurePreview(workingConfig);
    setPreviewConfig(workingConfig);
}

function bindPanelEvents(panel) {
    panel.querySelectorAll('.color-swatch').forEach(swatch => {
        const path = swatch.dataset.path;
        const input = panel.querySelector(`input[data-path="${path}"]`);
        if (input) swatch.addEventListener('click', () => input.click());
    });

    panel.querySelectorAll('input[type="color"]').forEach(input => {
        const path = input.dataset.path.split('|');
        const swatch = panel.querySelector(`.color-swatch[data-path="${input.dataset.path}"]`);
        input.addEventListener('input', () => {
            if (swatch) swatch.style.background = input.value;
            setConfigValue(path, input.value);
        });
    });

    panel.querySelectorAll('select[data-path]').forEach(sel => {
        const path = sel.dataset.path.split('|');
        sel.addEventListener('change', () => setConfigValue(path, sel.value));
    });

    panel.querySelectorAll('input[type="range"]').forEach(input => {
        const path = input.dataset.path.split('|');
        const valEl = document.getElementById(input.id + '-val');
        input.addEventListener('input', () => {
            const num = Number(input.value);
            const isPx = String(input.dataset.valueFormat || '').toLowerCase() === 'px';
            const isMappedPx = String(input.dataset.valueFormat || '').toLowerCase() === 'mapped-px';
            if (isMappedPx) {
                const mapMin = Number(input.dataset.mapMinPx || 0);
                const mapMax = Number(input.dataset.mapMaxPx || 100);
                const pxVal = Math.round(mapMin + ((mapMax - mapMin) * (num / 100)));
                if (valEl) valEl.textContent = `${pxVal}px`;
                setConfigValue(path, `${pxVal}px`);
                return;
            }
            if (valEl) valEl.textContent = isPx ? `${num}px` : num;
            setConfigValue(path, isPx ? `${num}px` : num);
        });
    });

    panel.querySelectorAll('input[data-style-path]').forEach(input => {
        input.addEventListener('change', () => {
            const path = input.dataset.stylePath.split('|');
            const value = String(input.dataset.styleValue).toLowerCase();
            const current = getNestedValue(workingConfig, path);
            let next = Array.isArray(current) ? current.map(v => String(v).toLowerCase()) : [];

            if (value === 'normal') {
                next = input.checked ? ['normal'] : [];
            } else if (input.checked) {
                next = next.filter(v => v !== 'normal');
                if (!next.includes(value)) next.push(value);
            } else {
                next = next.filter(v => v !== value);
                if (next.length === 0) next = ['normal'];
            }

            setConfigValue(path, next);
            syncPanelValues(panel);
        });
    });

    panel.querySelectorAll('input[type="radio"][data-path]').forEach(input => {
        input.addEventListener('change', () => {
            if (!input.checked) return;
            const path = input.dataset.path.split('|');
            setConfigValue(path, input.dataset.radioValue);
        });
    });

    panel.querySelectorAll('input[type="checkbox"][data-path]').forEach(input => {
        input.addEventListener('change', () => {
            const path = input.dataset.path.split('|');
            const joined = path.join('|');
            if (joined === 'ui|menu|repo_sync|enabled') {
                const desired = Boolean(input.checked);
                const previous = Boolean(getNestedValue(workingConfig, path));

                // Keep menu clean: update silently and persist immediately via backend endpoint.
                setConfigValueSilent(path, desired);
                applyWorkingConfig();
                updateDirtyUI();
                updateRepoSyncControls();

                setRepoSyncEnabledImmediate(desired).then((ok) => {
                    if (ok) {
                        refreshRepoSyncStatus(false);
                        return;
                    }

                    // Revert on persistence failure.
                    setConfigValueSilent(path, previous);
                    input.checked = previous;
                    applyWorkingConfig();
                    updateDirtyUI();
                    updateRepoSyncControls();
                    setRepoSyncStatusText('Failed to update repo-sync setting.');
                });
                return;
            }

            setConfigValue(path, Boolean(input.checked));
            updateRepoSyncControls();
        });
    });

    const resetBtn = panel.querySelector('#menu-reset-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            resetConfigToDefaults();
        });
    }
}

function repoSyncEnabled() {
    return Boolean(getNestedValue(workingConfig, ['ui', 'menu', 'repo_sync', 'enabled']));
}

function setRepoSyncStatusText(text) {
    if (repoSyncStatusEl) repoSyncStatusEl.textContent = text;
}

function formatMuteCountdown(totalSeconds) {
    const sec = Math.max(0, Number(totalSeconds) || 0);
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

function setAlertsStatusText(text) {
    if (alertsStatusEl) alertsStatusEl.textContent = text;
}

function updateAlertsMuteControls(alerts) {
    const payload = alerts && typeof alerts === 'object' ? alerts : {};
    const activeCount = Number(payload.activeCount || 0);
    const muteRemainingSec = Number(payload.muteRemainingSec || 0);

    if (!alertsMuteButton) return;

    if (activeCount <= 0) {
        alertsMuteButton.disabled = true;
        alertsMuteButton.textContent = 'MUTE';
        setAlertsStatusText('No active alerts.');
        return;
    }

    if (muteRemainingSec > 0) {
        alertsMuteButton.disabled = true;
        alertsMuteButton.textContent = `MUTED ${formatMuteCountdown(muteRemainingSec)}`;
        setAlertsStatusText(`Alerts muted: ${formatMuteCountdown(muteRemainingSec)} remaining.`);
        return;
    }

    alertsMuteButton.disabled = false;
    alertsMuteButton.textContent = 'MUTE';
    setAlertsStatusText('Alerts active. Click MUTE to silence host/dashboard beeps for 5 minutes.');
}

async function muteAlertsForFiveMinutes() {
    try {
        setAlertsStatusText('Applying 5-minute alert mute...');
        const response = await fetch('/alerts-mute-5m', { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.message || ('Mute failed with HTTP ' + response.status));
        }
        lastAlertsPayload = payload.alerts || null;
        updateAlertsMuteControls(lastAlertsPayload);
    } catch (error) {
        console.error('[menu] alerts mute failed', error);
        updateAlertsMuteControls(lastAlertsPayload);
    }
}

async function setRepoSyncEnabledImmediate(enabled) {
    try {
        const response = await fetch('/repo-sync-enabled', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: Boolean(enabled) })
        });
        if (!response.ok) throw new Error('Repo-sync toggle save failed with HTTP ' + response.status);
        return true;
    } catch (error) {
        console.error('[menu] repo sync toggle persist failed', error);
        return false;
    }
}

function updateRepoSyncControls() {
    const enabled = repoSyncEnabled();
    const updateAvailable = Boolean(lastRepoSyncStatusPayload?.updateAvailable);
    if (repoSyncCheckButton) {
        repoSyncCheckButton.disabled = !enabled;
        repoSyncCheckButton.textContent = updateAvailable ? 'DOWNLOAD UPDATE' : 'CHECK UPDATES';
    }
    if (repoSyncRestoreButton) repoSyncRestoreButton.disabled = !enabled;
    if (!enabled) {
        setRepoSyncStatusText('Repo sync disabled. Enable and SAVE to allow checks/restores.');
    }
}

function formatRepoStatus(payload) {
    if (!payload || typeof payload !== 'object') return 'Repository status unavailable.';
    const local = payload.localVersion || 'unknown';
    const remote = payload.remoteVersion || 'unknown';
    const missingCount = Array.isArray(payload.missingFiles) ? payload.missingFiles.length : 0;
    const updateNote = payload.updateAvailable ? ` Update available: ${remote}.` : ' Up to date.';
    const missingNote = missingCount > 0 ? ` Missing files: ${missingCount}.` : ' No tracked files are missing.';
    if (payload.remoteError) {
        return `Local ${local}. Could not query GitHub (${payload.remoteError}).${missingNote}`;
    }
    return `Local ${local}, remote ${remote}.${updateNote}${missingNote}`;
}

async function refreshRepoSyncStatus(userInitiated = false) {
    try {
        if (userInitiated) setRepoSyncStatusText('Checking GitHub release/version status...');
        const response = await fetch('/repo-sync-status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Status check failed with HTTP ' + response.status);
        const payload = await response.json();
        lastRepoSyncStatusPayload = payload;
        setRepoSyncStatusText(formatRepoStatus(payload));
        updateRepoSyncControls();
    } catch (error) {
        console.error('[menu] repo sync status failed', error);
        setRepoSyncStatusText('Repository status check failed.');
    }
}

async function downloadAndInstallRepositoryUpdate() {
    if (!repoSyncEnabled()) {
        setRepoSyncStatusText('Repo sync disabled. Enable and SAVE first.');
        return;
    }

    const confirmed = window.confirm('Download and install the latest repository update now?');
    if (!confirmed) return;

    try {
        setRepoSyncStatusText('Downloading and verifying update from repository...');
        const response = await fetch('/repo-sync-update', { method: 'POST' });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload?.message || (`Update failed with HTTP ${response.status}`));
        }

        lastRepoSyncStatusPayload = payload;
        const installedCount = Array.isArray(payload.installed) ? payload.installed.length : 0;
        const failedCount = payload.failed ? Object.keys(payload.failed).length : 0;
        let status = `Update install complete. Installed ${installedCount} file(s).`;
        if (failedCount > 0) status += ` Failed ${failedCount} file(s).`;
        if (payload.startup_initiated) {
            status += ' Restart triggered.';
        }
        status += ` ${formatRepoStatus(payload)}`;
        setRepoSyncStatusText(status);
        updateRepoSyncControls();
    } catch (error) {
        console.error('[menu] repo update install failed', error);
        setRepoSyncStatusText('Repository update install failed.');
    }
}

async function handleRepoPrimaryAction() {
    if (lastRepoSyncStatusPayload?.updateAvailable) {
        await downloadAndInstallRepositoryUpdate();
        return;
    }
    await refreshRepoSyncStatus(true);
}

async function restoreMissingFilesFromRepo() {
    if (!repoSyncEnabled()) {
        setRepoSyncStatusText('Repo sync disabled. Enable and SAVE first.');
        return;
    }

    const confirmed = window.confirm('Restore missing tracked runtime files from GitHub main branch?');
    if (!confirmed) return;

    try {
        setRepoSyncStatusText('Restoring missing files from GitHub...');
        const response = await fetch('/repo-sync-repair', { method: 'POST' });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Repair failed with HTTP ${response.status}: ${text}`);
        }
        const payload = await response.json();
        const restoredCount = Array.isArray(payload.restored) ? payload.restored.length : 0;
        const failedCount = payload.failed ? Object.keys(payload.failed).length : 0;
        let status = `Restore complete. Restored ${restoredCount} file(s).`;
        if (failedCount > 0) status += ` Failed ${failedCount} file(s).`;
        status += ` ${formatRepoStatus(payload)}`;
        setRepoSyncStatusText(status);
    } catch (error) {
        console.error('[menu] repo sync repair failed', error);
        setRepoSyncStatusText('Missing-file restore failed.');
    }
}

function buildDiskArraysMenu(topology, hostname) {
    const host = document.getElementById('menu-bar');
    if (!host) return;

    lastTopology = topology || {};
    lastHostname = hostname || '';

    const nextSignature = getDiskArraysMenuSignature(lastTopology, lastHostname);
    const existing = document.getElementById('disk-arrays-panel');
    if (existing && nextSignature === lastDiskArraysMenuSignature) return;

    if (existing) existing.closest('.menu-dropdown-wrapper')?.remove();

    const entries = Object.entries(lastTopology);
    if (entries.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'menu-dropdown-wrapper';
    wrapper.innerHTML = buildDiskArraysPanel(lastTopology, lastHostname);

    const leftGroup = host.querySelector('.menu-left-group');
    if (!leftGroup) return;
    const activityWrapper = leftGroup.querySelector('#activity-monitor-menu-btn')?.closest('.menu-dropdown-wrapper');
    if (activityWrapper) {
        leftGroup.insertBefore(wrapper, activityWrapper);
    } else {
        leftGroup.appendChild(wrapper);
    }
    lastDiskArraysMenuSignature = nextSignature;

    const daBtn = document.getElementById('disk-arrays-menu-btn');
    const daPanel = document.getElementById('disk-arrays-panel');
    if (daBtn && daPanel) {
        daPanel.dataset.trigger = 'disk-arrays-menu-btn';
        bindPanelEvents(daPanel);
        daBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = daPanel.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) openDropdown(daPanel, daBtn);
        });
    }

    daPanel?.querySelectorAll('.da-enclosure-header').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const enclosure = btn.closest('.da-enclosure');
            const body = enclosure?.querySelector('.da-enclosure-body');
            const toggle = btn.querySelector('.da-toggle');
            if (!body) return;
            const isOpen = !body.hidden;
            body.hidden = isOpen;
            if (toggle) toggle.textContent = isOpen ? '\u25B6' : '\u25BC';
        });
    });
}

function buildMenuBar() {
    const host = document.getElementById('menu-bar');
    if (!host) return;

    host.innerHTML = buildMenuBarMarkup();

    saveButton = document.getElementById('menu-save-btn');
    revertButton = document.getElementById('menu-revert-btn');
    legendButton = document.getElementById('legend-menu-btn');
    servicesButton = document.getElementById('services-menu-btn');

    saveButton?.addEventListener('click', saveConfig);
    revertButton?.addEventListener('click', revertConfig);
    legendButton?.addEventListener('click', toggleLegendOverlay);

    const servicesPanel = document.getElementById('services-panel');
    if (servicesButton && servicesPanel) {
        servicesPanel.dataset.trigger = 'services-menu-btn';
        servicesStatusNote = servicesPanel.querySelector('#services-status-note');
        servicesTableBody = servicesPanel.querySelector('#services-table-body');
        servicesButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = servicesPanel.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) openDropdown(servicesPanel, servicesButton);
        });
    }

    const dashBtn = document.getElementById('dashboard-menu-btn');
    const dashPanel = document.getElementById('dashboard-panel');
    if (dashBtn && dashPanel) {
        dashPanel.dataset.trigger = 'dashboard-menu-btn';
        bindPanelEvents(dashPanel);
        repoSyncStatusEl = dashPanel.querySelector('#menu-repo-sync-status');
        repoSyncCheckButton = dashPanel.querySelector('#menu-repo-check-btn');
        repoSyncRestoreButton = dashPanel.querySelector('#menu-repo-restore-btn');
        alertsStatusEl = dashPanel.querySelector('#menu-alerts-status');
        alertsMuteButton = dashPanel.querySelector('#menu-alerts-mute-btn');
        repoSyncCheckButton?.addEventListener('click', handleRepoPrimaryAction);
        repoSyncRestoreButton?.addEventListener('click', restoreMissingFilesFromRepo);
        alertsMuteButton?.addEventListener('click', muteAlertsForFiveMinutes);
        updateAlertsMuteControls(lastAlertsPayload);
        updateRepoSyncControls();
        dashBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dashPanel.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) openDropdown(dashPanel, dashBtn);
        });
    }

    const amBtn = document.getElementById('activity-monitor-menu-btn');
    const amPanel = document.getElementById('activity-monitor-panel');
    if (amBtn && amPanel) {
        amPanel.dataset.trigger = 'activity-monitor-menu-btn';
        bindPanelEvents(amPanel);
        amBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = amPanel.classList.contains('open');
            closeAllDropdowns();
            if (!isOpen) openDropdown(amPanel, amBtn);
        });
    }

    document.addEventListener('click', (e) => {
        if (!host.contains(e.target)) closeAllDropdowns();
    }, { capture: false });
}

function ensureLegendOverlayShell() {
    if (legendBackdrop) return;
    legendBackdrop = document.createElement('div');
    legendBackdrop.id = 'legend-overlay-backdrop';
    legendBackdrop.addEventListener('click', closeLegendOverlay);
    document.body.appendChild(legendBackdrop);
}

function openLegendOverlay() {
    const legend = document.getElementById('legend-chassis');
    if (!legend) return;
    ensureLegendOverlayShell();
    legend.classList.add('legend-overlay-active');
}

function closeLegendOverlay() {
    const legend = document.getElementById('legend-chassis');
    if (legend) legend.classList.remove('legend-overlay-active');
}

function toggleLegendOverlay() {
    const legend = document.getElementById('legend-chassis');
    if (!legend) return;
    if (legend.classList.contains('legend-overlay-active')) {
        closeLegendOverlay();
        return;
    }
    closeAllDropdowns();
    openLegendOverlay();
}

function onConfigMutated(detail) {
    applyWorkingConfig();
    updateDirtyUI();
    updateRepoSyncControls();
    const p0 = detail?.p0;
    const p1 = detail?.p1;
    if (p0 === 'chart' || (p0 === 'ui' && p1 === 'activity')) {
        scheduleChartRecreation();
    }
}

async function saveConfig() {
    if (!isDirty || !workingConfig) return;

    saveButton.disabled = true;
    revertButton.disabled = true;
    if (statusEl) statusEl.textContent = 'Saving...';

    try {
        const response = await fetch('/save-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(workingConfig)
        });
        if (!response.ok) {
            throw new Error('Save failed with HTTP ' + response.status);
        }

        setOriginalConfigSnapshot();
        markClean();
        applyWorkingConfig();
        scheduleChartRecreation();
        updateDirtyUI();
        if (statusEl) statusEl.textContent = '';
    } catch (error) {
        console.error('[menu] save failed', error);
        if (statusEl) statusEl.textContent = 'Save failed';
        updateDirtyUI();
    }
}

function revertConfig() {
    if (!originalConfig) return;
    setWorkingConfigFrom(originalConfig);
    markClean();
    applyWorkingConfig();
    scheduleChartRecreation();
    updateDirtyUI();
}

async function resetConfigToDefaults() {
    if (isResetInProgress) return;
    const confirmed = window.confirm('Reset all dashboard customizations to default settings?');
    if (!confirmed) return;

    try {
        isResetInProgress = true;
        if (statusEl) statusEl.textContent = 'Resetting to defaults...';
        const response = await fetch('/reset-config', { method: 'POST' });
        if (!response.ok) {
            throw new Error('Reset failed with HTTP ' + response.status);
        }

        if (statusEl) statusEl.textContent = 'Defaults restored. Hard refreshing in 3s...';
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    } catch (error) {
        console.error('[menu] reset failed', error);
        if (statusEl) statusEl.textContent = 'Reset failed';
    } finally {
        isResetInProgress = false;
    }
}

function handleDashboardDataUpdate(event) {
    const payload = event?.detail?.data;
    if (!payload || typeof payload !== 'object') return;

    updateServicesMenu(payload.services);

    lastAlertsPayload = payload.alerts || null;
    updateAlertsMuteControls(lastAlertsPayload);

    const topology = payload.topology;
    if (topology && typeof topology === 'object' && Object.keys(topology).length > 0) {
        lastTopology = topology;
        lastHostname = payload.hostname || lastHostname || '';
        buildDiskArraysMenu(lastTopology, lastHostname);
        hydrateMissingMenuDefaults();
        scheduleResponsiveSliderRefresh();
    }

    if (!isDirty && payload.config) {
        initConfig(payload.config);
        applyWorkingConfig();
        updateDirtyUI();
        hydrateMissingMenuDefaults();
    }
}

function updateServicesMenu(servicesPayload) {
    const payload = servicesPayload && typeof servicesPayload === 'object' ? servicesPayload : {};
    const tracked = Array.isArray(payload.tracked) ? payload.tracked : [];
    const hasStopped = Boolean(payload.hasStopped);
    const hasError = !!payload.error;

    if (servicesButton) {
        servicesButton.classList.toggle('services-alert-blink', hasStopped);
        servicesButton.classList.toggle('services-alert-red', hasStopped);
    }

    if (servicesStatusNote) {
        if (hasError) {
            servicesStatusNote.textContent = `Service query error: ${payload.error}`;
        } else {
            servicesStatusNote.textContent = `Tracking ${tracked.length} auto-start service(s).`;
        }
    }

    if (!servicesTableBody) return;
    if (tracked.length === 0) {
        servicesTableBody.innerHTML = '<tr><td colspan="2">No auto-start services found.</td></tr>';
        return;
    }

    servicesTableBody.innerHTML = tracked.map((svc) => {
        const running = Boolean(svc.running);
        const statusClass = running ? 'running' : 'stopped';
        const statusText = running ? 'Running' : 'Stopped';
        return `<tr><td>${svc.name}</td><td><span class="services-status-pill ${statusClass}">${statusText}</span></td></tr>`;
    }).join('');
}

async function init() {
    buildMenuBar();
    ensureLegendOverlayShell();

    window.addEventListener('dashboard-data-updated', handleDashboardDataUpdate);
    window.addEventListener('resize', scheduleResponsiveSliderRefresh);
    window.addEventListener('orientationchange', scheduleResponsiveSliderRefresh);
    window.addEventListener('menu-config-changed', (event) => onConfigMutated(event.detail || {}));

    try {
        const payload = await fetchPayload();
        const config = payload?.config || {};
        initConfig(config);
        lastTopology = payload?.topology || {};
        lastHostname = payload?.hostname || '';
        lastAlertsPayload = payload?.alerts || null;
        updateServicesMenu(payload?.services || null);

        applyWorkingConfig();
        updateDirtyUI();
        updateAlertsMuteControls(lastAlertsPayload);
        buildDiskArraysMenu(lastTopology, lastHostname);
        hydrateMissingMenuDefaults();
        refreshRepoSyncStatus(false);
    } catch (error) {
        console.error('[menu] init failed', error);
        if (statusEl) statusEl.textContent = 'Config unavailable';
    }
}

window.MenuLivePreview = {
    set(path, value) {
        setConfigValue(path, value);
    },
    reset() {
        revertConfig();
    },
    snapshot() {
        return deepClone(workingConfig || {});
    },
    markDirty() {
        setPreviewConfig(workingConfig || {});
        updateDirtyUI();
    }
};

document.addEventListener('DOMContentLoaded', init);