// js/data.js — fetch layer: polling, retry, last-good-payload cache, topology guards

const DATA_FETCH_TIMEOUT_MS = 1500;
const DATA_FETCH_RETRY_DELAYS_MS = [150, 500];
const LAST_GOOD_TOPOLOGY_TTL_MS = 60000;

let lastGoodRenderPayload = null;
let lastGoodRenderAt = 0;
let lastAcceptedTopologyCount = 0;

function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        window.clearTimeout(timer);
    }
}

export async function fetchDataWithRetry() {
    const attempts = [0, ...DATA_FETCH_RETRY_DELAYS_MS];
    let lastError = null;
    for (let i = 0; i < attempts.length; i++) {
        if (i > 0) await delay(attempts[i]);
        try {
            return await fetchJsonWithTimeout(`/data?t=${Date.now()}`, DATA_FETCH_TIMEOUT_MS);
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error('Failed to fetch /data');
}

export function getTopologyEntries(payload) {
    if (!payload || typeof payload !== 'object') return [];
    const topology = payload.topology;
    if (!topology || typeof topology !== 'object') return [];
    return Object.entries(topology);
}

export function hasUsableTopology(payload) {
    return getTopologyEntries(payload).length > 0;
}

export function hasFreshLastGoodTopology() {
    return Boolean(lastGoodRenderPayload) && (Date.now() - lastGoodRenderAt) < LAST_GOOD_TOPOLOGY_TTL_MS;
}

function isLikelyPartialTopology(payload) {
    if (!lastGoodRenderPayload || !hasFreshLastGoodTopology()) return false;
    const nextCount = getTopologyEntries(payload).length;
    return lastAcceptedTopologyCount > 1 && nextCount > 0 && nextCount < lastAcceptedTopologyCount;
}

function rememberGoodPayload(payload) {
    lastGoodRenderPayload = payload;
    lastGoodRenderAt = Date.now();
    lastAcceptedTopologyCount = getTopologyEntries(payload).length;
    window.dispatchEvent(new CustomEvent('dashboard-data-updated', { detail: { data: payload } }));
}

export function getRenderablePayload(payload) {
    if (hasUsableTopology(payload) && !isLikelyPartialTopology(payload)) {
        rememberGoodPayload(payload);
        return payload;
    }
    if (hasFreshLastGoodTopology()) return lastGoodRenderPayload;
    return payload;
}

export function getLastGoodPayload() {
    return lastGoodRenderPayload;
}
