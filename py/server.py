import http.server, socketserver, json, time, subprocess, socket, os, re, threading, shutil
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
    "pool_activity_history": {}
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
                            "pool_name": z["pool"], "pool_idx": z["idx"], "state": z["state"], "temperature_c": z.get("temperature_c")
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
        global CONFIG_MTIME, CONFIG_CACHE
        path = self.path.split('?')[0]

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
                "api_status": GLOBAL_DATA.get("api_status", {"available": True, "error_message": ""})
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
                startup_script = os.path.join(BASE_DIR, 'start_up.sh')
                if os.path.exists(startup_script):
                    subprocess.Popen(['bash', startup_script])
                    print("Restart initiated via start_up.sh")
                else:
                    print("Warning: start_up.sh not found")
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

