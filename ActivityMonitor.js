// ActivityMonitor.js - ZFS Pool Read/Write Activity Monitor with Chart.js

class ActivityMonitor {
    constructor() {
        this.charts = {};
        this.container = null;
        this.chassis = null;
        this.updateInterval = null;
        this.poolStates = {};  // Track pool states from API
        this.lastPoolStateFetchAt = 0;
        this.poolStateFetchPromise = null;

        this.lastLayoutSignature = '';
        this.lastChartStyleSignature = '';
        this.resizeObserver = null;
        this.reflowRaf = null;

        this.onResize = () => this.scheduleReflowAndStyleRefresh();
        this.onDashboardDataUpdated = (event) => {
            const payload = event?.detail?.data;
            if (payload?.pool_states && typeof payload.pool_states === 'object') {
                this.poolStates = payload.pool_states;
                this.lastPoolStateFetchAt = Date.now();
            }
            this.scheduleReflowAndStyleRefresh();
        };
    }

    initialize() {
        // Create the activity monitor container
        this.chassis = document.getElementById('activity-chassis');
        this.container = document.getElementById('activity-container');

        if (!this.chassis || !this.container) {
            console.error('Activity monitor containers not found');
            return;
        }

        // Start the update loop
        this.startUpdateLoop();

        // Handle resize and dashboard render updates for responsive layout and chart text scaling
        window.addEventListener('resize', this.onResize);
        window.addEventListener('dashboard-data-updated', this.onDashboardDataUpdated);

        // Store reference globally for menu system to trigger updates
        window.activityMonitor = this;

        this.attachResizeObserver();
        this.scheduleReflowAndStyleRefresh();
    }

    attachResizeObserver() {
        if (typeof ResizeObserver === 'undefined' || !this.chassis) return;
        if (this.resizeObserver) this.resizeObserver.disconnect();

        this.resizeObserver = new ResizeObserver(() => {
            this.scheduleReflowAndStyleRefresh();
        });

        this.resizeObserver.observe(this.chassis);
        if (this.chassis.parentElement) {
            this.resizeObserver.observe(this.chassis.parentElement);
        }
    }

    scheduleReflowAndStyleRefresh() {
        if (this.reflowRaf) return;
        this.reflowRaf = window.requestAnimationFrame(() => {
            this.reflowRaf = null;
            this.refreshChartRuntimeStyles();
            this.reflowLayout();
        });
    }

    formatUnits(value) {
        if (value >= 1073741824) return (value / 1073741824).toFixed(1) + ' GB';
        if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB';
        if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
        return value.toFixed(0) + ' B';
    }

