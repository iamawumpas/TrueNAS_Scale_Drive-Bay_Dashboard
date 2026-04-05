import http.server, socketserver, json, time, subprocess, socket, os, re, threading, shutil
import urllib.request, urllib.error
from collections import deque
from zfs_logic import get_zfs_topology, get_api_status
from .config import load_config, load_style_config, CONFIG_FILE, DEFAULT_CONFIG_JSON, BASE_DIR
from .topology import get_controller_capacity, is_virtual_storage_controller, get_ircu_slot_topology, lookup_zfs_disk_entry, _find_ircu_adapter, normalize_pci_address, _parse_ircu_display, build_serial_to_dev_map

CONFIG_MTIME = 0
CONFIG_CACHE = None

GLOBAL_DATA = {
    "topology": {},
    "io_activity": {},
    "hostname": socket.gethostname(),
    "config": {},
    "pool_activity_history": {},
    "services": {
        "tracked": [],
        "stopped": [],
        "hasStopped": False,
        "source": "unknown",
        "error": None
    },
    "alerts": {
        "poolDegraded": False,
        "diskFaultOrErrors": False,
        "highTemperature": False,
        "activeCount": 0,
        "activeNames": [],
        "muteActive": False,
        "muteRemainingSec": 0
    }
}

GITHUB_OWNER = 'iamawumpas'
GITHUB_REPO = 'TrueNAS_Scale_Drive-Bay_Dashboard'
GITHUB_BRANCH = 'main'
REPO_SYNC_TIMEOUT_SECS = 12
ALERT_MUTE_SECONDS = 300
ALERT_MUTE_UNTIL_TS = 0.0
LOCAL_VERSION_FILE = 'VERSION'
REPO_SYNC_ENABLED_OVERRIDE = None

# Critical runtime and startup files that can be restored if accidentally deleted.
REPO_SYNC_TRACKED_FILES = [
    'index.html', 'app.js', 'MenuSystem.js', 'ActivityMonitor.js', 'DecorationTexture.js',
    'geometry.js', 'livereload.js', 'style.css', 'Base.css', 'Menu.css', 'ActivityMonitor.css',
    'service.py', 'start_up.sh', 'zfs_logic.py',
    'js/utils.js', 'js/data.js', 'js/topology.js', 'js/styleVars.js', 'js/renderer.js',
    'js/configStore.js', 'js/stylePreview.js', 'js/menuBuilder.js',
    'py/__init__.py', 'py/config.py', 'py/topology.py', 'py/server.py',
    'CHANGELOG.md', 'VERSION'
]


def _nested_get(obj, path, fallback=None):
    cur = obj
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return fallback
        cur = cur[key]
    return cur


def _repo_sync_enabled(config):
    if REPO_SYNC_ENABLED_OVERRIDE is not None:
        return bool(REPO_SYNC_ENABLED_OVERRIDE)
    return bool(_nested_get(config or {}, ['ui', 'menu', 'repo_sync', 'enabled'], False))


def _github_json(url):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/vnd.github+json',
        'User-Agent': f'{GITHUB_REPO}-repo-sync'
    })
    with urllib.request.urlopen(req, timeout=REPO_SYNC_TIMEOUT_SECS) as response:
        charset = response.headers.get_content_charset() or 'utf-8'
        return json.loads(response.read().decode(charset))


def _github_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': f'{GITHUB_REPO}-repo-sync'})
    with urllib.request.urlopen(req, timeout=REPO_SYNC_TIMEOUT_SECS) as response:
        charset = response.headers.get_content_charset() or 'utf-8'
        return response.read().decode(charset)


def _parse_semver(tag):
    value = str(tag or '').strip().lower()
    if value.startswith('v.'):
        value = value[2:]
    elif value.startswith('v'):
        value = value[1:]
    value = value.lstrip('.')
    parts = value.split('.')
    if len(parts) not in (2, 3):
        return None
    try:
        nums = [int(p) for p in parts]
        if len(nums) == 2:
            nums.append(0)
        return tuple(nums)
    except Exception:
        return None


def _read_local_version():
    version_path = os.path.join(BASE_DIR, LOCAL_VERSION_FILE)
    try:
        with open(version_path, 'r', encoding='utf-8') as fh:
            raw = fh.read().strip()
            if raw:
                if _parse_semver(raw):
                    return raw if str(raw).startswith('v') else f'v{raw}'
    except Exception:
        pass

    changelog_path = os.path.join(BASE_DIR, 'CHANGELOG.md')
    try:
        with open(changelog_path, 'r', encoding='utf-8') as fh:
            for line in fh:
                match = re.match(r'^##\s+Version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?):\s*$', line.strip())
                if match:
                    return f"v{match.group(1)}"
    except Exception:
        return None
    return None


