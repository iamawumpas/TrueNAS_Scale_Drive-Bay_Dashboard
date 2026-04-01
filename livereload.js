(function () {
    'use strict';

    const POLL_INTERVAL_MS = 1200;
    const FETCH_TIMEOUT_MS = 1000;
    let lastSnapshot = null;

    function fetchWithTimeout(url, timeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { cache: 'no-store', signal: controller.signal })
            .finally(() => window.clearTimeout(timer));
    }

    async function poll() {
        try {
            const response = await fetchWithTimeout('/livereload-status?t=' + Date.now(), FETCH_TIMEOUT_MS);
            if (!response.ok) return;

            const snapshot = await response.json();
            if (!snapshot || typeof snapshot !== 'object') return;

            if (lastSnapshot && JSON.stringify(snapshot) !== JSON.stringify(lastSnapshot)) {
                window.location.reload();
                return;
            }

            lastSnapshot = snapshot;
        } catch (_error) {
            // Ignore transient dev reload errors.
        }
    }

    window.setInterval(poll, POLL_INTERVAL_MS);
    poll();
})();