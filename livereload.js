// Live Reload Script
(function() {
    let lastModified = {};
    const checkInterval = 1000; // Check every second
    
    const filesToWatch = [
        'app.js',
        'Bay.js',
        'Chassis.js',
        'DiskInfo.js',
        'LEDManager.js',
        'style.css',
        'Base.css',
        'Bay.css',
        'Chassis.css',
        'LEDs.css',
        'index.html'
    ];

    async function checkFiles() {
        try {
            const response = await fetch('/livereload-status');
            const data = await response.json();
            
            for (const file of filesToWatch) {
                const fileTime = data[file];
                if (fileTime) {
                    if (lastModified[file] && lastModified[file] !== fileTime) {
                        console.log(`File changed: ${file} - Reloading...`);
                        location.reload();
                        return;
                    }
                    lastModified[file] = fileTime;
                }
            }
        } catch (error) {
            console.error('Live reload check failed:', error);
        }
    }

    // Start checking after initial page load
    setTimeout(() => {
        checkFiles(); // Initialize lastModified
        setInterval(checkFiles, checkInterval);
    }, 1000);
})();
