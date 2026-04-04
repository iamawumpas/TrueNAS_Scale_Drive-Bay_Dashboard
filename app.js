// app.js — thin orchestrator: wires data fetch, render loop, and activity monitor

import { fetchDataWithRetry, getRenderablePayload, hasUsableTopology, hasFreshLastGoodTopology, getLastGoodPayload } from './js/data.js';
import { render } from './js/renderer.js';

const DATA_FETCH_INTERVAL_MS = 200;
const ALERT_BEEP_INTERVAL_MS = 2000;

let activityMonitor = null;
let updateInFlight = false;
let alertBeepTimerId = null;
let alertAudioContext = null;
let alertBannerEl = null;

function ensureAlertBanner() {
    if (alertBannerEl && alertBannerEl.isConnected) return alertBannerEl;
    const wrapper = document.getElementById('dashboard-wrapper');
    if (!wrapper) return null;
    const banner = document.createElement('div');
    banner.id = 'dashboard-alert-strip';
    banner.style.display = 'none';
    wrapper.insertBefore(banner, wrapper.firstChild);
    alertBannerEl = banner;
    return banner;
}

function playDashboardBeepOnce() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!alertAudioContext) alertAudioContext = new AudioCtx();
        if (alertAudioContext.state === 'suspended') alertAudioContext.resume();

        const osc = alertAudioContext.createOscillator();
        const gain = alertAudioContext.createGain();
        osc.type = 'square';
        osc.frequency.value = 980;
        gain.gain.setValueAtTime(0.0001, alertAudioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, alertAudioContext.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, alertAudioContext.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(alertAudioContext.destination);
        osc.start();
        osc.stop(alertAudioContext.currentTime + 0.13);
    } catch (_) {
        // Browser may block autoplay audio until user interaction.
    }
}

function startAlertBeepLoop() {
    if (alertBeepTimerId) return;
    playDashboardBeepOnce();
    alertBeepTimerId = window.setInterval(() => {
        playDashboardBeepOnce();
    }, ALERT_BEEP_INTERVAL_MS);
}

function stopAlertBeepLoop() {
    if (alertBeepTimerId) {
        window.clearInterval(alertBeepTimerId);
        alertBeepTimerId = null;
    }
}

function updateAlertUi(alerts) {
    const normalized = alerts && typeof alerts === 'object' ? alerts : {};
    const activeNames = Array.isArray(normalized.activeNames) ? normalized.activeNames : [];
    const activeCount = Number(normalized.activeCount || activeNames.length || 0);
    const muteRemainingSec = Number(normalized.muteRemainingSec || 0);
    const muteActive = muteRemainingSec > 0;
    const banner = ensureAlertBanner();

    if (activeCount > 0) {
        if (banner) {
            banner.style.display = 'block';
            if (muteActive) {
                banner.textContent = `Active Alerts (${activeCount}/3): ${activeNames.join(' | ')} | Muted ${muteRemainingSec}s`;
            } else {
                banner.textContent = `Active Alerts (${activeCount}/3): ${activeNames.join(' | ')}`;
            }
        }
        if (muteActive) {
            stopAlertBeepLoop();
        } else {
            startAlertBeepLoop();
        }
        return;
    }

    if (banner) {
        banner.style.display = 'none';
        banner.textContent = '';
    }
    stopAlertBeepLoop();
}

function initActivityMonitor() {
    if (!activityMonitor && window.ActivityMonitor) {
        activityMonitor = new window.ActivityMonitor();
        activityMonitor.initialize();
    } else if (activityMonitor && typeof activityMonitor.reflowLayout === 'function') {
        activityMonitor.reflowLayout();
    }
}

async function update() {
    if (updateInFlight) return;
    updateInFlight = true;
    try {
        const data = await fetchDataWithRetry();
        const renderable = getRenderablePayload(data);
        updateAlertUi(renderable?.alerts);

        if (hasUsableTopology(renderable)) {
            render(renderable);
            initActivityMonitor();
            return;
        }

        if (!hasFreshLastGoodTopology()) {
            const canvas = document.getElementById('canvas');
            if (canvas) {
                canvas.innerHTML = '<div class="rebuild-note">No enclosure data returned from /data.</div>';
            }
        }
    } catch (error) {
        if (hasFreshLastGoodTopology()) {
            render(getLastGoodPayload());
            initActivityMonitor();
        } else {
            const canvas = document.getElementById('canvas');
            if (canvas) {
                canvas.innerHTML = '<div class="rebuild-note">Unable to fetch /data while in rebuild mode.</div>';
            }
        }
    } finally {
        updateInFlight = false;
    }
}

update();
setInterval(update, DATA_FETCH_INTERVAL_MS);