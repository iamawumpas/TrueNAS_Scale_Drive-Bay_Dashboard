import http.server, socketserver, json, time, subprocess, socket, os, re, threading
from zfs_logic import get_zfs_topology

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
PORT = 8010

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
            path_dir = '/dev/disk/by-path'
            if os.path.exists(path_dir):
                for entry in os.scandir(path_dir):
                    if entry.is_symlink() and "-part" not in entry.name:
                        pci_match = re.search(r'pci-([0-9a-fA-F:.]+)', entry.name)
                        if not pci_match: continue
                        pci_raw = pci_match.group(1)
                        pci_key = pci_raw.replace(':', '-').replace('.', '-')
                        
                        if pci_key not in new_topology:
                            new_topology[pci_key] = {"settings": {"pci_raw": pci_raw}, "disks": []}
                        
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