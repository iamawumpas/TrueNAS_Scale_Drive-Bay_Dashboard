import http.server, socketserver, json, time, subprocess, socket, os, re, threading

# --- CONFIGURATION SECTION ---
PORT = 8010
EXPECTED_LAYOUT = {"0000:00:10.0": {"name": "Main HBA Storage", "bays": 16}}

# ZFS Parsing Configuration
ZFS_CONFIG = {
    "show_index": True,
    "pool_separator": " - ",
    "unallocated_label": "&nbsp;",        # Empty string removes "FREE"
    "use_nbsp": True
}

# UI Formatting Variables
UI_CONFIG = {
    "font_size_info": "1.5vw",
    "font_size_pool": "1.1vw",
    "color_sn": "#ffff00",          # Yellow
    "color_size": "#ff00ff",        # Pink
    "color_pool": "#ffffff",        # White
    "show_separator": False
}

# --- END OF CONFIGURATION SECTION ---

DISK_CACHE = {"topology": {}, "io_activity": {}, "last_update": 0, "hostname": socket.gethostname()}

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
    part_uuid_dir = '/dev/disk/by-partuuid'
    
    uuid_to_dev = {}
    if os.path.exists(part_uuid_dir):
        for uid in os.listdir(part_uuid_dir):
            try:
                real_path = os.path.realpath(os.path.join(part_uuid_dir, uid))
                uuid_to_dev[uid] = os.path.basename(real_path).rstrip('0123456789')
            except: pass

    zfs_pool_map = {} 
    zfs_state_map = {} 
    try:
        z_out = subprocess.check_output(['zpool', 'status'], text=True)
        current_pool = None
        disk_idx = 0
        for line in z_out.split('\n'):
            line = line.strip()
            if line.startswith('pool:'):
                current_pool = line.split(':')[1].strip()
                disk_idx = 0
            
            match = re.search(r'([0-9a-f-]{36}|vda[0-9]|sd[a-z]+[0-9]?)', line)
            if match and current_pool and "STATE" not in line and current_pool not in line:
                uid = match.group(1)
                disk_idx += 1
                dev_base = uuid_to_dev.get(uid, uid).rstrip('0123456789')
                
                sep = ZFS_CONFIG["pool_separator"]
                if ZFS_CONFIG["use_nbsp"]:
                    sep = sep.replace(" ", "&nbsp;")
                
                label = current_pool
                if ZFS_CONFIG["show_index"]:
                    label = f"{current_pool}{sep}{disk_idx}"
                
                zfs_pool_map[dev_base] = label
                parts = line.split()
                if len(parts) >= 2:
                    zfs_state_map[dev_base] = parts[1]
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
                    lsblk = subprocess.check_output(['lsblk', '-dbno', 'SERIAL,SIZE', entry.path], text=True).strip().split()
                    sn = lsblk[0][-3:] if lsblk else "???"
                    raw_bytes = int(lsblk[1]) if len(lsblk) > 1 else 0
                    size_tb = "{:.1f}TB".format(raw_bytes / (1024**4))
                except: 
                    sn, size_tb = "???", "???"
                
                pool_label = zfs_pool_map.get(dev_name, ZFS_CONFIG["unallocated_label"])
                state = zfs_state_map.get(dev_name, "UNUSED")
                
                # Updated Mapping for 3D LED States
                if state == "ONLINE":
                    led = "green"
                elif state == "RESILVER" or state == "REPLACING":
                    led = "white"
                elif state == "OFFLINE" or state == "FAULTED":
                    led = "red"
                elif state == "UNUSED":
                    led = "purple"
                else:
                    led = "orange" # ATTN / DEGRADED
                
                if bay_num < 16:
                    new_topology[pci_addr][bay_num] = {
                        "bay": f"BAY {bay_num + 1}", 
                        "status": "PRESENT", 
                        "sn": sn, 
                        "size": size_tb, 
                        "pool": pool_label,
                        "led": led, 
                        "dev_name": dev_name
                    }
    
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
            self.wfile.write(json.dumps({
                "hostname": DISK_CACHE["hostname"], 
                "topology": merged,
                "ui_config": UI_CONFIG
            }).encode())
        else: return super().do_GET()

threading.Thread(target=background_monitor, daemon=True).start()
update_heavy_stats()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("0.0.0.0", PORT), DiskHandler) as httpd:
    httpd.serve_forever()