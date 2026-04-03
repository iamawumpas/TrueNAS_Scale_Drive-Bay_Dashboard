// app.js — thin orchestrator: wires data fetch, render loop, and activity monitor

import { fetchDataWithRetry, getRenderablePayload, hasUsableTopology, hasFreshLastGoodTopology, getLastGoodPayload } from './js/data.js';
import { render } from './js/renderer.js';

const DATA_FETCH_INTERVAL_MS = 200;

let activityMonitor = null;
let updateInFlight = false;

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