def _read_latest_remote_version():
    latest_url = f'https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest'
    try:
        payload = _github_json(latest_url)
        tag = payload.get('tag_name')
        if tag:
            return str(tag)
    except Exception:
        pass

    tags_url = f'https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/tags?per_page=1'
    payload = _github_json(tags_url)
    if isinstance(payload, list) and payload:
        return str(payload[0].get('name') or '')
    return None


def _check_missing_tracked_files():
    missing = []
    for rel in REPO_SYNC_TRACKED_FILES:
        if not os.path.exists(os.path.join(BASE_DIR, rel)):
            missing.append(rel)
    return missing


def _restore_missing_tracked_files(ref=GITHUB_BRANCH):
    restored = []
    failed = {}
    for rel in _check_missing_tracked_files():
        try:
            raw_url = f'https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{ref}/{rel}'
            content = _github_text(raw_url)
            out_path = os.path.join(BASE_DIR, rel)
            out_dir = os.path.dirname(out_path)
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(out_path, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(content)
            restored.append(rel)
        except Exception as ex:
            failed[rel] = str(ex)
    return restored, failed


def _download_and_install_tracked_files(ref):
    fetched = {}
    failed = {}

    # Download everything first so we only restart after complete + verified installation.
    for rel in REPO_SYNC_TRACKED_FILES:
        try:
            raw_url = f'https://raw.githubusercontent.com/{GITHUB_OWNER}/{GITHUB_REPO}/{ref}/{rel}'
            fetched[rel] = _github_text(raw_url)
        except Exception as ex:
            failed[rel] = str(ex)

    if failed:
        return [], failed

    installed = []
    for rel, content in fetched.items():
        try:
            out_path = os.path.join(BASE_DIR, rel)
            out_dir = os.path.dirname(out_path)
            if out_dir:
                os.makedirs(out_dir, exist_ok=True)
            with open(out_path, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(content)

            # Verify file contents after write.
            with open(out_path, 'r', encoding='utf-8') as verify_fh:
                if verify_fh.read() != content:
                    raise RuntimeError('verification mismatch after write')

            installed.append(rel)
        except Exception as ex:
            failed[rel] = str(ex)

    return installed, failed


def _startup_script_path():
    return os.path.join(BASE_DIR, 'start_up.sh')


def _launch_startup_script():
    startup_script = _startup_script_path()
    if not os.path.exists(startup_script):
        return False, 'start_up.sh not found'
    subprocess.Popen(['bash', startup_script], start_new_session=True)
    return True, None


def _repo_sync_status_payload(config):
    local_version = _read_local_version()
    remote_version = None
    remote_error = None
    try:
        remote_version = _read_latest_remote_version()
    except Exception as ex:
        remote_error = str(ex)

    local_semver = _parse_semver(local_version)
    remote_semver = _parse_semver(remote_version)
    update_available = bool(local_semver and remote_semver and remote_semver > local_semver)

    return {
        'enabled': _repo_sync_enabled(config),
        'localVersion': local_version,
        'remoteVersion': remote_version,
        'updateAvailable': update_available,
        'missingFiles': _check_missing_tracked_files(),
        'remoteError': remote_error
    }

def get_port():
    """Get the listening port from config or return default"""
    try:
        config = load_config()
        if config and isinstance(config.get('network'), dict):
            port = config['network'].get('port', 8010)
            return int(port)
    except Exception as e:
        print(f"Error reading port from config: {e}")
    return 8010


def get_io_snapshot():
    activity = {}
    try:
        with open('/proc/diskstats', 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) < 13: continue
                dev, r, w = parts[2], int(parts[3]), int(parts[7])
                activity[dev] = r + w
    except: pass
    return activity


def _to_float_or_none(value):
    try:
        return float(value)
    except Exception:
        return None


def _to_int_or_zero(value):
    try:
        return int(value)
    except Exception:
        return 0


def _alert_mute_remaining_sec():
    remaining = ALERT_MUTE_UNTIL_TS - time.time()
    if remaining <= 0:
        return 0
    return int(remaining + 0.999)


def _with_alert_mute_state(alerts):
    mute_remaining = _alert_mute_remaining_sec()
    payload = dict(alerts or {})
    payload['muteActive'] = mute_remaining > 0
    payload['muteRemainingSec'] = mute_remaining
    return payload


def _compute_alerts_from_global_state():
    pool_states = GLOBAL_DATA.get("pool_states") or {}
    topology = GLOBAL_DATA.get("topology") or {}

    pool_degraded = any(str(state or '').upper() != 'ONLINE' for state in pool_states.values())
    disk_fault_or_errors = False
    high_temperature = False
    services_payload = GLOBAL_DATA.get("services") or {}
    services_stopped = bool(services_payload.get("hasStopped", False))

    for enclosure in topology.values():
        for disk in enclosure.get("disks", []):
            if disk.get("status") != "PRESENT":
                continue

            disk_state = str(disk.get("state") or '').upper()
            if disk_state in ('FAULTED', 'OFFLINE', 'UNAVAIL', 'REMOVED'):
                disk_fault_or_errors = True

            read_errors = _to_int_or_zero(disk.get("read_errors"))
            write_errors = _to_int_or_zero(disk.get("write_errors"))
            cksum_errors = _to_int_or_zero(disk.get("cksum_errors"))
            if (read_errors + write_errors + cksum_errors) > 0:
                disk_fault_or_errors = True

            temperature_c = _to_float_or_none(disk.get("temperature_c"))
            if temperature_c is not None and temperature_c > 40.0:
                high_temperature = True

            if disk_fault_or_errors and high_temperature:
                break
        if disk_fault_or_errors and high_temperature:
            break

    names = []
    if pool_degraded:
        names.append('Pool Health Alert')
    if disk_fault_or_errors:
        names.append('Disk Fault/Error Alert')
    if high_temperature:
        names.append('High Temperature Alert')
    if services_stopped:
        names.append('Services Stopped Alert')

    return {
        "poolDegraded": pool_degraded,
        "diskFaultOrErrors": disk_fault_or_errors,
        "highTemperature": high_temperature,
        "servicesStopped": services_stopped,
        "activeCount": len(names),
        "activeNames": names
    }


def _host_beep_once():
    try:
        if shutil.which('beep'):
            subprocess.Popen(['beep', '-f', '1400', '-l', '120'])
            return True
        # Console bell fallback for environments without the beep utility.
        print('\a', end='', flush=True)
        return True
    except Exception:
        return False


def alert_monitor_thread():
    beep_interval_secs = 2.0
    poll_interval_secs = 1.0
    last_beep_at = 0.0

    while True:
        try:
            alerts = _with_alert_mute_state(_compute_alerts_from_global_state())
            GLOBAL_DATA["alerts"] = alerts

            if alerts.get("activeCount", 0) > 0 and not alerts.get('muteActive', False):
                now = time.time()
                if (now - last_beep_at) >= beep_interval_secs:
                    _host_beep_once()
                    last_beep_at = now
        except Exception as e:
            print(f"Alert monitor error: {e}")

        time.sleep(poll_interval_secs)

def io_monitor_thread():
    last_io, cooldowns = {}, {}
    while True:
        current_io = get_io_snapshot()
        for dev, count in current_io.items():
            if count > last_io.get(dev, count): 
                cooldowns[dev] = 2 
            elif cooldowns.get(dev, 0) > 0: 
                cooldowns[dev] -= 1
            last_io[dev] = count
        GLOBAL_DATA["io_activity"] = {d: (v > 0) for d, v in cooldowns.items()}
        time.sleep(0.1)

def get_dynamic_pool_mapping():
    """Map drive base names to their ZFS pool names"""
    mapping = {}
    try:
        cmd = ["lsblk", "-pno", "KNAME,LABEL,FSTYPE"]
        output = subprocess.check_output(cmd, text=True)
        for line in output.splitlines():
            parts = line.split()
            if "zfs_member" in parts and len(parts) >= 2:
                pool_name = parts[1] if parts[1] != "zfs_member" else (parts[2] if len(parts) > 2 else "unknown")
                dev_name = parts[0].replace("/dev/", "")
                base_dev = "".join(filter(str.isalpha, dev_name))
                mapping[base_dev] = pool_name
    except: 
        pass
    return mapping

def get_diskstats_for_pools():
    """Read current diskstats for all drives"""
    stats = {}
    try:
        with open('/proc/diskstats', 'r') as f:
            for line in f:
                p = line.split()
                if len(p) < 10:
                    continue
                dev_name = p[2]
                stats[dev_name] = {
                    'r': int(p[5]) * 512,  # sectors read -> bytes
                    'w': int(p[9]) * 512   # sectors written -> bytes
                }
        return stats
    except:
        return {}


def _read_enabled_services_status():
    try:
        output = subprocess.check_output(
            ['midclt', 'call', 'service.query'],
            stderr=subprocess.PIPE,
            text=True,
            timeout=5
        )
        rows = json.loads(output)
        tracked = []
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue

            enabled = bool(row.get('enable', False))
            if not enabled:
                continue

            name = str(row.get('service') or row.get('id') or 'unknown')
            state = str(row.get('state') or 'UNKNOWN').upper()
            running = state == 'RUNNING'
            tracked.append({
                'name': name,
                'state': state,
                'running': running,
                'enabled': True
            })

        tracked.sort(key=lambda item: item.get('name', '').lower())
        stopped = [item['name'] for item in tracked if not item.get('running', False)]

        return {
            'tracked': tracked,
            'stopped': stopped,
            'hasStopped': len(stopped) > 0,
            'source': 'truenas-api',
            'error': None
        }
    except Exception as ex:
        return {
            'tracked': [],
            'stopped': [],
            'hasStopped': False,
            'source': 'truenas-api',
            'error': str(ex)
        }

def pool_activity_monitor_thread():
    """Monitor per-pool read/write activity with smoothing"""
    POLL_INTERVAL = 0.05   # 10Hz sampling (50ms)
    SMOOTHING_WINDOW = 100  # 10-second rolling average (100 samples at 10Hz)
    HISTORY_LIMIT = 150    # 15 seconds of history (150 samples at 10Hz)
    
    drive_to_pool = get_dynamic_pool_mapping()
    drives = list(drive_to_pool.keys())
    unique_pools = set(drive_to_pool.values())
    
    # Initialize smoothing buffers and history
    smoothing_buffer = {}
    for pool in unique_pools:
        smoothing_buffer[pool] = {
            'r': deque([0.0] * SMOOTHING_WINDOW, maxlen=SMOOTHING_WINDOW),
            'w': deque([0.0] * SMOOTHING_WINDOW, maxlen=SMOOTHING_WINDOW)
        }
        GLOBAL_DATA["pool_activity_history"][pool] = {
            'r': deque([0.0] * HISTORY_LIMIT, maxlen=HISTORY_LIMIT),
            'w': deque([0.0] * HISTORY_LIMIT, maxlen=HISTORY_LIMIT)
        }
    
    last_raw = get_diskstats_for_pools()
    
    while True:
        time.sleep(POLL_INTERVAL)
        current_raw = get_diskstats_for_pools()
        
        if not current_raw or not last_raw:
            continue
        
        # Calculate per-device deltas and accumulate by pool
        for dev, stats in current_raw.items():
            # Extract base device name (sda from sda1, nvme0n1 from nvme0n1p1)
            base_dev = "".join(filter(str.isalpha, dev))
            
            if base_dev not in drive_to_pool:
                continue
            
            pool = drive_to_pool[base_dev]
            
            if dev in last_raw:
                r_bps = (stats['r'] - last_raw[dev]['r']) / POLL_INTERVAL
                w_bps = (stats['w'] - last_raw[dev]['w']) / POLL_INTERVAL
                
                # Add to smoothing buffer for this pool
                smoothing_buffer[pool]['r'].append(r_bps)
                smoothing_buffer[pool]['w'].append(w_bps)
        
        # Calculate smoothed averages and update history
        for pool in unique_pools:
            if pool in smoothing_buffer:
                avg_r = sum(smoothing_buffer[pool]['r']) / SMOOTHING_WINDOW
                avg_w = sum(smoothing_buffer[pool]['w']) / SMOOTHING_WINDOW
                
                GLOBAL_DATA["pool_activity_history"][pool]['r'].append(round(avg_r, 2))
                GLOBAL_DATA["pool_activity_history"][pool]['w'].append(round(avg_w, 2))
        
        last_raw = current_raw

def topology_scanner_thread():
    while True:
        try:
            GLOBAL_DATA["hostname"] = socket.gethostname()
            GLOBAL_DATA["config"] = load_config()
            uuid_map = {}

            if os.path.exists('/dev/disk/by-partuuid'):
                for uid in os.listdir('/dev/disk/by-partuuid'):
                    real = os.path.realpath(os.path.join('/dev/disk/by-partuuid', uid))
                    uuid_map[uid] = re.sub(r'p?\d+$', '', os.path.basename(real))
            
            # Get ZFS topology and pool states from API or fallback
            zfs_map, pool_states = get_zfs_topology(uuid_map)
            GLOBAL_DATA["pool_states"] = pool_states  # Store pool states for frontend
            GLOBAL_DATA["api_status"] = get_api_status()  # Store API status
            GLOBAL_DATA["_last_zfs_map"] = zfs_map  # Retained for /ircu-debug diagnostic endpoint
            GLOBAL_DATA["services"] = _read_enabled_services_status()
            
            new_topology = {}
            controller_capacity = {}
            path_dir = '/dev/disk/by-path'
            if os.path.exists(path_dir):
                for entry in os.scandir(path_dir):
                    if entry.is_symlink() and "-part" not in entry.name:
                        pci_match = re.search(r'pci-([0-9a-fA-F:.]+)', entry.name)
                        if not pci_match: continue
                        pci_raw = pci_match.group(1)
                        pci_key = pci_raw.replace(':', '-').replace('.', '-')
                        
                        # Skip virtual storage controllers (only show physical HBAs/RAID controllers)
                        if is_virtual_storage_controller(pci_raw):
                            continue

                        if pci_key not in controller_capacity:
                            max_bays, has_backplane, ports, capacity_unknown = get_controller_capacity(
                                pci_raw, GLOBAL_DATA["config"]
                            )
                            controller_capacity[pci_key] = {
                                "max_bays": max_bays,
                                "has_backplane": has_backplane,
                                "ports": ports,
                                "capacity_unknown": capacity_unknown,
                                "ircu_handled": False
                            }

                        # If this controller was fully mapped via ircu on first encounter, skip remaining symlinks
                        if controller_capacity[pci_key].get("ircu_handled"):
                            continue

                        if pci_key not in new_topology and not any(
                            k.startswith(pci_key + "-e") or k == pci_key + "-da"
                            for k in new_topology
                        ):
                            # Try ircu path first ÔÇö gives authoritative per-slot data from the SCSI adapter.
                            # Returns a dict of per-enclosure chassis entries (one per backplane + one for
                            # direct-attach); each is stored as its own key in new_topology.
                            ircu_topos = get_ircu_slot_topology(pci_raw, zfs_map, GLOBAL_DATA["config"])
                            if ircu_topos:
                                for sub_key, topo in ircu_topos.items():
                                    new_topology[sub_key] = topo
                                controller_capacity[pci_key]["ircu_handled"] = True
                                continue

                            # Fall through to standard /dev/disk/by-path approach
                            rows = 1
                            bays_per_row = controller_capacity[pci_key]["max_bays"]

                            new_topology[pci_key] = {
                                "settings": {
                                    "pci_raw": pci_raw,
                                    "array_address": "",
                                    "array_id": "",
                                    "max_bays": controller_capacity[pci_key]["max_bays"],
                                    "has_backplane": controller_capacity[pci_key]["has_backplane"],
                                    "ports": controller_capacity[pci_key]["ports"],
                                    "capacity_unknown": controller_capacity[pci_key]["capacity_unknown"],
                                    "rows": rows,
                                    "bays_per_row": bays_per_row
                                },
                                "disks": []
                            }

                        match = re.search(r'(phy|ata|sas|port|slot|exp)(\d+)', entry.name)
                        bay_num = int(match.group(2)) if match else 0
                        
                        while bay_num >= len(new_topology[pci_key]["disks"]):
                            new_topology[pci_key]["disks"].append({"status": "EMPTY"})
                            
                        dev_name = os.path.basename(os.path.realpath(entry.path))
                        try:
                            out = subprocess.check_output(['lsblk', '-dbno', 'SERIAL,SIZE', entry.path], text=True).split()
                            sn, size = (out[0], int(out[1])) if len(out) >= 2 else ("", 0)
                        except: sn, size = "", 0
                        
                        z = lookup_zfs_disk_entry(zfs_map, dev_name)
                        new_topology[pci_key]["disks"][bay_num] = {
                            "status": "PRESENT", "sn": sn, "size_bytes": size, "dev_name": dev_name,
                            "pool_name": z["pool"], "pool_idx": z["idx"], "state": z["state"],
                            "temperature_c": z.get("temperature_c"),
                            "read_errors": z.get("read_errors", 0),
                            "write_errors": z.get("write_errors", 0),
                            "cksum_errors": z.get("cksum_errors", 0)
                        }

            for pci_key, data in new_topology.items():
                max_bays = data["settings"].get("max_bays", 0)
                if max_bays and len(data["disks"]) < max_bays:
                    while len(data["disks"]) < max_bays:
                        data["disks"].append({"status": "EMPTY"})

            GLOBAL_DATA["topology"] = new_topology
        except Exception as e: print(f"Scanner Error: {e}")
        time.sleep(5)

class FastHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        # Handle POST requests for saving configuration
        global CONFIG_MTIME, CONFIG_CACHE, ALERT_MUTE_UNTIL_TS, REPO_SYNC_ENABLED_OVERRIDE
        path = self.path.split('?')[0]

        if path == '/alerts-mute-5m':
            try:
                current_alerts = _compute_alerts_from_global_state()
                if current_alerts.get('activeCount', 0) <= 0:
                    payload = _with_alert_mute_state(current_alerts)
                    self.send_response(409)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        'status': 'error',
                        'message': 'No active alerts to mute.',
                        'alerts': payload
                    }).encode())
                    return

                ALERT_MUTE_UNTIL_TS = time.time() + ALERT_MUTE_SECONDS
                payload = _with_alert_mute_state(current_alerts)
                GLOBAL_DATA['alerts'] = payload

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'success',
                    'muteSeconds': ALERT_MUTE_SECONDS,
                    'alerts': payload
                }).encode())
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(ex)}).encode())
            return

        if path == '/repo-sync-enabled':
            content_length = int(self.headers.get('Content-Length', 0))
            try:
                body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
                payload = json.loads(body)
                enabled = bool(payload.get('enabled', False))

                # Runtime-only override to avoid writing config.json, which triggers dev live-reload.
                REPO_SYNC_ENABLED_OVERRIDE = enabled

                config = GLOBAL_DATA.get('config') if isinstance(GLOBAL_DATA.get('config'), dict) else (load_config() or {})
                if 'ui' not in config or not isinstance(config.get('ui'), dict):
                    config['ui'] = {}
                if 'menu' not in config['ui'] or not isinstance(config['ui'].get('menu'), dict):
                    config['ui']['menu'] = {}
                if 'repo_sync' not in config['ui']['menu'] or not isinstance(config['ui']['menu'].get('repo_sync'), dict):
                    config['ui']['menu']['repo_sync'] = {}
                config['ui']['menu']['repo_sync']['enabled'] = enabled
                GLOBAL_DATA['config'] = config

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'enabled': enabled, 'persisted': False}).encode())
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'error', 'message': str(ex)}).encode())
            return

        if path == '/repo-sync-repair':
            try:
                config = load_config()
                if not _repo_sync_enabled(config):
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": "Repository sync is disabled in Dashboard > Reset > Repository Sync"
                    }).encode())
                    return

                restored, failed = _restore_missing_tracked_files(GITHUB_BRANCH)
                payload = _repo_sync_status_payload(config)
                payload.update({
                    "status": "success" if not failed else "partial",
                    "restored": restored,
                    "failed": failed,
                    "startup_initiated": False
                })

                restored_count = len(restored)
                should_restart = restored_count > 0 and not failed
                startup_script_exists = os.path.exists(_startup_script_path())
                if should_restart:
                    payload["startup_initiated"] = startup_script_exists
                    if not startup_script_exists:
                        payload["failed"]["start_up.sh"] = "start_up.sh not found"
                        payload["status"] = "partial"

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())

                # Trigger restart after sending response so the request is not cut off.
                if should_restart and startup_script_exists:
                    try:
                        launched, startup_err = _launch_startup_script()
                        if launched:
                            print(f"Startup script initiated after restoring {restored_count} file(s)")
                        else:
                            print(f"Warning: {startup_err} for post-restore restart")
                    except Exception as startup_err:
                        print(f"Error triggering startup after restore: {startup_err}")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode())
            return

        if path == '/repo-sync-update':
            try:
                config = load_config()
                if not _repo_sync_enabled(config):
                    self.send_response(403)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": "Repository sync is disabled in Dashboard > Reset > Repository Sync"
                    }).encode())
                    return

                status_payload = _repo_sync_status_payload(config)
                if not status_payload.get('updateAvailable'):
                    self.send_response(409)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    status_payload.update({
                        'status': 'noop',
                        'message': 'No newer repository version is available.'
                    })
                    self.wfile.write(json.dumps(status_payload).encode())
                    return

                target_ref = status_payload.get('remoteVersion') or GITHUB_BRANCH
                installed, failed = _download_and_install_tracked_files(target_ref)
                post_payload = _repo_sync_status_payload(config)
                post_payload.update({
                    'status': 'success' if not failed else 'partial',
                    'installed': installed,
                    'failed': failed,
                    'targetRef': target_ref,
                    'startup_initiated': False
                })

                should_restart = not failed and bool(installed)
                startup_script_exists = os.path.exists(_startup_script_path())
                if should_restart:
                    post_payload['startup_initiated'] = startup_script_exists
                    if not startup_script_exists:
                        post_payload['status'] = 'partial'
                        post_payload['failed']['start_up.sh'] = 'start_up.sh not found'

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps(post_payload).encode())

                # Trigger restart after response to avoid killing the current request mid-flight.
                if should_restart and startup_script_exists:
                    try:
                        launched, startup_err = _launch_startup_script()
                        if launched:
                            print(f"Startup script initiated after update install from {target_ref}")
                        else:
                            print(f"Warning: {startup_err} for post-update restart")
                    except Exception as startup_err:
                        print(f"Error triggering startup after update install: {startup_err}")
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(ex)}).encode())
            return

        if path == '/reset-config':
            try:
                # Ensure the config file directory exists
                os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)

                # Rewrite config.json from hardcoded defaults
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(DEFAULT_CONFIG_JSON, f, indent=4)

                # Invalidate cache and reload config
                CONFIG_MTIME = 0
                CONFIG_CACHE = None
                GLOBAL_DATA["config"] = load_config()

                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                response = json.dumps({"status": "success", "message": "Configuration reset to defaults"})
                self.wfile.write(response.encode())
            except IOError as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"File error: {str(e)}"}).encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode())
            return
        
        if path == '/save-config':
            content_length = int(self.headers.get('Content-Length', 0))
            try:
                body = self.rfile.read(content_length).decode('utf-8')
                print(f"[SAVE-CONFIG] Received body length: {len(body)}")
                print(f"[SAVE-CONFIG] Received body (first 500 chars): {body[:500]}")
                
                updated_config = json.loads(body)
                print(f"[SAVE-CONFIG] Parsed config successfully")
                if 'chart' in updated_config:
                    print(f"[SAVE-CONFIG] Chart config in received data: {updated_config['chart']}")
                
                # Ensure the config file directory exists
                os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
                
                # Write the config back to config.json with proper formatting
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(updated_config, f, indent=4)
                
                print(f"[SAVE-CONFIG] Written to file: {CONFIG_FILE}")
                
                # Invalidate the cache so it reloads on next request
                CONFIG_MTIME = 0
                CONFIG_CACHE = None
                
                # Force a reload of config and update GLOBAL_DATA
                GLOBAL_DATA["config"] = load_config()
                print(f"[SAVE-CONFIG] Config reloaded after save")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-cache')
                self.end_headers()
                response = json.dumps({"status": "success", "message": "Configuration saved successfully"})
                self.wfile.write(response.encode())
                print(f"[SAVE-CONFIG] Sent 200 success response")
                
            except json.JSONDecodeError as e:
                print(f"[SAVE-CONFIG] JSON parse error: {e}")
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"Invalid JSON: {str(e)}"}).encode())
                
            except IOError as e:
                print(f"[SAVE-CONFIG] File I/O error: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": f"File error: {str(e)}"}).encode())
                
            except Exception as e:
                print(f"[SAVE-CONFIG] Config save error: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode())
            return
        
        self.send_response(404)
        self.end_headers()

    def do_GET(self):
        # Extract path without query string
        path = self.path.split('?')[0]
        
        if path == '/data':
            resp = {
                "hostname": GLOBAL_DATA["hostname"], 
                "topology": {}, 
                "config": GLOBAL_DATA.get("config", {}),
                "pool_states": GLOBAL_DATA.get("pool_states", {}),
                "services": GLOBAL_DATA.get("services", {
                    "tracked": [],
                    "stopped": [],
                    "hasStopped": False,
                    "source": "unknown",
                    "error": None
                }),
                "api_status": GLOBAL_DATA.get("api_status", {"available": True, "error_message": ""}),
                "alerts": GLOBAL_DATA.get("alerts", {
                    "poolDegraded": False,
                    "diskFaultOrErrors": False,
                    "highTemperature": False,
                    "servicesStopped": False,
                    "activeCount": 0,
                    "activeNames": [],
                    "muteActive": False,
                    "muteRemainingSec": 0
                })
            }
            for pci, data in GLOBAL_DATA["topology"].items():
                resp["topology"][pci] = {
                    "settings": data["settings"],
                    "disks": [{**d, "active": GLOBAL_DATA["io_activity"].get(d.get("dev_name"), False)} for d in data["disks"]]
                }
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode())
            return
        elif path == '/style-config':
            # Serve the style configuration (fonts, colors, etc.)
            style_config = load_style_config()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            self.end_headers()
            self.wfile.write(json.dumps(style_config).encode())
            return
        elif path == '/repo-sync-status':
            try:
                config = load_config()
                payload = _repo_sync_status_payload(config)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Cache-Control', 'no-store')
                self.end_headers()
                self.wfile.write(json.dumps(payload).encode())
            except Exception as ex:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(ex)}).encode())
            return
        elif path == '/pool-activity':
            # Serve pool activity history for Chart.js visualization
            out = {
                'hostname': GLOBAL_DATA["hostname"],
                'stats': {
                    pool: {
                        'r': list(GLOBAL_DATA["pool_activity_history"][pool]['r']),
                        'w': list(GLOBAL_DATA["pool_activity_history"][pool]['w'])
                    }
                    for pool in GLOBAL_DATA["pool_activity_history"]
                }
            }
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps(out).encode())
            return
        elif path == '/livereload-status':
            # Return modification times for watched files
            files_to_watch = [
                'app.js', 'Bay.js', 'Chassis.js', 'DiskInfo.js', 'LEDManager.js',
                'style.css', 'Base.css', 'Bay.css', 'Chassis.css', 'LEDs.css', 'index.html', 'config.json'
            ]
            file_times = {}
            for filename in files_to_watch:
                filepath = os.path.join(BASE_DIR, filename)
                if os.path.exists(filepath):
                    file_times[filename] = os.path.getmtime(filepath)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            self.wfile.write(json.dumps(file_times).encode())
            return
        elif path == '/trigger-restart':
            # Trigger server restart for configuration changes (e.g., port change)
            # Return the new port so the client can redirect
            new_port = get_port()
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'restart initiated', 'port': new_port}).encode())
            # Call start_up.sh to restart the service
            try:
                launched, startup_err = _launch_startup_script()
                if launched:
                    print("Restart initiated via start_up.sh")
                else:
                    print(f"Warning: {startup_err}")
            except Exception as e:
                print(f"Error triggering restart: {e}")
            return
        elif path == '/ircu-debug':
            # Diagnostic endpoint: runs ircu detection in-process and returns
            # a full JSON report so failures can be diagnosed without log access.
            report = {"steps": {}}
            try:
                # Step 1: PCI addresses visible in by-path
                path_dir = '/dev/disk/by-path'
                pci_addrs = set()
                if os.path.exists(path_dir):
                    for entry in os.scandir(path_dir):
                        if entry.is_symlink() and '-part' not in entry.name:
                            m = re.search(r'pci-([0-9a-fA-F:.]+)', entry.name)
                            if m:
                                pci_addrs.add(m.group(1))
                report["steps"]["1_pci_addresses"] = list(pci_addrs)

                # Step 2: sas2ircu/sas3ircu availability and LIST output
                ircu_available = {}
                for tool in ('sas3ircu', 'sas2ircu'):
                    ircu_available[tool] = bool(shutil.which(tool))
                    if ircu_available[tool]:
                        try:
                            list_out = subprocess.check_output(
                                [tool, 'LIST'], text=True, timeout=5
                            )
                            ircu_available[tool + '_list_output'] = list_out
                        except Exception as ex:
                            ircu_available[tool + '_list_error'] = str(ex)
                report["steps"]["2_ircu_tools"] = ircu_available

                # Step 3: adapter lookup result per PCI address
                adapter_results = {}
                for pci_raw in pci_addrs:
                    for tool in ('sas3ircu', 'sas2ircu'):
                        if not shutil.which(tool):
                            continue
                        aid = _find_ircu_adapter(tool, pci_raw)
                        adapter_results[pci_raw] = {
                            'tool': tool,
                            'adapter_id': aid,
                            'normalized_pci': normalize_pci_address(pci_raw)
                        }
                        if aid is not None:
                            break
                report["steps"]["3_adapter_lookup"] = adapter_results

                # Step 4: _parse_ircu_display results
                parse_results = {}
                for pci_raw, info in adapter_results.items():
                    if info.get('adapter_id') is None:
                        parse_results[pci_raw] = 'adapter_not_found'
                        continue
                    encs, phy_count = _parse_ircu_display(info['tool'], info['adapter_id'])
                    parse_results[pci_raw] = {
                        'phy_count': phy_count,
                        'enclosures': {
                            eid: {
                                'slots': enc['slots'],
                                'is_backplane': enc['is_backplane'],
                                'drive_count': len(enc['drives']),
                                'drive_slots': list(enc['drives'].keys())
                            }
                            for eid, enc in encs.items()
                        }
                    }
                report["steps"]["4_parse_display"] = parse_results

                # Step 5: serialÔåÆdev map from lsblk
                report["steps"]["5_serial_to_dev"] = build_serial_to_dev_map()

                # Step 6: full get_ircu_slot_topology result (settings + disk count only)
                topo_results = {}
                cfg = GLOBAL_DATA.get('config', {})
                zfs_map = GLOBAL_DATA.get('_last_zfs_map', {})
                for pci_raw in pci_addrs:
                    result = get_ircu_slot_topology(pci_raw, zfs_map, cfg)
                    topo_results[pci_raw] = {
                        sub_key: {
                            'settings': topo['settings'],
                            'disk_count': len(topo['disks']),
                            'present_count': sum(1 for d in topo['disks'] if d.get('status') == 'PRESENT')
                        }
                        for sub_key, topo in result.items()
                    } if result else 'empty_result'
                report["steps"]["6_slot_topology"] = topo_results

            except Exception as ex:
                report['error'] = str(ex)

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-cache, no-store')
            self.end_headers()
            self.wfile.write(json.dumps(report, indent=2).encode())
            return
        return super().do_GET()

