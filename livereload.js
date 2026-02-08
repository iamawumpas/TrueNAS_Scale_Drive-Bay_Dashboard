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
        'index.html',
        'config.json'
    ];

    async function checkFiles() {
        try {
            const response = await fetch('/livereload-status');
            const data = await response.json();
            
            for (const file of filesToWatch) {
                const fileTime = data[file];
                if (fileTime) {
                    if (lastModified[file] && lastModified[file] !== fileTime) {
                        console.log(`File changed: ${file}`);
                        
                        if (file === 'config.json') {
                            // For config changes, skip if port-change modal is showing
                            // (MenuSystem will handle navigation)
                            if (document.getElementById('port-change-modal')) {
                                console.log('Port change modal visible - letting MenuSystem handle navigation');
                                break;
                            }
                            
                            // For other config changes, just reload
                            console.log('Config changed - reloading page...');
                            location.reload();
                        } else {
                            // For code changes, just reload the page
                            console.log(`Reloading...`);
                            location.reload();
                        }
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
