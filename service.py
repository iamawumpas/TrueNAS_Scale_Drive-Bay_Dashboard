import http.server, socketserver, json, time, subprocess, socket, os, re, threading, shutil
from zfs_logic import get_zfs_topology

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
PORT = 8010
DEFAULT_TARGETS_PER_PORT = 4

def normalize_pci_address(pci_address):
    normalized = pci_address.replace('-', ':').replace('.', ':')
    parts = normalized.split(':')
    if len(parts) == 4:
        return f"{parts[0]}:{parts[1]}:{parts[2]}.{parts[3]}"
    return pci_address

def find_enclosure_slot_count(pci_address):
    enclosure_root = '/sys/class/enclosure'
    if not os.path.exists(enclosure_root):
        return 0

    pci_path = normalize_pci_address(pci_address)

    for enclosure in os.scandir(enclosure_root):
        if not enclosure.is_dir():
            continue
        device_link = os.path.join(enclosure.path, 'device')
        if not os.path.exists(device_link):
            continue
        try:
            real_path = os.path.realpath(device_link)
            if pci_path not in real_path:
                continue

            slot_count = 0
            for entry in os.scandir(enclosure.path):
                if entry.is_dir():
                    if (os.path.exists(os.path.join(entry.path, 'device')) or
                        os.path.exists(os.path.join(entry.path, 'status'))):
                        slot_count += 1
            if slot_count > 0:
                return slot_count
        except Exception:
            continue

    return 0

def count_controller_ports(pci_address):
    pci_path = normalize_pci_address(pci_address)
    ports = 0

    sas_host_root = '/sys/class/sas_host'
    if os.path.exists(sas_host_root):
        for host in os.scandir(sas_host_root):
            device_link = os.path.join(host.path, 'device')
            if os.path.exists(device_link):
                if pci_path in os.path.realpath(device_link):
                    ports += 1
        if ports > 0:
            return ports

    scsi_host_root = '/sys/class/scsi_host'
    if os.path.exists(scsi_host_root):
        for host in os.scandir(scsi_host_root):
            device_link = os.path.join(host.path, 'device')
            if os.path.exists(device_link):
                if pci_path in os.path.realpath(device_link):
                    ports += 1

    return ports

def count_controller_phys(pci_address):
    """
    Count SAS phys (lanes) for a controller by scanning /sys/class/sas_phy
    entries that resolve to the given PCI address.
    """
    pci_path = normalize_pci_address(pci_address)
    sas_phy_root = '/sys/class/sas_phy'
    phys = 0

    if not os.path.exists(sas_phy_root):
        return 0

    for phy in os.scandir(sas_phy_root):
        device_link = os.path.join(phy.path, 'device')
        if os.path.exists(device_link):
            if pci_path in os.path.realpath(device_link):
                phys += 1

    return phys

def get_config_controller_override(pci_address, config):
    if not isinstance(config, dict):
        return None

    hardware = config.get("hardware", {})
    overrides = hardware.get("controller_overrides", [])

    if isinstance(overrides, dict):
        override_list = []
        for key, value in overrides.items():
            if isinstance(value, dict):
                entry = {"pci_address": key}
                entry.update(value)
                override_list.append(entry)
    elif isinstance(overrides, list):
        override_list = overrides
    else:
        return None

    target = normalize_pci_address(pci_address)
    for entry in override_list:
        if not isinstance(entry, dict):
            continue
        pci = entry.get("pci_address") or entry.get("pci")
        if not pci:
            continue
        if normalize_pci_address(pci) != target:
            continue

        ports = entry.get("ports")
        lanes = entry.get("lanes_per_port") or entry.get("lanes")
        max_bays = entry.get("max_bays") or entry.get("bays") or entry.get("bay_count")

        override = {}
        if isinstance(ports, (int, float)):
            ports = int(ports)
            if ports > 0:
                override["ports"] = ports
        if isinstance(lanes, (int, float)):
            lanes = int(lanes)
            if lanes > 0:
                override["lanes"] = lanes
        if isinstance(max_bays, (int, float)):
            max_bays = int(max_bays)
            if max_bays > 0:
                override["max_bays"] = max_bays

        if override:
            return override

    return None

