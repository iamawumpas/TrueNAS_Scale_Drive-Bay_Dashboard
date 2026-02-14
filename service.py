import http.server, socketserver, json, time, subprocess, socket, os, re, threading, shutil
from collections import deque
from zfs_logic import get_zfs_topology

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
STYLE_CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
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
    "config": {},
    "pool_activity_history": {}
}

# Hardcoded defaults for config.json - used to rebuild config.json if needed
DEFAULT_CONFIG_JSON = {
    "fonts": {
        "default": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
        "monospace": "Courier New, monospace"
    },
    "fontSizes": {
        "legendTitle": "1.25rem",
        "legend": "0.75rem",
        "serverName": "2.8rem",
        "pciAddress": "1.1rem",
        "bayId": "0.8vw",
        "diskSerial": "1.1vw",
        "diskSize": "1.1vw",
        "diskPool": "1.1vw",
        "diskIndex": "1.1vw"
    },
    "fontStyles": {
        "bold": "bold",
        "italic": "italic",
        "underline": "underline",
        "smallCaps": "small-caps",
        "allCaps": "uppercase"
    },
    "colors": {
        "serverName": "#ffffff",
        "pciAddress": "#666666",
        "legend": "#cccccc",
        "legendTitle": "rgba(255, 255, 255, 0.9)",
        "bayId": "#ffaa00",
        "diskSerial": "#ffff00",
        "diskSize": "#ff00ff",
        "diskPool": "#ffffff",
        "diskIndex": "#00ffff",
        "chassisBgBase": "#1a1a1a",
        "chassisBorder": "#333333",
        "chassisShadow": "rgba(0,0,0,0.8)",
        "bayBgBase": "#121212",
        "bayBorder": "#333333",
        "bayTopBorder": "#444444",
        "ledAllocatedHealthy": "#00ff00",
        "ledAllocatedOffline": "#555555",
        "ledError": "#ffaa00",
        "ledFaulted": "#ff0000",
        "ledResilvering": "#ffffff",
        "ledUnallocated": "#a000ff",
        "ledUnallocError": "#ffaa00",
        "ledUnallocFault": "#ff0000",
        "ledActivity": "#008cff"
    }
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
        ,
        "__REMARK_ENVIRONMENT": "Environment settings for page background, menu styling, and flare effects.",
        "environment": {
            "page_bg_color": "#0a0a0a",
            "menu_bg_color": "#2a2a2a",
            "menu_text_color": "#ffffff",
            "menu_opacity": 100,
            "flare_color": "#ffffff",
            "flare_angle": 45,
            "flare_offset_x": 50,
            "flare_offset_y": 50,
            "flare_opacity": 0.225,
            "flare_size": 50,
            "flare_shape": 100,
            "scale": 100
        }
    },
    "__REMARK_CHART": "Activity Monitor chart colors, gradients, and dimensions.",
    "chart": {
        "__REMARK_COLORS": "Line and gradient colors for pool activity charts.",
        "colors": {
            "readColor": "#2a00d6",
            "writeColor": "#ff9f00",
            "readDotColor": "#2a00d6",
            "writeDotColor": "#ff9f00",
            "readGradientTop": "rgba(42, 0, 214, 0.5)",
            "readGradientBottom": "rgba(42, 0, 214, 0)",
            "writeGradientTop": "rgba(255, 159, 0, 0.5)",
            "writeGradientBottom": "rgba(255, 159, 0, 0)"
        },
        "__REMARK_DIMENSIONS": "Chart sizing and line styling parameters.",
        "dimensions": {
            "chartHeight": "75px",
            "cardWidth": "250px",
            "cardMarginRight": "20px",
            "containerGap": "20px",
            "lineTension": "0.7",
            "lineWidth": "2"
        }
    }
}

# config.json remarks as requested
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

        # If new defaults were added (e.g., UI config), rewrite config.json
        # so users can see and edit the new options directly.
        if merged != data:
            try:
                with open(CONFIG_FILE, 'w') as f:
                    json.dump(merged, f, indent=4)
            except Exception:
                pass

        CONFIG_CACHE = merged
        CONFIG_MTIME = mtime
        return merged
    except Exception as e:
        print(f"config file error :: reverting to default settings ({e})")
        CONFIG_CACHE = DEFAULT_CONFIG
        return DEFAULT_CONFIG

