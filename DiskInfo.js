export function getDiskData(disk) {
    const isAllocated = disk.pool_name && disk.pool_name !== "";
    return {
        sn: disk.sn ? disk.sn.slice(-4) : "&nbsp;",
        size: disk.size_bytes ? (disk.size_bytes / (1024**4)).toFixed(1) + "TB" : "&nbsp;",
        pool: isAllocated ? disk.pool_name.substring(0, 8) : "&nbsp;",
        idx: disk.pool_idx ? `#${disk.pool_idx}` : "&nbsp;"
    };
}