def _find_ircu_adapter(ircu_tool, pci_address):
    try:
        output = subprocess.check_output([ircu_tool, "LIST"], text=True, timeout=2)
    except Exception:
        return None

    target = normalize_pci_address(pci_address)
    current_adapter = None

    for line in output.splitlines():
        adapter_match = re.search(r"Adapter\s*#?\s*(\d+)", line, re.IGNORECASE)
        if adapter_match:
            current_adapter = adapter_match.group(1)

        pci_match = re.search(r"PCI\s+Address\s*[:=]\s*([0-9a-fA-F:.]+)", line, re.IGNORECASE)
        if pci_match and current_adapter is not None:
            if normalize_pci_address(pci_match.group(1)) == target:
                return current_adapter

        alt_match = re.search(r"^\s*(\d+)\s+\S+\s+([0-9a-fA-F:.]+)", line)
        if alt_match:
            if normalize_pci_address(alt_match.group(2)) == target:
                return alt_match.group(1)

    return None

def _count_ircu_phys(ircu_tool, adapter_id):
    try:
        output = subprocess.check_output([ircu_tool, str(adapter_id), "DISPLAY"], text=True, timeout=2)
    except Exception:
        return 0

    count = 0
    for line in output.splitlines():
        if re.search(r"^\s*Phy\s*#?\s*\d+", line, re.IGNORECASE):
            count += 1
    return count

def _find_max_phy_in_json(data):
    max_phy = 0
    if isinstance(data, dict):
        for key, value in data.items():
            if isinstance(value, (dict, list)):
                max_phy = max(max_phy, _find_max_phy_in_json(value))
            elif isinstance(value, (int, float)) and "phy" in str(key).lower():
                max_phy = max(max_phy, int(value))
    elif isinstance(data, list):
        for item in data:
            max_phy = max(max_phy, _find_max_phy_in_json(item))
    return max_phy

def _storcli_phy_count(pci_address):
    try:
        output = subprocess.check_output(["storcli", "/cALL", "show", "J"], text=True, timeout=3)
    except Exception:
        return 0

    try:
        payload = json.loads(output)
    except Exception:
        return 0

    target = normalize_pci_address(pci_address)
    controllers = payload.get("Controllers", []) if isinstance(payload, dict) else []
    for controller in controllers:
        response_data = controller.get("Response Data", {}) if isinstance(controller, dict) else {}
        sys_overview = response_data.get("System Overview", []) if isinstance(response_data, dict) else []
        if isinstance(sys_overview, list):
            for item in sys_overview:
                if not isinstance(item, dict):
                    continue
                pci = item.get("PCI Address") or item.get("PCI Address ")
                if pci and normalize_pci_address(str(pci)) == target:
                    return _find_max_phy_in_json(response_data)

    return _find_max_phy_in_json(payload)

def get_vendor_cli_phys(pci_address):
    """
    Optional vendor CLI detection for max phys/lanes.
    Supports sas3ircu/sas2ircu (LSI/Broadcom) and storcli if present.
    Returns 0 if no data is available.
    """
    for tool in ("sas3ircu", "sas2ircu"):
        if shutil.which(tool):
            adapter_id = _find_ircu_adapter(tool, pci_address)
            if adapter_id is not None:
                phys = _count_ircu_phys(tool, adapter_id)
                if phys > 0:
                    return phys

    if shutil.which("storcli"):
        phys = _storcli_phy_count(pci_address)
        if phys > 0:
            return phys

    return 0

def get_controller_capacity(pci_address, config=None):
    """
    Determine the total number of drive bays based on PCI device configuration.
    
    Condition 1: Backplane Exists
    - If backplane is detected, calculate: 4 ports × 40 slots per backplane = 160 bays
    - Each port connects to one backplane with 40 slots
    
    Condition 2: No Backplane (Direct Attached Disks)
    - If no backplane: 4 ports × 4 disks per port = 16 bays
    - Each port can directly connect to 4 physical disks
    """
    override = get_config_controller_override(pci_address, config)
    override_ports = override.get("ports", 0) if override else 0
    override_lanes = override.get("lanes", 0) if override else 0
    override_bays = override.get("max_bays", 0) if override else 0

    if override_bays > 0:
        return override_bays, False, override_ports, False

    slot_count = find_enclosure_slot_count(pci_address)
    if slot_count > 0:
        # Backplane exists - calculate total capacity
        # 4 ports × 40 slots per backplane = 160 total bays
        ports = count_controller_ports(pci_address)
        if ports <= 0 and override_ports > 0:
            ports = override_ports
        if ports > 0:
            total_bays = ports * slot_count
            return total_bays, True, ports, False
        return slot_count, True, 0, False

    ports = count_controller_ports(pci_address)

    phys = count_controller_phys(pci_address)
    if phys > 0:
        # No backplane - direct attached disks
        # Use SAS phy count as the maximum number of direct connections
        return phys, False, ports, False

    vendor_phys = get_vendor_cli_phys(pci_address)
    if vendor_phys > 0:
        return vendor_phys, False, ports, False

    if override_ports > 0 and override_lanes > 0:
        # User override: ports × lanes per port
        total_bays = override_ports * override_lanes
        return total_bays, False, override_ports, False

    return 0, False, ports, True