def load_style_config():
    """Load style configuration from config.json for fonts, colors, etc."""
    try:
        # First, try to load the main config file
        if not os.path.exists(CONFIG_FILE):
            # If no config exists, return default style config
            return DEFAULT_CONFIG_JSON

        with open(CONFIG_FILE, 'r') as f:
            data = json.load(f)
        
        # Check if this is the new style config format (fonts, fontSizes, colors)
        if 'fonts' in data and 'fontSizes' in data and 'colors' in data:
            # New format - use it directly
            merged = _deep_merge_dict(DEFAULT_CONFIG_JSON, data)
            return merged
        
        # Check if this is the old UI config format (ui.server_name, etc.)
        if 'ui' in data and isinstance(data['ui'], dict):
            # Convert old format to new format
            ui = data['ui']
            converted = {
                "fonts": {},
                "fontSizes": {},
                "colors": {}
            }
            
            # Extract fonts
            fonts_set = set()
            for key in ['server_name', 'pci_address', 'legend', 'bay_id', 'disk_serial', 'disk_size', 'disk_pool', 'disk_index']:
                if key in ui and isinstance(ui[key], dict) and 'font' in ui[key]:
                    fonts_set.add(ui[key]['font'])
            
            if fonts_set:
                # Identify default and monospace fonts
                for font in fonts_set:
                    if 'mono' in font.lower() or 'courier' in font.lower():
                        converted['fonts']['monospace'] = font
                    else:
                        converted['fonts']['default'] = font
            
            # Extract colors and sizes
            mapping = {
                'server_name': 'serverName',
                'pci_address': 'pciAddress',
                'bay_id': 'bayId',
                'disk_serial': 'diskSerial',
                'disk_size': 'diskSize',
                'disk_pool': 'diskPool',
                'disk_index': 'diskIndex'
            }
            
            for old_key, new_key in mapping.items():
                if old_key in ui and isinstance(ui[old_key], dict):
                    if 'color' in ui[old_key]:
                        converted['colors'][new_key] = ui[old_key]['color']
                    if 'size' in ui[old_key]:
                        converted['fontSizes'][new_key] = ui[old_key]['size']
            
            # Extract legend colors and sizes
            if 'legend' in ui and isinstance(ui['legend'], dict):
                if 'item_color' in ui['legend']:
                    converted['colors']['legend'] = ui['legend']['item_color']
                if 'title_color' in ui['legend']:
                    converted['colors']['legendTitle'] = ui['legend']['title_color']
                if 'size' in ui['legend']:
                    converted['fontSizes']['legend'] = ui['legend']['size']
                if 'title_size' in ui['legend']:
                    converted['fontSizes']['legendTitle'] = ui['legend']['title_size']
            
            # Extract chassis and bay colors
            if 'chassis' in ui and isinstance(ui['chassis'], dict):
                if 'background_base' in ui['chassis']:
                    converted['colors']['chassisBgBase'] = ui['chassis']['background_base']
                if 'border' in ui['chassis']:
                    converted['colors']['chassisBorder'] = ui['chassis']['border']
                if 'shadow' in ui['chassis']:
                    converted['colors']['chassisShadow'] = ui['chassis']['shadow']
            
            if 'bay' in ui and isinstance(ui['bay'], dict):
                if 'background_base' in ui['bay']:
                    converted['colors']['bayBgBase'] = ui['bay']['background_base']
                if 'border' in ui['bay']:
                    converted['colors']['bayBorder'] = ui['bay']['border']
                if 'top_border' in ui['bay']:
                    converted['colors']['bayTopBorder'] = ui['bay']['top_border']
            
            # Extract LED colors
            if 'led_colors' in ui and isinstance(ui['led_colors'], dict):
                led_mapping = {
                    'allocated_healthy': 'ledAllocatedHealthy',
                    'allocated_offline': 'ledAllocatedOffline',
                    'error': 'ledError',
                    'faulted': 'ledFaulted',
                    'resilvering': 'ledResilvering',
                    'unallocated': 'ledUnallocated',
                    'unalloc_error': 'ledUnallocError',
                    'unalloc_fault': 'ledUnallocFault',
                    'activity': 'ledActivity'
                }
                for old_key, new_key in led_mapping.items():
                    if old_key in ui['led_colors']:
                        converted['colors'][new_key] = ui['led_colors'][old_key]
            
            # Merge with defaults
            merged = _deep_merge_dict(DEFAULT_CONFIG_JSON, converted)
            return merged
        
        # If neither format, return defaults
        return DEFAULT_CONFIG_JSON
        
    except Exception as e:
        print(f"style config file error :: reverting to default settings ({e})")
        return DEFAULT_CONFIG_JSON


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
                            # Get chassis config for this device (rows and bays_per_row)
                            device_config = GLOBAL_DATA["config"].get("devices", {}).get(pci_raw, {})
                            chassis_config = device_config.get("chassis", {})
                            rows = chassis_config.get("rows", 1)
                            bays_per_row = chassis_config.get("bays_per_row", controller_capacity[pci_key]["max_bays"])
                            
                            new_topology[pci_key] = {
                                "settings": {
                                    "pci_raw": pci_raw,
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
    def do_POST(self):
        # Handle POST requests for saving configuration
        path = self.path.split('?')[0]
        
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
                global CONFIG_MTIME, CONFIG_CACHE
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
        return super().do_GET()

if __name__ == "__main__":
    threading.Thread(target=io_monitor_thread, daemon=True).start()
    threading.Thread(target=topology_scanner_thread, daemon=True).start()
    threading.Thread(target=pool_activity_monitor_thread, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    PORT = get_port()
    print(f"Starting server on port {PORT}")
    with socketserver.TCPServer(("0.0.0.0", PORT), FastHandler) as httpd:
        httpd.serve_forever()