export function getLEDClass(disk) {
    if (disk.status !== 'PRESENT') return '';
    const isAllocated = disk.pool_name && disk.pool_name !== "";
    const state = disk.state;

    if (state === "RESILVERING") return 'white';

    if (isAllocated) {
        if (state === "OFFLINE") return 'allocated-offline';
        if (state === "ONLINE") return 'green';
        if (state === "DEGRADED") return 'orange';
        if (state === "FAULTED") return 'red';
    } else {
        if (state === "ONLINE" || state === "UNALLOCATED") return 'purple';
        if (state === "DEGRADED") return 'unalloc-error';
        if (state === "FAULTED") return 'unalloc-fault';
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