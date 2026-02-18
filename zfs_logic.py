import subprocess
import json
import re

# Global flag to track API availability
API_AVAILABLE = True
API_ERROR_MESSAGE = ""

def check_truenas_api():
    """Check if TrueNAS Scale API (midclt) is available"""
    global API_AVAILABLE, API_ERROR_MESSAGE
    try:
        subprocess.check_output(['which', 'midclt'], stderr=subprocess.DEVNULL, text=True)
        return True
    except Exception as e:
        API_AVAILABLE = False
        API_ERROR_MESSAGE = "TrueNAS Scale API (midclt) not found"
        return False

def get_zfs_topology_via_api(uuid_to_dev_map):
    """Get ZFS topology using TrueNAS Scale API (preferred method)"""
    global API_AVAILABLE, API_ERROR_MESSAGE
    zfs_map = {}
    pool_states = {}
    
    try:
        # Query pool data via TrueNAS middleware
        output = subprocess.check_output(
            ['midclt', 'call', 'pool.query'],
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        pools = json.loads(output)
        
        for pool in pools:
            pool_name = pool.get('name', 'unknown')
            pool_status = pool.get('status', 'UNKNOWN')
            pool_healthy = pool.get('healthy', True)
            
            # Determine pool state
            if not pool_healthy:
                if pool_status in ['FAULTED', 'UNAVAIL']:
                    pool_state = 'FAULTED'
                elif pool_status == 'DEGRADED':
                    pool_state = 'DEGRADED'
                elif pool_status == 'SUSPENDED':
                    pool_state = 'SUSPENDED'
                else:
                    pool_state = pool_status
            else:
                pool_state = 'ONLINE'
            
            pool_states[pool_name] = pool_state
            
            # Check for active resilver/scrub/repair operation at pool level
            scan = pool.get('scan', {})
            scan_function = scan.get('function', '')
            scan_state = scan.get('state', 'FINISHED')
            is_active_resilver = scan_function == 'RESILVER' and scan_state != 'FINISHED'
            is_active_rebuild = scan_function == 'REBUILD' and scan_state != 'FINISHED'
            is_active_repair = scan_function == 'REPAIR' and scan_state != 'FINISHED'
            has_active_scan = is_active_resilver or is_active_rebuild or is_active_repair
            
            if has_active_scan:
                print(f"ZFS API: Pool {pool_name} has active {scan_function} (state: {scan_state})")
            
            # Process topology
            topology = pool.get('topology', {})
            disk_idx = 0
            
            # Check data vdevs
            for vdev_type in ['data', 'cache', 'log', 'spare']:
                vdevs = topology.get(vdev_type, [])
                for vdev in vdevs:
                    disk_idx = process_vdev(vdev, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map)
            
            # If there's an active resilver/rebuild/repair, mark all disks in this pool as RESILVERING
            if has_active_scan:
                for dev_base, info in zfs_map.items():
                    if info['pool'] == pool_name:
                        info['state'] = 'RESILVERING'
                        print(f"ZFS API: Disk {dev_base} marked as RESILVERING due to active pool {scan_function}")
        
        # Store pool states in first disk of each pool for frontend access
        for dev_base, info in zfs_map.items():
            info['pool_state'] = pool_states.get(info['pool'], 'UNKNOWN')
        
        API_AVAILABLE = True
        return zfs_map, pool_states
        
    except subprocess.TimeoutExpired:
        API_AVAILABLE = False
        API_ERROR_MESSAGE = "TrueNAS API timeout"
        print(f"API Error: {API_ERROR_MESSAGE}")
        return fallback_to_zpool_status(uuid_to_dev_map)
    except subprocess.CalledProcessError as e:
        API_AVAILABLE = False
        API_ERROR_MESSAGE = f"TrueNAS API call failed: {e.returncode}"
        print(f"API Error: {API_ERROR_MESSAGE}")
        return fallback_to_zpool_status(uuid_to_dev_map)
    except json.JSONDecodeError as e:
        API_AVAILABLE = False
        API_ERROR_MESSAGE = "TrueNAS API response invalid (API may have changed)"
        print(f"API Error: {API_ERROR_MESSAGE}")
        return fallback_to_zpool_status(uuid_to_dev_map)
    except Exception as e:
        API_AVAILABLE = False
        API_ERROR_MESSAGE = f"TrueNAS API error: {str(e)}"
        print(f"API Error: {API_ERROR_MESSAGE}")
        return fallback_to_zpool_status(uuid_to_dev_map)

def process_vdev(vdev, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map):
    """Recursively process vdev and its children"""
    vdev_type = vdev.get('type', '')
    vdev_status = vdev.get('status', 'ONLINE')
    
    # Process children (actual disks)
    children = vdev.get('children', [])
    if children:
        for child in children:
            disk_idx = process_vdev(child, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map)
    else:
        # This is a leaf node (actual disk)
        device_path = vdev.get('path', '')
        device_guid = vdev.get('guid', '')
        stats = vdev.get('stats', {})
        
        # Extract error counts (direct integers from API!)
        read_errors = stats.get('read_errors', 0)
        write_errors = stats.get('write_errors', 0)
        checksum_errors = stats.get('checksum_errors', 0)
        total_errors = read_errors + write_errors + checksum_errors
        
        # Get disk identifier (UUID or device name)
        disk_id = None
        if '/dev/disk/by-partuuid/' in device_path:
            disk_id = device_path.split('/')[-1]
        elif '/dev/' in device_path:
            disk_id = device_path.split('/')[-1]
        
        if disk_id:
            disk_idx += 1
            dev_base = uuid_to_dev_map.get(disk_id, disk_id).rstrip('0123456789')
            
            # Determine disk state based on priority
            final_state = vdev_status
            
            # Priority 1: Pool-level issues
            if pool_state in ['FAULTED', 'SUSPENDED']:
                final_state = 'FAULTED'
                print(f"ZFS API: Disk {dev_base} in {pool_state} pool {pool_name} - marking as FAULTED")
            
            # Priority 2: Disk is being repaired/resilvered
            elif vdev_status in ['REBUILDING', 'RESILVERING']:
                final_state = 'RESILVERING'
                print(f"ZFS API: Disk {dev_base} is resilvering")
            
            # Priority 3: Disk unavailable or removed
            elif vdev_status in ['UNAVAIL', 'REMOVED']:
                final_state = 'FAULTED'
                print(f"ZFS API: Disk {dev_base} is {vdev_status} - marking as FAULTED")
            
            # Priority 4: Disk has errors
            elif total_errors > 0:
                final_state = 'DEGRADED'
                print(f"ZFS API: Disk {dev_base} has {total_errors} errors (R:{read_errors} W:{write_errors} C:{checksum_errors}) - marking as DEGRADED")
            
            # Priority 5: Explicit states
            elif vdev_status == 'FAULTED':
                final_state = 'FAULTED'
            elif vdev_status == 'DEGRADED':
                final_state = 'DEGRADED'
            elif vdev_status == 'OFFLINE':
                final_state = 'OFFLINE'
            elif vdev_status == 'ONLINE':
                final_state = 'ONLINE'
            
            zfs_map[dev_base] = {
                "pool": pool_name,
                "idx": disk_idx,
                "state": final_state,
                "read_errors": read_errors,
                "write_errors": write_errors,
                "cksum_errors": checksum_errors,
                "pool_state": pool_state,
                "vdev_status": vdev_status
            }
    
    return disk_idx

def fallback_to_zpool_status(uuid_to_dev_map):
    """Fallback to zpool status parsing if API unavailable"""
    print("Falling back to zpool status parsing...")
    zfs_map = {}
    pool_states = {}
    pool_active_resilver = {}  # Track which pools have active resilver operations
    
    try:
        z_out = subprocess.check_output(['zpool', 'status', '-v', '-p'], text=True)
        current_pool = None
        disk_idx = 0
        current_pool_state = 'ONLINE'
        
        # Regex patterns for different line types
        DISK_WITH_ERRORS = re.compile(
            r'([0-9a-f-]{36}|sd[a-z]+[0-9]?|vd[a-z]+[0-9]?)\s+(ONLINE|DEGRADED|FAULTED|OFFLINE)\s+(\d+)\s+(\d+)\s+(\d+)'
        )
        DISK_NO_ERRORS = re.compile(
            r'([0-9a-f-]{36}|sd[a-z]+[0-9]?|vd[a-z]+[0-9]?)\s+(UNAVAIL|REMOVED)'
        )
        SCAN_ACTIVE = re.compile(
            r'scan:\s+(resilver|rebuild|repair|scrub)\s+in\s+progress',
            re.IGNORECASE
        )
        
        for line in z_out.split('\n'):
            line_stripped = line.strip()
            
            if line_stripped.startswith('pool:'):
                current_pool = line_stripped.split(':')[1].strip()
                disk_idx = 0
                current_pool_state = 'ONLINE'
                pool_active_resilver[current_pool] = False
            
            if line_stripped.startswith('state:') and current_pool:
                current_pool_state = line_stripped.split(':')[1].strip()
                pool_states[current_pool] = current_pool_state
                print(f"ZFS: Pool {current_pool} state: {current_pool_state}")
            
            # Check for active resilver/rebuild/repair/scrub operation
            if line_stripped.startswith('scan:') and current_pool:
                if SCAN_ACTIVE.search(line_stripped):
                    pool_active_resilver[current_pool] = True
                    print(f"ZFS: Pool {current_pool} has active resilver/repair operation")
            
            # Try pattern with errors
            match = DISK_WITH_ERRORS.search(line_stripped)
            if match and current_pool and "STATE" not in line_stripped:
                uid, state = match.group(1), match.group(2)
                read_err, write_err, cksum_err = int(match.group(3)), int(match.group(4)), int(match.group(5))
                total_err = read_err + write_err + cksum_err
                
                disk_idx += 1
                dev_base = uuid_to_dev_map.get(uid, uid).rstrip('0123456789')
                
                is_repairing = any(x in line_stripped.lower() for x in ['resilvering', 'repairing', 'replacing'])
                
                # Determine state
                if current_pool_state in ['FAULTED', 'SUSPENDED']:
                    final_state = 'FAULTED'
                elif is_repairing:
                    final_state = 'RESILVERING'
                elif total_err > 0:
                    final_state = 'DEGRADED'
                else:
                    final_state = state
                
                zfs_map[dev_base] = {
                    "pool": current_pool,
                    "idx": disk_idx,
                    "state": final_state,
            
            # Try pattern with errors
            match = DISK_WITH_ERRORS.search(line_stripped)
            if match and current_pool and "STATE" not in line_stripped:
                uid, state = match.group(1), match.group(2)
                read_err, write_err, cksum_err = int(match.group(3)), int(match.group(4)), int(match.group(5))
                total_err = read_err + write_err + cksum_err
                
                disk_idx += 1
                dev_base = uuid_to_dev_map.get(uid, uid).rstrip('0123456789')
                
                is_repairing = any(x in line_stripped.lower() for x in ['resilvering', 'repairing', 'replacing'])
                
                # Determine state
                if current_pool_state in ['FAULTED', 'SUSPENDED']:
                    final_state = 'FAULTED'
                elif is_repairing:
                    final_state = 'RESILVERING'
                elif total_err > 0:
                    final_state = 'DEGRADED'
                else:
                    final_state = state
                
                zfs_map[dev_base] = {
                    "pool": current_pool,
                    "idx": disk_idx,
                    "state": final_state,
                    "read_errors": read_err,
                    "write_errors": write_err,
                    "cksum_errors": cksum_err,
                    "pool_state": current_pool_state
                }
                continue
            
            # Try pattern without errors (UNAVAIL, REMOVED)
            match = DISK_NO_ERRORS.search(line_stripped)
            if match and current_pool:
                uid, state = match.group(1), match.group(2)
                disk_idx += 1
                dev_base = uuid_to_dev_map.get(uid, uid).rstrip('0123456789')
                
                zfs_map[dev_base] = {
                    "pool": current_pool,
                    "idx": disk_idx,
                    "state": 'FAULTED',  # UNAVAIL/REMOVED = FAULTED (red)
                    "read_errors": 0,
                    "write_errors": 0,
                    "cksum_errors": 0,
                    "pool_state": current_pool_state
                }
        
        # Mark all disks in pools with active resilver operations
        for pool_name, has_resilver in pool_active_resilver.items():
            if has_resilver:
                for dev_base, info in zfs_map.items():
                    if info['pool'] == pool_name:
                        info['state'] = 'RESILVERING'
                        print(f"ZFS: Disk {dev_base} marked as RESILVERING due to active pool operation")
    
    except Exception as e:
        print(f"Fallback ZFS Logic Error: {e}")
    
    return zfs_map, pool_states

def get_zfs_topology(uuid_to_dev_map):
    """Main entry point - tries API first, falls back to zpool status"""
    if check_truenas_api():
        return get_zfs_topology_via_api(uuid_to_dev_map)
    else:
        print("TrueNAS API not available, using zpool status fallback")
        return fallback_to_zpool_status(uuid_to_dev_map)

def get_api_status():
    """Return API availability status for frontend"""
    return {
        "available": API_AVAILABLE,
        "error_message": API_ERROR_MESSAGE if not API_AVAILABLE else ""
    }