import http.server, socketserver, json, time, subprocess, socket, os, re, threading
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

def get_controller_capacity(pci_address):
    """
    Determine the total number of drive bays based on PCI device configuration.
    
    Condition 1: Backplane Exists
    - If backplane is detected, calculate: 4 ports × 40 slots per backplane = 160 bays
    - Each port connects to one backplane with 40 slots
    
    Condition 2: No Backplane (Direct Attached Disks)
    - If no backplane: 4 ports × 4 disks per port = 16 bays
    - Each port can directly connect to 4 physical disks
    """
    slot_count = find_enclosure_slot_count(pci_address)
    if slot_count > 0:
        # Backplane exists - calculate total capacity
        # 4 ports × 40 slots per backplane = 160 total bays
        ports = count_controller_ports(pci_address)
        if ports > 0:
            total_bays = ports * slot_count
            return total_bays, True, ports
        return slot_count, True, 0

    ports = count_controller_ports(pci_address)
    if ports > 0:
        # No backplane - direct attached disks
        # Each port can connect to DEFAULT_TARGETS_PER_PORT disks
        total_bays = ports * DEFAULT_TARGETS_PER_PORT
        return total_bays, False, ports

    return 0, False, 0

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
    "network": {"port": 8010}
}

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
                            max_bays, has_backplane, ports = get_controller_capacity(pci_raw)
                            controller_capacity[pci_key] = {
                                "max_bays": max_bays,
                                "has_backplane": has_backplane,
                                "ports": ports
                            }
                        
                        if pci_key not in new_topology:
                            new_topology[pci_key] = {
                                "settings": {
                                    "pci_raw": pci_raw,
                                    "max_bays": controller_capacity[pci_key]["max_bays"],
                                    "has_backplane": controller_capacity[pci_key]["has_backplane"],
                                    "ports": controller_capacity[pci_key]["ports"]
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
            resp = {"hostname": GLOBAL_DATA["hostname"], "topology": {}}
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