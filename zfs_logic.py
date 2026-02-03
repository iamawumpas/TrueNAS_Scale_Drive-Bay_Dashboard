import subprocess
import re

def get_zfs_topology(uuid_to_dev_map):
    zfs_map = {}
    try:
        z_out = subprocess.check_output(['zpool', 'status'], text=True)
        current_pool = None
        disk_idx = 0

        for line in z_out.split('\n'):
            line = line.strip()
            if line.startswith('pool:'):
                current_pool = line.split(':')[1].strip()
                disk_idx = 0
            
            # Match disk UID/Name and its specific status
            match = re.search(r'([0-9a-f-]{36}|vda[0-9]|sd[a-z]+[0-9]?)\s+([A-Z]+)', line)
            if match and current_pool and "STATE" not in line and current_pool not in line:
                uid, state = match.group(1), match.group(2)
                disk_idx += 1
                dev_base = uuid_to_dev_map.get(uid, uid).rstrip('0123456789')
                
                # Check if THIS specific line mentions resilvering
                # ZFS usually marks individual disks with (resilvering) text next to the state
                is_this_disk_repairing = "resilvering" in line.lower() or "replacing" in line.lower()
                
                zfs_map[dev_base] = {
                    "pool": current_pool, 
                    "idx": disk_idx, 
                    "state": "RESILVERING" if is_this_disk_repairing else state
                }
    except Exception as e:
        print(f"ZFS Logic Error: {e}")
    return zfs_map