    async fetchJsonWithTimeout(url, timeoutMs = 1500) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                cache: 'no-store',
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } finally {
            window.clearTimeout(timer);
        }
    }

    async refreshPoolStatesIfNeeded() {
        const now = Date.now();
        if ((now - this.lastPoolStateFetchAt) < 1000 && Object.keys(this.poolStates).length > 0) {
            return;
        }
        if (this.poolStateFetchPromise) {
            await this.poolStateFetchPromise;
            return;
        }

        this.poolStateFetchPromise = this.fetchJsonWithTimeout('/data?t=' + now)
            .then((mainData) => {
                this.poolStates = mainData?.pool_states || this.poolStates;
                this.lastPoolStateFetchAt = Date.now();
            })
            .catch(() => {
                // Keep last known pool states during transient load spikes.
            })
            .finally(() => {
                this.poolStateFetchPromise = null;
            });

        await this.poolStateFetchPromise;
    }

    getLayoutMetrics() {
        const pools = Object.keys(this.charts).length;
        const style = getComputedStyle(document.documentElement);
        const cardWStr = style.getPropertyValue('--chart-card-width').trim() || '250px';
        const gapStr = style.getPropertyValue('--chart-container-gap').trim() || '20px';
        const sceneScaleStr = style.getPropertyValue('--dashboard-scene-scale').trim() || '1';

        const sceneScale = Math.max(0.25, Number.parseFloat(sceneScaleStr) || 1);
        const cardW = Math.max(80, Math.round(parseInt(cardWStr, 10) * sceneScale));
        const gap = Math.max(4, Math.round(parseInt(gapStr, 10) * sceneScale));
        const containerWidth = this.chassis?.parentElement?.clientWidth || this.chassis?.clientWidth || window.innerWidth;

        return {
            pools,
            cardW,
            gap,
            containerWidth
        };
    }

    reflowLayout() {
        if (!this.chassis) return;

        const { pools, cardW, gap, containerWidth } = this.getLayoutMetrics();
        if (pools === 0) {
            this.chassis.style.display = 'none';
            this.lastLayoutSignature = '';
            return;
        }

        this.chassis.style.display = 'flex';

        const paddingTotal = 0;
        const fudge = containerWidth * 0.01;
        const maxAvailable = containerWidth * 0.95;

        let columns = Math.floor((maxAvailable - paddingTotal + gap) / (cardW + gap));
        columns = Math.max(1, Math.min(columns, pools));

        const layoutSignature = [pools, cardW, gap, Math.round(containerWidth), columns].join('|');
        if (layoutSignature === this.lastLayoutSignature) {
            return;
        }
        this.lastLayoutSignature = layoutSignature;

        const finalWidth = (columns * cardW) + ((columns - 1) * gap) + paddingTotal + fudge;
        this.chassis.style.width = `${finalWidth}px`;
    }

    async updateLoop() {
        try {
            const payload = await this.fetchJsonWithTimeout('/pool-activity?t=' + Date.now(), 1200);
            const data = payload.stats;

            await this.refreshPoolStatesIfNeeded();

            let needsReflow = false;

            for (const pool in data) {
                if (!this.charts[pool]) {
                    this.charts[pool] = this.createChart(pool);
                    needsReflow = true;
                }

                // Update pool state overlay
                this.updatePoolStateOverlay(pool);

                // Only update chart data if pool is not FAULTED
                if (this.poolStates[pool] !== 'FAULTED') {
                    this.charts[pool].data.datasets[0].data = data[pool].r;
                    this.charts[pool].data.datasets[1].data = data[pool].w;
                    this.charts[pool].update('none');
                }
            }

            const styleChanged = this.refreshChartRuntimeStyles();
            if (needsReflow || styleChanged) {
                this.reflowLayout();
            }
        } catch (e) {
            console.error('Activity monitor update error:', e);
        }
    }

    startUpdateLoop() {
        // Initial update
        this.updateLoop();

        // Update every 50ms
        this.updateInterval = setInterval(() => this.updateLoop(), 50);
    }

    getChartConfig() {
        // Get chart configuration from CSS variables set by config.json
        const root = document.documentElement;
        const style = getComputedStyle(root);

        const readColor = style.getPropertyValue('--chart-read-color').trim() || '#2a00d6';
        const writeColor = style.getPropertyValue('--chart-write-color').trim() || '#ff9f00';
        const readGradientTop = style.getPropertyValue('--chart-read-gradient-top').trim() || 'rgba(42, 0, 214, 0.5)';
        const readGradientBottom = style.getPropertyValue('--chart-read-gradient-bottom').trim() || 'rgba(42, 0, 214, 0)';
        const writeGradientTop = style.getPropertyValue('--chart-write-gradient-top').trim() || 'rgba(255, 159, 0, 0.5)';
        const writeGradientBottom = style.getPropertyValue('--chart-write-gradient-bottom').trim() || 'rgba(255, 159, 0, 0)';
        const lineTension = parseFloat(style.getPropertyValue('--chart-line-tension').trim() || '0.7');
        const lineWidth = parseInt(style.getPropertyValue('--chart-line-width').trim() || '2');
        const yAxisLabelColor = style.getPropertyValue('--chart-y-axis-label-color').trim() || '#888888';
        const yAxisGridColor = style.getPropertyValue('--chart-y-axis-grid-color').trim() || 'rgba(255, 255, 255, 0.3)';
        const yAxisFontSizeStr = style.getPropertyValue('--chart-y-axis-label-font-size').trim();
        const sceneScale = Math.max(0.25, parseFloat(style.getPropertyValue('--dashboard-scene-scale').trim() || '1') || 1);
        const yAxisLabelFontSize = yAxisFontSizeStr ? Math.round((parseInt(yAxisFontSizeStr, 10) || 9) * sceneScale) : Math.round(9 * sceneScale);

        return {
            readColor,
            writeColor,
            readGradientTop,
            readGradientBottom,
            writeGradientTop,
            writeGradientBottom,
            lineTension,
            lineWidth,
            yAxisLabelColor,
            yAxisGridColor,
            yAxisLabelFontSize
        };
    }

    refreshChartRuntimeStyles(force = false) {
        const config = this.getChartConfig();
        const styleSignature = [
            config.yAxisLabelColor,
            config.yAxisGridColor,
            config.yAxisLabelFontSize,
            config.lineWidth,
            config.lineTension
        ].join('|');

        if (!force && styleSignature === this.lastChartStyleSignature) {
            return false;
        }
        this.lastChartStyleSignature = styleSignature;

        Object.values(this.charts).forEach(chart => {
            if (!chart?.options?.scales?.y?.ticks) return;

            chart.options.scales.y.ticks.color = config.yAxisLabelColor;
            chart.options.scales.y.ticks.font = { size: config.yAxisLabelFontSize || 9 };
            chart.options.scales.y.grid = chart.options.scales.y.grid || {};
            chart.options.scales.y.grid.color = config.yAxisGridColor;

            if (Array.isArray(chart.data?.datasets)) {
                chart.data.datasets.forEach(dataset => {
                    dataset.borderWidth = config.lineWidth;
                    dataset.tension = config.lineTension;
                });
            }

            chart.resize();
            chart.update('none');
        });

        return true;
    }

    createChart(name) {
        const div = document.createElement('div');
        div.className = 'activity-card';
        div.id = `activity-card-${name}`;
        div.innerHTML = `
            <div class="activity-card-header">
                <div class="activity-title">${name}</div>
                <div class="activity-legend">
                    <div class="activity-legend-item">
                        <span class="activity-dot activity-dot-r"></span>R
                    </div>
                    <div class="activity-legend-item">
                        <span class="activity-dot activity-dot-w"></span>W
                    </div>
                </div>
            </div>
            <div class="activity-chart-wrap">
                <canvas id="activity-chart-${name}"></canvas>
                <div class="pool-state-overlay" id="pool-state-${name}"></div>
            </div>`;

        this.container.appendChild(div);

        // Sort cards alphabetically
        Array.from(this.container.children)
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach(n => this.container.appendChild(n));

        const ctx = document.getElementById(`activity-chart-${name}`).getContext('2d');

        // Get chart configuration from CSS variables
        const config = this.getChartConfig();

        // Create gradient fills using configured colors
        const gradientRead = ctx.createLinearGradient(0, 0, 0, 150);
        gradientRead.addColorStop(0, config.readGradientTop);
        gradientRead.addColorStop(1, config.readGradientBottom);

        const gradientWrite = ctx.createLinearGradient(0, 0, 0, 150);
        gradientWrite.addColorStop(0, config.writeGradientTop);
        gradientWrite.addColorStop(1, config.writeGradientBottom);

        // Convert hex colors to rgba if needed (for line colors)
        const hexToRgba = (hex, alpha = 1) => {
            if (!hex.startsWith('#')) return hex; // Already in rgba format
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        // Line colors - convert hex to rgba with full opacity
        const readColorRgba = hexToRgba(config.readColor, 1);
        const writeColorRgba = hexToRgba(config.writeColor, 1);

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(150).fill(''),
                datasets: [
                    {
                        data: [],
                        borderColor: readColorRgba,
                        backgroundColor: gradientRead,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: config.lineWidth,
                        tension: config.lineTension
                    },
                    {
                        data: [],
                        borderColor: writeColorRgba,
                        backgroundColor: gradientWrite,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: config.lineWidth,
                        tension: config.lineTension
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: config.yAxisGridColor },
                        ticks: {
                            color: config.yAxisLabelColor,
                            font: { size: config.yAxisLabelFontSize || 9 },
                            maxTicksLimit: 3,
                            callback: (v) => this.formatUnits(v)
                        }
                    },
                    x: { display: false }
                },
                plugins: { legend: { display: false } }
            }
        });
    }

    updatePoolStateOverlay(poolName) {
        const overlay = document.getElementById(`pool-state-${poolName}`);
        if (!overlay) return;

        const poolState = this.poolStates[poolName];

        if (poolState === 'FAULTED' || poolState === 'SUSPENDED') {
            // Show RED box with white "FAULTED" text (no chart)
            overlay.className = 'pool-state-overlay pool-faulted';
            overlay.innerHTML = '<div class="pool-state-text">FAULTED</div>';
            overlay.style.display = 'flex';
            // Hide the chart canvas
            const canvas = document.getElementById(`activity-chart-${poolName}`);
            if (canvas) canvas.style.opacity = '0';
        } else if (poolState === 'DEGRADED') {
            // Show "DEGRADED" overlay on top of chart
            overlay.className = 'pool-state-overlay pool-degraded';
            overlay.innerHTML = '<div class="pool-state-text">DEGRADED</div>';
            overlay.style.display = 'flex';
            // Keep chart visible
            const canvas = document.getElementById(`activity-chart-${poolName}`);
            if (canvas) canvas.style.opacity = '1';
        } else {
            // Hide overlay for healthy pools
            overlay.style.display = 'none';
            const canvas = document.getElementById(`activity-chart-${poolName}`);
            if (canvas) canvas.style.opacity = '1';
        }
    }

    recreateCharts() {
        // Destroy existing charts and recreate them with new configuration
        console.log('Recreating charts with updated configuration...');

        const poolNames = Object.keys(this.charts);

        // Destroy all existing charts
        for (const pool in this.charts) {
            if (this.charts[pool]) {
                this.charts[pool].destroy();
            }
        }

        // Clear the container
        if (this.container) {
            this.container.innerHTML = '';
        }

        // Reset charts object
        this.charts = {};

        // Recreate charts for each pool
        poolNames.forEach(pool => {
            this.charts[pool] = this.createChart(pool);
        });

        this.refreshChartRuntimeStyles(true);

        // Reflow the layout
        this.reflowLayout();
    }

    destroy() {
        if (this.reflowRaf) {
            window.cancelAnimationFrame(this.reflowRaf);
            this.reflowRaf = null;
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('dashboard-data-updated', this.onDashboardDataUpdated);

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Destroy all charts
        for (const pool in this.charts) {
            this.charts[pool].destroy();
        }

        this.charts = {};
    }
}

// Export for use in app.js
window.ActivityMonitor = ActivityMonitor;
