import subprocess
import json
import re
import os
import glob

# Global flag to track API availability
API_AVAILABLE = True
API_ERROR_MESSAGE = ""


def _normalize_temp_device_name(name):
    value = str(name or '').strip().lower()
    if value.startswith('/dev/'):
        value = value.split('/')[-1]
    return value


def _strip_partition_suffix(name):
    value = _normalize_temp_device_name(name)
    if not value:
        return value

    # by-id partition format: ata-...-part1
    value = re.sub(r'-part\d+$', '', value)
    # nvme partition format: nvme0n1p2
    value = re.sub(r'^(nvme\d+n\d+)p\d+$', r'\1', value)
    # common block device partition formats: sda1, vda2, xvda3
    value = re.sub(r'^((?:sd|vd|xvd)[a-z]+)\d+$', r'\1', value)
    return value


def _fetch_disk_temperatures_via_api():
    """Return disk temperatures from smartctl as {dev_name: temp_c}.

    Queries S.M.A.R.T. data for all ATA devices in /dev/disk/by-id/.
    Temperatures are optional metadata: errors are swallowed so topology still updates.
    """
    try:
        temps = {}
        disk_paths = sorted(glob.glob('/dev/disk/by-id/ata-*'))

        for disk_path in disk_paths:
            device_id = os.path.basename(disk_path)
            if re.search(r'-part\d+$', device_id):
                continue

            try:
                proc = subprocess.run(
                    ['smartctl', '-a', '-j', disk_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    timeout=5,
                    check=False
                )
                smart_out = proc.stdout or ''
                if not smart_out.strip():
                    continue
                payload = json.loads(smart_out)
            except Exception:
                continue

            temp_value = None
            temp_obj = payload.get('temperature')
            if isinstance(temp_obj, dict):
                try:
                    current = temp_obj.get('current')
                    if current is not None:
                        temp_value = int(round(float(current)))
                except Exception:
                    temp_value = None

            if temp_value is None:
                table = payload.get('ata_smart_attributes', {}).get('table', [])
                for attr in table:
                    if attr.get('id') not in (190, 194):
                        continue
                    raw = attr.get('raw', {})
                    raw_val = raw.get('value')
                    raw_text = str(raw.get('string') or '')
                    candidate = raw_val
                    if candidate is None:
                        match = re.search(r'(-?\d+)', raw_text)
                        if match:
                            candidate = match.group(1)
                    try:
                        if candidate is not None:
                            temp_value = int(round(float(candidate)))
                            break
                    except Exception:
                        continue

            if temp_value is None or not (0 <= temp_value <= 150):
                continue

            by_id_name = _normalize_temp_device_name(device_id)
            if by_id_name:
                temps[by_id_name] = temp_value
                by_id_base = _strip_partition_suffix(by_id_name)
                if by_id_base:
                    temps[by_id_base] = temp_value
                if by_id_name.startswith('ata-'):
                    temps[by_id_name[4:]] = temp_value

            # Runtime alias only: lets matching succeed if pool topology currently reports
            # /dev/sdX style paths; this is recalculated each scan and not persisted.
            resolved_name = _normalize_temp_device_name(os.path.realpath(disk_path))
            if resolved_name:
                temps[resolved_name] = temp_value
                resolved_base = _strip_partition_suffix(resolved_name)
                if resolved_base:
                    temps[resolved_base] = temp_value

        return temps
    except Exception:
        return {}


def _lookup_temperature_for_disk(device_path, dev_base, temp_map):
    if not temp_map:
        return None

    path_name = _normalize_temp_device_name(device_path)
    path_base = _strip_partition_suffix(path_name)
    dev_base_norm = _strip_partition_suffix(dev_base)

    if path_name in temp_map:
        return temp_map[path_name]

    if path_base in temp_map:
        return temp_map[path_base]

    if dev_base_norm in temp_map:
        return temp_map[dev_base_norm]

    # Partition-suffixed names (e.g. sda1, nvme0n1p2) still map to base device temps.
    if path_base:
        base = _strip_partition_suffix(path_base)
        if base in temp_map:
            return temp_map[base]

    if dev_base_norm:
        for dev_name, temp_c in temp_map.items():
            if dev_name.startswith(dev_base_norm):
                return temp_c

    return None

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
        temp_map = _fetch_disk_temperatures_via_api()
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
                    disk_idx = process_vdev(vdev, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map, temp_map)
            
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

def process_vdev(vdev, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map, temp_map):
    """Recursively process vdev and its children"""
    vdev_type = vdev.get('type', '')
    vdev_status = vdev.get('status', 'ONLINE')
    
    # Process children (actual disks)
    children = vdev.get('children', [])
    if children:
        for child in children:
            disk_idx = process_vdev(child, pool_name, pool_state, disk_idx, uuid_to_dev_map, zfs_map, temp_map)
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
            dev_base = _strip_partition_suffix(uuid_to_dev_map.get(disk_id, disk_id))
            temp_c = _lookup_temperature_for_disk(device_path, dev_base, temp_map)
            
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
                "vdev_status": vdev_status,
                "temperature_c": temp_c
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
                dev_base = _strip_partition_suffix(uuid_to_dev_map.get(uid, uid))
                
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
                    "pool_state": current_pool_state,
                    "temperature_c": None
                }
            
            # Try pattern without errors (UNAVAIL, REMOVED)
            match = DISK_NO_ERRORS.search(line_stripped)
            if match and current_pool:
                uid, state = match.group(1), match.group(2)
                disk_idx += 1
                dev_base = _strip_partition_suffix(uuid_to_dev_map.get(uid, uid))
                
                zfs_map[dev_base] = {
                    "pool": current_pool,
                    "idx": disk_idx,
                    "state": 'FAULTED',  # UNAVAIL/REMOVED = FAULTED (red)
                    "read_errors": 0,
                    "write_errors": 0,
                    "cksum_errors": 0,
                    "pool_state": current_pool_state,
                    "temperature_c": None
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