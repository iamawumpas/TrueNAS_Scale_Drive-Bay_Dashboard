// ActivityMonitor.js - ZFS Pool Read/Write Activity Monitor with Chart.js

class ActivityMonitor {
    constructor() {
        this.charts = {};
        this.container = null;
        this.chassis = null;
        this.updateInterval = null;
        this.poolStates = {};  // Track pool states from API
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
        
        // Handle window resize for responsive layout
        window.addEventListener('resize', () => this.reflowLayout());
        
        // Store reference globally for menu system to trigger updates
        window.activityMonitor = this;
    }

    formatUnits(value) {
        if (value >= 1073741824) return (value / 1073741824).toFixed(1) + ' GB';
        if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB';
        if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
        return value.toFixed(0) + ' B';
    }

    reflowLayout() {
        const pools = Object.keys(this.charts).length;
        if (pools === 0) {
            this.chassis.style.display = 'none';
            return;
        }
        
        this.chassis.style.display = 'flex';
        
        // Get card width and gap from CSS variables
        const style = getComputedStyle(document.documentElement);
        const cardWStr = style.getPropertyValue('--chart-card-width').trim() || '250px';
        const gapStr = style.getPropertyValue('--chart-container-gap').trim() || '20px';
        
        const cardW = parseInt(cardWStr);
        const gap = parseInt(gapStr);
        const paddingTotal = 0;
        const fudge = window.innerWidth * 0.01;
        const maxAvailable = document.documentElement.clientWidth * 0.95;
        
        let columns = Math.floor((maxAvailable - paddingTotal + gap) / (cardW + gap));
        columns = Math.max(1, Math.min(columns, pools));
        
        const finalWidth = (columns * cardW) + ((columns - 1) * gap) + paddingTotal + fudge;
        this.chassis.style.width = `${finalWidth}px`;
    }

    async updateLoop() {
        try {
            const res = await fetch('/pool-activity?t=' + Date.now());
            const payload = await res.json();
            const data = payload.stats;
            
            // Fetch pool states from main data endpoint
            const dataRes = await fetch('/data?t=' + Date.now());
            const mainData = await dataRes.json();
            this.poolStates = mainData.pool_states || {};
            
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
            
            if (needsReflow) {
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
            yAxisGridColor
        };
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
                            font: { size: 9 },
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
        
        // Reflow the layout
        this.reflowLayout();
    }

    destroy() {
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
