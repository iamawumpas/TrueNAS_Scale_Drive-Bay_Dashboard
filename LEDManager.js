export function getLEDClass(disk) {
    if (disk.status !== 'PRESENT') return '';
    const isAllocated = disk.pool_name && disk.pool_name !== "";
    const state = disk.state;

    // Priority 1: Resilvering/repairing (white)
    if (state === "RESILVERING") return 'white';

    if (isAllocated) {
        // Allocated disk states
        if (state === "OFFLINE") return 'allocated-offline';  // Blinks green/gray
        if (state === "ONLINE") return 'green';               // Solid green
        if (state === "DEGRADED") return 'orange';            // Solid orange (errors)
        if (state === "FAULTED") return 'red';                // Solid red (faulted)
        if (state === "UNAVAIL") return 'red';                // Solid red (unavailable)
        if (state === "REMOVED") return 'red';                // Solid red (removed)
    } else {
        // Unallocated disk states
        if (state === "ONLINE" || state === "UNALLOCATED") return 'purple';  // Solid purple (healthy spare)
        if (state === "DEGRADED") return 'unalloc-error';                     // Blinks purple/orange (spare with errors)
        if (state === "FAULTED") return 'unalloc-fault';                      // Blinks purple/red (spare faulted)
        if (state === "UNAVAIL") return 'unalloc-fault';                      // Blinks purple/red (spare unavailable)
        if (state === "REMOVED") return 'unalloc-fault';                      // Blinks purple/red (spare removed)
    }
    return '';
}

export const legendHTML = `
    <div class="status-label">
        <div class="legend-title">ZFS Status</div>
        <div class="legend-columns">
            <div class="label-group">
                <div class="label-item"><span class="dot green"></span> ALLOCATED-HEALTHY</div>
                <div class="label-item"><span class="dot allocated-offline"></span> ALLOCATED-OFFLINE</div>
                <div class="label-item"><span class="dot white"></span> RESILVERING</div>
            </div>
            <div class="label-group">
                <div class="label-item"><span class="dot orange"></span> ERROR</div>
                <div class="label-item"><span class="dot red"></span> FAULTED</div>
            </div>
            <div class="label-group">
                <div class="label-item"><span class="dot purple"></span> UNALLOCATED</div>
                <div class="label-item"><span class="dot unalloc-error"></span> UNALLOC-ERROR</div>
                <div class="label-item"><span class="dot unalloc-fault"></span> UNALLOC-FAULT</div>
            </div>
        </div>
    </div>
`;