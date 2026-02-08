// ActivityMonitor.js - ZFS Pool Read/Write Activity Monitor with Chart.js

class ActivityMonitor {
    constructor() {
        this.charts = {};
        this.container = null;
        this.chassis = null;
        this.updateInterval = null;
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
        
        const cardW = 250;
        const gap = 20;
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
            
            let needsReflow = false;
            
            for (const pool in data) {
                if (!this.charts[pool]) {
                    this.charts[pool] = this.createChart(pool);
                    needsReflow = true;
                }
                
                this.charts[pool].data.datasets[0].data = data[pool].r;
                this.charts[pool].data.datasets[1].data = data[pool].w;
                this.charts[pool].update('none');
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
            </div>`;
        
        this.container.appendChild(div);
        
        // Sort cards alphabetically
        Array.from(this.container.children)
            .sort((a, b) => a.id.localeCompare(b.id))
            .forEach(n => this.container.appendChild(n));

        const ctx = document.getElementById(`activity-chart-${name}`).getContext('2d');
        
        // Create gradient fills
        const gradientRead = ctx.createLinearGradient(0, 0, 0, 150);
        gradientRead.addColorStop(0, 'rgba(42, 0, 214, 0.5)');
        gradientRead.addColorStop(1, 'rgba(42, 0, 214, 0)');
        
        const gradientWrite = ctx.createLinearGradient(0, 0, 0, 150);
        gradientWrite.addColorStop(0, 'rgba(255, 159, 0, 0.5)');
        gradientWrite.addColorStop(1, 'rgba(255, 159, 0, 0)');

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(150).fill(''),
                datasets: [
                    {
                        data: [],
                        borderColor: 'rgba(42, 0, 214, 1)',
                        backgroundColor: gradientRead,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 2,
                        tension: 0.7
                    },
                    {
                        data: [],
                        borderColor: 'rgba(255, 159, 0, 1)',
                        backgroundColor: gradientWrite,
                        fill: true,
                        pointRadius: 0,
                        borderWidth: 2,
                        tension: 0.7
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
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#888',
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
