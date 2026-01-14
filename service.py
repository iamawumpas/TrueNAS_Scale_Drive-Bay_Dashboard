import http.server, socketserver, json, time, subprocess, socket, os, re, threading

PORT = 8010
DISK_CACHE = {"topology": {}, "io_activity": {}, "last_update": 0, "hostname": socket.gethostname()}
EXPECTED_LAYOUT = {"0000:00:10.0": {"name": "Main HBA Storage", "bays": 16}}

def get_io_snapshot():
    activity = {}
    try:
        with open('/proc/diskstats', 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) < 13: continue
                activity[parts[2]] = int(parts[3]) + int(parts[7])
    except: pass
    return activity

def background_monitor():
    global DISK_CACHE
    last_io = {}
    cooldowns = {} 
    while True:
        current_io = get_io_snapshot()
        for dev, count in current_io.items():
            prev_count = last_io.get(dev, count)
            if count > prev_count: cooldowns[dev] = 2
            elif cooldowns.get(dev, 0) > 0: cooldowns[dev] -= 1
            last_io[dev] = count
        DISK_CACHE["io_activity"] = {dev: (val > 0) for dev, val in cooldowns.items()}
        time.sleep(0.1)

def update_heavy_stats():
    global DISK_CACHE
    path_dir = '/dev/disk/by-path'
    uuid_to_dev = {}
    if os.path.exists('/dev/disk/by-partuuid'):
        for entry in os.scandir('/dev/disk/by-partuuid'):
            if entry.is_symlink():
                uuid_to_dev[entry.name] = os.path.basename(os.path.realpath(entry.path)).rstrip('0123456789')

    zfs_active = {}
    try:
        z_proc = subprocess.check_output(['zpool', 'status'], text=True)
        for line in z_proc.split('\n'):
            parts = line.split()
            if len(parts) >= 2 and parts[1] in ['ONLINE', 'DEGRADED', 'FAULTED']:
                zfs_active[uuid_to_dev.get(parts[0], parts[0])] = parts[1]
    except: pass

    new_topology = {}
    for pci, config in EXPECTED_LAYOUT.items():
        new_topology[pci] = [{"bay": f"BAY {i}", "status": "EMPTY", "sn": "---", "size": "---", "led": "off"} for i in range(1, config['bays'] + 1)]

    if os.path.exists(path_dir):
        for entry in os.scandir(path_dir):
            if entry.is_symlink() and "-part" not in entry.name:
                parts = entry.name.split('-')
                pci_addr = parts[1] if len(parts) > 1 else ""
                if pci_addr not in EXPECTED_LAYOUT: continue
                bay_num = 0
                for p in parts:
                    if any(x in p for x in ["phy", "ata", "sas"]):
                        found = re.findall(r'\d+', p)
                        if found: bay_num = int(found[0])
                dev_name = os.path.basename(os.path.realpath(entry.path))
                try:
                    lsblk = subprocess.check_output(['lsblk', '-dno', 'SERIAL,SIZE', entry.path], text=True).strip().split()
                    sn, sz = (lsblk[0][-3:], lsblk[1]) if len(lsblk) > 1 else ("???", "???")
                except: sn, sz = "???", "???"
                state = zfs_active.get(dev_name, "UNUSED")
                led = "green" if state == "ONLINE" else "purple" if state == "UNUSED" else "orange"
                if bay_num < 16:
                    new_topology[pci_addr][bay_num] = {"bay": f"BAY {bay_num + 1}", "status": "PRESENT", "sn": sn, "size": sz, "led": led, "dev_name": dev_name}
    
    DISK_CACHE["topology"], DISK_CACHE["last_update"] = new_topology, time.time()

class DiskHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/data':
            if time.time() - DISK_CACHE["last_update"] > 5: update_heavy_stats()
            merged = {pci: [{**d, "active": DISK_CACHE["io_activity"].get(d.get("dev_name"), False)} for d in disks] for pci, disks in DISK_CACHE["topology"].items()}
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"hostname": DISK_CACHE["hostname"], "topology": merged}).encode())
        else: return super().do_GET()

threading.Thread(target=background_monitor, daemon=True).start()
update_heavy_stats()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), DiskHandler) as httpd: httpd.serve_forever()