def is_virtual_storage_controller(pci_address):
    """
    Detect if a PCI device is a virtual storage controller vs physical hardware.
    Returns True if virtual (hypervisor), False if physical (bare metal or passthrough).
    """
    # Normalize PCI address format (handle both formats: 0000:00:07.1 or 0000-00-07-1)
    normalized = pci_address.replace('-', ':').replace('.', ':')
    parts = normalized.split(':')
    if len(parts) == 4:
        # Convert back to kernel format with dots
        pci_path = f"{parts[0]}:{parts[1]}:{parts[2]}.{parts[3]}"
    else:
        pci_path = pci_address
    
    sysfs_path = f"/sys/bus/pci/devices/{pci_path}"
    
    if not os.path.exists(sysfs_path):
        return True  # If can't verify, assume virtual to be safe
    
    try:
        # Read vendor ID
        vendor_file = os.path.join(sysfs_path, 'vendor')
        device_file = os.path.join(sysfs_path, 'device')
        class_file = os.path.join(sysfs_path, 'class')
        
        if not os.path.exists(vendor_file):
            return True
        
        with open(vendor_file, 'r') as f:
            vendor_id = f.read().strip()
        
        # Known virtual/emulated storage controller vendors
        virtual_vendors = {
            '0x1af4': 'Red Hat (Virtio)',
            '0x15ad': 'VMware',
            '0x80ee': 'VirtualBox',
            '0x1414': 'Microsoft Hyper-V',
            '0x1b36': 'QEMU',
        }
        
        if vendor_id in virtual_vendors:
            return True
        
        # Check for QEMU/emulated Intel PIIX devices (common in VMs)
        if vendor_id == '0x8086':  # Intel
            with open(device_file, 'r') as f:
                device_id = f.read().strip()
            
            # PIIX3/PIIX4 IDE controllers (used in QEMU/KVM/Proxmox)
            piix_devices = ['0x7010', '0x7111', '0x7112', '0x7113']
            if device_id in piix_devices:
                return True
        
        # Check device class - storage controllers should be 0x01xxxx
        if os.path.exists(class_file):
            with open(class_file, 'r') as f:
                device_class = f.read().strip()
            
            # If not a storage controller at all, exclude it
            if not device_class.startswith('0x01'):
                return True
        
        # If we get here, it's likely a real physical controller
        # (LSI/Broadcom, Adaptec, Marvell, etc.)
        return False
        
    except Exception as e:
        # On error, assume virtual to avoid showing unknown devices
        return True

GLOBAL_DATA = {
    "topology": {},
    "io_activity": {},
    "hostname": socket.gethostname(),
    "config": {}
}

# config.json remarks as requested
DEFAULT_CONFIG = {
    "__REMARK_NETWORK": "Port settings for the web dashboard.",
    "network": {"port": 8010},
    "__REMARK_HARDWARE": "Optional overrides for controller ports and lanes per port.",
    "hardware": {
        "controller_overrides": [
            {
                "pci_address": "0000:00:10.0",
                "ports": 4,
                "lanes_per_port": 4
            }
        ]
    },
    "__REMARK_UI": "Dashboard UI configuration. All values are applied live without restart.\nUse style arrays to combine: [\"bold\", \"italic\", \"allcaps\"]",
    "ui": {
        "__REMARK_SERVER_NAME": "Server Name display (top-left).",
        "server_name": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "2.8rem",
            "style": ["bold", "allcaps"]
        },
        "__REMARK_PCI_ADDRESS": "PCI address line under server name.",
        "pci_address": {
            "color": "#666666",
            "font": "Courier New, monospace",
            "size": "1.1rem",
            "style": ["bold"]
        },
        "__REMARK_LEGEND": "Legend label box in the header.",
        "legend": {
            "title_color": "rgba(255, 255, 255, 0.9)",
            "title_size": "1.25rem",
            "title_weight": "800",
            "item_color": "#cccccc",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "0.75rem",
            "style": ["bold", "allcaps"],
            "flare": {
                "angle": "30deg",
                "offset_x": "-50%",
                "offset_y": "-50%"
            }
        },
        "__REMARK_BAY_ID": "Bay label (e.g., BAY 1).",
        "bay_id": {
            "color": "#ffaa00",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "0.8vw",
            "style": ["bold", "allcaps"]
        },
        "__REMARK_DISK_SERIAL": "Disk serial suffix text.",
        "disk_serial": {
            "color": "#ffff00",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_SIZE": "Disk capacity text.",
        "disk_size": {
            "color": "#ff00ff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_POOL": "Pool name text.",
        "disk_pool": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DISK_INDEX": "Pool index text (e.g., #2).",
        "disk_index": {
            "color": "#00ffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_CHASSIS": "Chassis enclosure body styling.",
        "chassis": {
            "background_base": "#1a1a1a",
            "border": "#333333",
            "shadow": "rgba(0,0,0,0.8)",
            "header_divider": "rgba(255,255,255,0.1)"
        },
        "__REMARK_BAY": "Drive bay card styling.",
        "bay": {
            "background_base": "#121212",
            "border": "#333333",
            "top_border": "#444444"
        },
        "__REMARK_LEDS": "LED and legend dot colors.",
        "led_colors": {
            "allocated_healthy": "#00ff00",
            "allocated_offline": "#555555",
            "error": "#ffaa00",
            "faulted": "#ff0000",
            "resilvering": "#ffffff",
            "unallocated": "#a000ff",
            "unalloc_error": "#ffaa00",
            "unalloc_fault": "#ff0000",
            "activity": "#008cff"
        }
    }
}

CONFIG_MTIME = 0
CONFIG_CACHE = DEFAULT_CONFIG.copy()

def _deep_merge_dict(base, override):
    result = dict(base) if isinstance(base, dict) else {}
    if not isinstance(override, dict):
        return result
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge_dict(result[key], value)
        else:
            result[key] = value
    return result

def load_config():
    global CONFIG_MTIME, CONFIG_CACHE

    try:
        if not os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'w') as f:
                json.dump(DEFAULT_CONFIG, f, indent=4)

        mtime = os.path.getmtime(CONFIG_FILE)
        if mtime == CONFIG_MTIME and CONFIG_CACHE:
            return CONFIG_CACHE

        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
        merged = _deep_merge_dict(DEFAULT_CONFIG, data)
        CONFIG_CACHE = merged
        CONFIG_MTIME = mtime
        return merged
    except Exception as e:
        print(f"config file error :: reverting to default settings ({e})")
        CONFIG_CACHE = DEFAULT_CONFIG
        return DEFAULT_CONFIG

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
            
            zfs_map = get_zfs_topology(uuid_map)
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
                                "capacity_unknown": capacity_unknown
                            }
                        
                        if pci_key not in new_topology:
                            new_topology[pci_key] = {
                                "settings": {
                                    "pci_raw": pci_raw,
                                    "max_bays": controller_capacity[pci_key]["max_bays"],
                                    "has_backplane": controller_capacity[pci_key]["has_backplane"],
                                    "ports": controller_capacity[pci_key]["ports"],
                                    "capacity_unknown": controller_capacity[pci_key]["capacity_unknown"]
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
                        
                        z = zfs_map.get(dev_name, {"pool": "", "idx": "", "state": "UNALLOCATED"})
                        new_topology[pci_key]["disks"][bay_num] = {
                            "status": "PRESENT", "sn": sn, "size_bytes": size, "dev_name": dev_name,
                            "pool_name": z["pool"], "pool_idx": z["idx"], "state": z["state"]
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
    def do_GET(self):
        if self.path == '/data':
            resp = {"hostname": GLOBAL_DATA["hostname"], "topology": {}, "config": GLOBAL_DATA.get("config", {})}
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
        return super().do_GET()

if __name__ == "__main__":
    threading.Thread(target=io_monitor_thread, daemon=True).start()
    threading.Thread(target=topology_scanner_thread, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), FastHandler) as httpd:
        httpd.serve_forever()