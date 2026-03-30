import http.server, socketserver, json, time, subprocess, socket, os, re, threading, shutil
from collections import deque
from zfs_logic import get_zfs_topology, get_api_status

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
STYLE_CONFIG_FILE = os.path.join(BASE_DIR, 'config.json')
DEFAULT_TARGETS_PER_PORT = 4

def normalize_pci_address(pci_address):
    # Strip trailing 'h'/'H' from each hex component (sas2ircu LIST uses 00h:10h:00h:00h format)
    addr = re.sub(r'([0-9a-fA-F]+)[hH]', r'\1', pci_address)
    normalized = addr.replace('-', ':').replace('.', ':')
    parts = normalized.split(':')
    if len(parts) == 4 and len(parts[0]) <= 2:
        # sas2ircu Bus:Device:Function:Segment → Linux 0000:Bus:Device.Function
        try:
            bus  = f"{int(parts[0], 16):02x}"
            dev  = f"{int(parts[1], 16):02x}"
            func = f"{int(parts[2], 16):x}"
            return f"0000:{bus}:{dev}.{func}"
        except ValueError:
            pass
    if len(parts) == 4:
        return f"{parts[0]}:{parts[1]}:{parts[2]}.{parts[3]}"
    if len(parts) == 3:
        return f"0000:{parts[0]}:{parts[1]}.{parts[2]}"
    return addr


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
    """
    Return the adapter index (as a string) for the given PCI address.

    Strategy:
      1. Parse `LIST` output matching 'PCI Address' lines or the table row format
         (handles both plain hex 0000:00:10.0 and sas2ircu's 00h:10h:00h:00h forms).
      2. If LIST parsing fails enumerate available indices and check each adapter's
         Bus/Device/Function from its DISPLAY output.
    """
    try:
        list_out = subprocess.check_output([ircu_tool, "LIST"], text=True, timeout=2)
    except Exception:
        return None

    target = normalize_pci_address(pci_address)
    current_adapter = None

    for line in list_out.splitlines():
        adapter_match = re.search(r"Adapter\s*#?\s*(\d+)", line, re.IGNORECASE)
        if adapter_match:
            current_adapter = adapter_match.group(1)

        # «PCI Address : 00h:10h:00h:00h» (multi-line block style)
        pci_match = re.search(r"PCI\s+Address\s*[:=]\s*([0-9a-fA-FhH:.\- ]+)", line, re.IGNORECASE)
        if pci_match and current_adapter is not None:
            if normalize_pci_address(pci_match.group(1).strip()) == target:
                return current_adapter

        # Table row: «  0  SAS2116_1  1000h  0064h  00h:10h:00h:00h  …»
        # Skip 4 whitespace-separated tokens then capture the PCI address token
        table_match = re.search(
            r"^\s*(\d+)(?:\s+\S+){3}\s+([0-9a-fA-FhH:.]+)", line
        )
        if table_match:
            if normalize_pci_address(table_match.group(2)) == target:
                return table_match.group(1)

    # ── Fallback: match via Bus/Device/Function in each adapter's DISPLAY output
    indices = sorted(
        {m.group(1) for m in re.finditer(r"^\s*(\d+)\s+\S", list_out, re.MULTILINE)},
        key=int
    )
    for idx in indices:
        try:
            disp = subprocess.check_output(
                [ircu_tool, str(idx), "DISPLAY"], text=True, timeout=5
            )
            bus_m  = re.search(r"^\s*Bus\s*:\s*(\d+)", disp, re.MULTILINE)
            dev_m  = re.search(r"^\s*Device\s*:\s*(\d+)", disp, re.MULTILINE)
            func_m = re.search(r"^\s*Function\s*:\s*(\d+)", disp, re.MULTILINE)
            seg_m  = re.search(r"^\s*Segment\s*:\s*(\d+)", disp, re.MULTILINE)
            if bus_m and dev_m and func_m:
                seg      = int(seg_m.group(1)) if seg_m else 0
                bus      = int(bus_m.group(1))
                dev      = int(dev_m.group(1))
                func     = int(func_m.group(1))
                candidate = f"{seg:04x}:{bus:02x}:{dev:02x}.{func:x}"
                if candidate == target:
                    return idx
        except Exception:
            continue

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


def _parse_ircu_display(ircu_tool, adapter_id):
    """
    Parse `[ircu_tool] [adapter_id] DISPLAY` output into a structured enclosure map.
    Returns: (enclosures, phy_count) where:
      enclosures = { enc_id: { "slots": N, "is_backplane": bool,
                               "drives": { slot_id: { serial, model, size_bytes, raw_state } } } }
      phy_count  = total PHY count reported by the adapter (used to derive direct-attach capacity)
    Returns ({}, 0) on error or if no drive data is present.

    Enclosure classification:
      is_backplane=True  → appeared in the header with a Numslots entry; this is a physical
                           SAS expander backplane and gets its own chassis.
      is_backplane=False → NOT in the header; drives are connected directly to HBA PHYs
                           (e.g. via SFF-8087 to SATA breakout cable). Their capacity is
                           computed from remaining PHYs in get_ircu_slot_topology.
    """
    try:
        proc = subprocess.run(
            [ircu_tool, str(adapter_id), "DISPLAY"],
            capture_output=True, text=True, timeout=5
        )
        raw = proc.stdout
    except Exception:
        return {}, 0

    if "Device is a" not in raw:
        return {}, 0

    # Count PHY entries for total adapter lane capacity
    phy_count = sum(
        1 for line in raw.splitlines()
        if re.search(r"^\s*Phy\s*#?\s*\d+", line, re.IGNORECASE)
    )

    # Extract per-enclosure slot counts from the controller header section.
    # Only enclosures that appear here are physical backplane expanders.
    # Numslots per enclosure from the bottom «Enclosure information» section
    enc_slots = {
        eid: int(s)
        for eid, s in re.findall(
            r"Enclosure#\s+:\s+(\d+).*?Numslots\s+:\s+(\d+)", raw, re.DOTALL
        )
    }

    # Try to extract a stable per-enclosure array address (SAS/Logical ID) that
    # can be shown in the chassis header and used as a manual customization key.
    enc_array_addr = {}
    for block in re.findall(
        r"(Enclosure#\s+:\s+\d+.*?)(?=Enclosure#\s+:\s+\d+|$)",
        raw,
        re.DOTALL
    ):
        eid_match = re.search(r"Enclosure#\s+:\s+(\d+)", block)
        if not eid_match:
            continue
        enc_id = eid_match.group(1)
        addr_match = re.search(
            r"(?:Logical\s+ID|Enclosure\s+Logical\s+ID|SAS\s+Address)\s*:\s*([^\n\r]+)",
            block,
            re.IGNORECASE
        )
        if addr_match:
            enc_array_addr[enc_id] = addr_match.group(1).strip()

    # Which enclosures contain an SES/expander device? Those are the physical backplanes.
    # The HBA's own virtual enclosure never contains an 'Enclosure services device'.
    ses_enclosures = set()
    for block in raw.split("Device is a")[1:]:
        if "Enclosure services device" not in block and "enclosure services device" not in block.lower():
            continue
        en_match = re.search(r"Enclosure #\s+:\s+(\d+)", block)
        if en_match:
            ses_enclosures.add(en_match.group(1))

    enclosures = {}
    seen_serials = set()

    for block in raw.split("Device is a")[1:]:
        if "Hard disk" not in block:
            continue

        sn_match = re.search(r"Serial No\s+:\s+([^\n\r]+)", block)
        en_match = re.search(r"Enclosure #\s+:\s+(\d+)", block)
        sl_match = re.search(r"Slot #\s+:\s+(\d+)", block)
        st_match = re.search(r"State\s+:\s+([^\n\r]+)", block)
        md_match = re.search(r"Model Number\s+:\s+([^\n\r]+)", block)
        sz_match = re.search(r"Size \(in MB\)[^\d]*:\s+(\d+)", block)

        serial = sn_match.group(1).strip() if sn_match else "UNKNOWN"
        if serial == "UNKNOWN" or serial in seen_serials:
            continue
        seen_serials.add(serial)

        eid     = en_match.group(1) if en_match else "0"
        sid     = sl_match.group(1) if sl_match else "0"
        state   = st_match.group(1).strip() if st_match else "Ready"
        model   = md_match.group(1).strip() if md_match else "Unknown"
        size_mb = int(sz_match.group(1)) if sz_match else 0

        if eid not in enclosures:
            # is_backplane: enclosure has a physical SES/expander device
            # (enc 1 = HBA virtual enclosure has no SES → direct-attach)
            is_bp = eid in ses_enclosures
            enclosures[eid] = {
                "slots": enc_slots.get(eid, 0),
                "is_backplane": is_bp,
                "array_address": enc_array_addr.get(eid, ""),
                "drives": {}
            }

        enclosures[eid]["drives"][sid] = {
            "serial":     serial,
            "model":      model,
            "size_bytes": size_mb * 1048576,
            "raw_state":  state
        }

    # For backplane enclosures the authoritative bay count is the highest occupied
    # drive slot + 1 (Numslots includes management/SES pseudo-slots beyond drive bays).
    # For HBA virtual enclosures (is_backplane=False) keep Numslots as the addressing
    # capacity; that value is used by get_ircu_slot_topology to compute da_capacity.
    for enc in enclosures.values():
        if enc["is_backplane"] and enc["drives"]:
            enc["slots"] = max(int(s) for s in enc["drives"]) + 1
        elif enc["is_backplane"] and enc["slots"] == 0:
            enc["slots"] = 0  # empty backplane, handled gracefully below

    return enclosures, phy_count


def build_serial_to_dev_map():
    """
    Return { serial_number: base_device_name } for all block devices reported by lsblk.
    Used to correlate sas2ircu/sas3ircu serial numbers with kernel device names (sda, sdb, ...).

    lsblk inserts manufacturer-specific punctuation that sas2ircu omits, e.g.:
      lsblk  : WD-WCC3F3XV1DKV
      sas2ircu: WDWCC3F3XV1DKV
    For every serial we also store a dash-stripped variant as a lookup alias so both
    forms resolve to the same device name.
    """
    mapping = {}
    try:
        output = subprocess.check_output(
            ["lsblk", "-dno", "NAME,SERIAL"], text=True, timeout=5
        )
        for line in output.splitlines():
            parts = line.split()
            if len(parts) >= 2:
                dev    = parts[0]
                serial = parts[1].strip()
                mapping[serial] = dev
                # Alias: remove all hyphens so sas2ircu's dash-free form also resolves
                stripped = serial.replace('-', '')
                if stripped != serial:
                    mapping.setdefault(stripped, dev)
    except Exception:
        pass
    return mapping


def get_ircu_slot_topology(pci_address, zfs_map, config):
    """
    Build one chassis topology entry per physical enclosure on this HBA using sas3ircu/sas2ircu:

      - Each backplane expander (Numslots reported in ircu header) → separate chassis,
        bay positions match physical slot numbers, bay count = Numslots.

      - One direct-attach chassis for drives connected to HBA PHYs without a backplane
        (e.g. SFF-8087 to SATA breakout cables).  Bay capacity is computed as:
            total_adapter_PHYs − (num_backplane_enclosures × DEFAULT_TARGETS_PER_PORT)
        Bay positions match the PHY/slot index the drive is connected to.

    Returns {} when no ircu tool is available or the tool returns no useful data.
    Returns a dict { chassis_subkey: topology_dict } otherwise.
    Each topology_dict is compatible with new_topology entries used by topology_scanner_thread.
    """
    ircu_tool  = None
    adapter_id = None
    for tool in ("sas3ircu", "sas2ircu"):
        if not shutil.which(tool):
            continue
        aid = _find_ircu_adapter(tool, pci_address)
        if aid is not None:
            ircu_tool  = tool
            adapter_id = aid
            break

    if ircu_tool is None:
        return {}

    enclosures, phy_count = _parse_ircu_display(ircu_tool, adapter_id)
    if not enclosures:
        return {}

    serial_to_dev  = build_serial_to_dev_map()
    pci_key        = pci_address.replace(':', '-').replace('.', '-')
    device_config  = config.get("devices", {}).get(pci_address, {}) if isinstance(config, dict) else {}
    chassis_cfg    = device_config.get("chassis", {})
    override       = get_config_controller_override(pci_address, config)
    override_ports = override.get("ports", 0) if override else 0
    ports          = count_controller_ports(pci_address) or override_ports
    result         = {}

    def _lookup_zfs_disk(dev_name):
        if not isinstance(zfs_map, dict):
            return {"pool": "", "idx": "", "state": "UNALLOCATED", "temperature_c": None}

        direct = zfs_map.get(dev_name)
        if direct:
            return direct

        base_name = re.sub(r'p?\d+$', '', str(dev_name or ''))
        if base_name:
            base_match = zfs_map.get(base_name)
            if base_match:
                return base_match

            for candidate, info in zfs_map.items():
                if candidate == base_name or str(candidate).startswith(base_name):
                    return info

        return {"pool": "", "idx": "", "state": "UNALLOCATED", "temperature_c": None}

    def _make_disk(drive):
        """Enrich an ircu drive record with ZFS state from zfs_map."""
        serial    = drive["serial"]
        dev_name  = serial_to_dev.get(serial, "")
        z         = _lookup_zfs_disk(dev_name)
        zfs_state = z.get("state", "UNALLOCATED")
        if zfs_state == "UNALLOCATED":
            if any(x in drive["raw_state"] for x in ("Failed", "Missing", "Critical", "Degraded")):
                zfs_state = "FAULTED"
        return {
            "status":     "PRESENT",
            "sn":         serial,
            "size_bytes": drive["size_bytes"],
            "dev_name":   dev_name,
            "pool_name":  z.get("pool", ""),
            "pool_idx":   z.get("idx", ""),
            "state":      zfs_state,
            "temperature_c": z.get("temperature_c"),
            "model":      drive["model"]
        }

    # ── One chassis per backplane enclosure ─────────────────────────────────
    num_backplane_enclosures = 0
    for eid in sorted(enclosures.keys(), key=lambda x: int(x)):
        enc = enclosures[eid]
        if not enc["is_backplane"]:
            continue
        num_backplane_enclosures += 1
        num_slots    = enc["slots"]
        # Use the adapter-reported slot count as authoritative layout.
        # Ignore shared per-device chassis config overrides here: those were
        # written for the old combined chassis and would inflate the bay count.
        bays_per_row = num_slots
        rows         = 1

        disks = [{"status": "EMPTY"}] * num_slots
        for sid, drive in enc["drives"].items():
            bay_idx = int(sid)
            if bay_idx < num_slots:
                disks[bay_idx] = _make_disk(drive)

        result[f"{pci_key}-e{eid}"] = {
            "settings": {
                "pci_raw":          pci_address,
                "array_address":    enc.get("array_address", ""),
                "array_id":         f"e{eid}",
                "max_bays":         num_slots,
                "has_backplane":    True,
                "ports":            ports,
                "capacity_unknown": False,
                "rows":             rows,
                "bays_per_row":     bays_per_row
            },
            "disks": disks
        }

    # ── One chassis for direct-attach drives ─────────────────────────────────
    # Collect all drives from non-backplane enclosures (direct PHY connections).
    da_drives = {}
    for enc in enclosures.values():
        if enc["is_backplane"]:
            continue
        for sid, drive in enc["drives"].items():
            da_drives[int(sid)] = drive  # key = PHY/slot index

    # Capacity for direct-attach chassis, in priority order:
    #  1. HBA virtual enclosure's Numslots (enc where is_backplane=False) minus
    #     the PHY lanes consumed by each backplane SFF-8087/SFF-8088 connection.
    #     e.g. Numslots=16, 1 backplane × 4 lanes = 12 direct-attach bays.
    #  2. phy_count from DISPLAY (some firmware reports explicit PHY lines).
    #  3. config override max_bays minus total backplane slots.
    #  4. Last resort: highest populated slot index + 1.
    hba_total_slots = sum(enc["slots"] for enc in enclosures.values() if not enc["is_backplane"])
    if hba_total_slots > 0:
        da_capacity = max(hba_total_slots - num_backplane_enclosures * DEFAULT_TARGETS_PER_PORT, 0)
    elif phy_count > 0:
        da_capacity = max(phy_count - num_backplane_enclosures * DEFAULT_TARGETS_PER_PORT, 0)
    elif override and override.get("max_bays", 0):
        total_bp_slots = sum(enc["slots"] for enc in enclosures.values() if enc["is_backplane"])
        da_capacity = max(override["max_bays"] - total_bp_slots, 0)
    else:
        da_capacity = (max(da_drives.keys()) + 1) if da_drives else 0

    if da_capacity > 0 or da_drives:
        if da_capacity == 0 and da_drives:
            da_capacity = max(da_drives.keys()) + 1
        # Use computed capacity as the authoritative layout for the same reason
        # as the backplane chassis above.
        bays_per_row = da_capacity
        rows         = 1

        disks = [{"status": "EMPTY"}] * da_capacity
        for bay_idx, drive in da_drives.items():
            if bay_idx < da_capacity:
                disks[bay_idx] = _make_disk(drive)

        result[f"{pci_key}-da"] = {
            "settings": {
                "pci_raw":          pci_address,
                "array_address":    "",
                "array_id":         "",
                "max_bays":         da_capacity,
                "has_backplane":    False,
                "ports":            ports,
                "capacity_unknown": False,
                "rows":             rows,
                "bays_per_row":     bays_per_row
            },
            "disks": disks
        }

    return result


def lookup_zfs_disk_entry(zfs_map, dev_name):
    if not isinstance(zfs_map, dict):
        return {"pool": "", "idx": "", "state": "UNALLOCATED", "temperature_c": None}

    direct = zfs_map.get(dev_name)
    if direct:
        return direct

    base_name = re.sub(r'p?\d+$', '', str(dev_name or ''))
    if base_name:
        base_match = zfs_map.get(base_name)
        if base_match:
            return base_match

        for candidate, info in zfs_map.items():
            if candidate == base_name or str(candidate).startswith(base_name):
                return info

    return {"pool": "", "idx": "", "state": "UNALLOCATED", "temperature_c": None}


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
        "__REMARK_SERVER_NAME": "Server name display (top-left of each chassis).",
        "server_name": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "2.8rem",
            "style": ["bold", "smallcaps"]
        },
        "__REMARK_ENCLOSURE_LABEL": "Inline Backplane/Direct-Attach label shown beside hostname.",
        "enclosure_label": {
            "color": "#ffffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size_scale": 40,
            "style": ["allcaps"]
        },
        "__REMARK_PCI_ADDRESS": "PCI / enclosure identifier line under server name.",
        "pci_address": {
            "color": "#666666",
            "font": "Courier New, monospace",
            "size": "0.66rem",
            "style": ["bold"]
        },
        "__REMARK_LEGEND": "Legend chassis typography.",
        "legend": {
            "title_color": "rgba(255, 255, 255, 0.9)",
            "title_size": "1.25rem",
            "title_weight": "800",
            "item_color": "#cccccc",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "0.75rem",
            "style": ["bold", "allcaps"]
        },
        "__REMARK_BAY_ID": "Latch number styling.",
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
        "__REMARK_DISK_INDEX": "Pool index text.",
        "disk_index": {
            "color": "#00ffff",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "1.1vw",
            "style": ["bold"]
        },
        "__REMARK_DRIVE_TEMPERATURE": "Drive temperature text (global for all drive bays).",
        "drive_temperature": {
            "unit": "C",
            "color": "#ffffff",
            "font": "Arial, Helvetica, sans-serif",
            "size": "10px",
            "style": ["normal"]
        },
        "__REMARK_CHASSIS": "Chassis/legend/activity shell styling.",
        "chassis": {
            "background_base": "#1a1a1a",
            "border": "#333333",
            "shadow": "rgba(0,0,0,0.8)",
            "header_divider": "rgba(255,255,255,0.1)",
            "font_color": "#ffffff",
            "meta_color": "#98a7bd",
            "subtitle_color": "#7f8b9b",
            "stripe": "rgba(255, 255, 255, 0.03)",
            "gradient_start": "#111111",
            "gradient_mid_a": "#222222",
            "gradient_mid_b": "#333333",
            "gradient_end": "#111111"
        },
        "__REMARK_BAY": "Drive bay shell styling.",
        "bay": {
            "background_base": "#121212",
            "border": "#333333",
            "top_border": "#444444",
            "grill_size_scale": 50,
            "text_color": "#ced9ea",
            "empty_text_color": "#6e7d91",
            "led_panel_bg": "rgba(0, 0, 0, 0.2)",
            "grill_hole_color": "#000000",
            "bg_gradient_start": "#111621",
            "bg_gradient_end": "#0a0f18"
        },
        "__REMARK_LATCH": "Drive latch/handle styling.",
        "latch": {
            "gradient_start": "#333333",
            "gradient_mid": "#222222",
            "gradient_end": "#111111",
            "border_color": "rgba(255, 255, 255, 0.22)"
        },
        "__REMARK_LED_SHELL": "LED shell and dark-state colors.",
        "led_shell": {
            "dark_core": "#111111",
            "dark_highlight": "#222222",
            "border": "rgba(255, 255, 255, 0.05)",
            "shadow": "rgba(0, 0, 0, 0.9)"
        },
        "__REMARK_ACTIVITY": "Activity monitor card styling.",
        "activity": {
            "card_bg": "#0c0c0e",
            "card_border_top": "rgba(255, 255, 255, 0.15)",
            "card_border_left": "rgba(255, 255, 255, 0.1)",
            "card_border_right": "rgba(0, 0, 0, 0.5)",
            "card_border_bottom": "rgba(0, 0, 0, 0.6)",
            "card_shadow_inner": "rgba(0, 0, 0, 0.9)",
            "card_shadow_outer": "rgba(255, 255, 255, 0.05)",
            "card_glare": "rgba(255, 255, 255, 0.03)",
            "title_color": "#f28a02",
            "legend_color": "#ffffff"
        },
        "__REMARK_POOL": "Pool state indicator styling.",
        "pool": {
            "faulted_gradient_start": "#cc0000",
            "faulted_gradient_end": "#ff0000",
            "faulted_border": "#ffffff",
            "faulted_shadow": "rgba(255, 0, 0, 0.6)",
            "degraded_bg": "rgba(255, 165, 0, 0.3)",
            "degraded_border": "#ffa500",
            "state_text_color": "#ffffff",
            "state_text_bg": "rgba(0, 0, 0, 0.3)",
            "state_text_shadow": "rgba(0, 0, 0, 0.8)"
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
        },
        "__REMARK_ENVIRONMENT": "Page background settings.",
        "environment": {
            "page_bg_color": "#0a0a0a",
            "body_text_color": "#ffffff",
            "rebuild_border": "#2f3d52",
            "rebuild_bg": "#151a22",
            "rebuild_color": "#a4b4c8"
        },
        "__REMARK_LAYOUT": "Physical rack and bay spacing model.",
        "layout": {
            "rack_width_in": 19,
            "u_height_in": 1.75,
            "bay_gap_px": 6,
            "dashboard_max_width": "98vw",
            "dashboard_gap": "16px",
            "dashboard_top_gap": "14px"
        },
        "__REMARK_MENU": "Menu bar and form control styling for the rebuilt menu shell.",
        "menu": {
            "background": "linear-gradient(180deg, #222222 0%, #1a1a1a 100%)",
            "border": "#444444",
            "text": "#ffffff",
            "button_text": "#ffffff",
            "opacity": "1",
            "font": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
            "size": "12pt",
            "label_color": "#cccccc",
            "section_title_color": "#64c8ff",
            "dropdown_background": "#1a1a1a",
            "dropdown_border": "#555555",
            "dropdown_shadow": "rgba(0, 0, 0, 0.8)",
            "dropdown_opacity": 100,
            "controls": {
                "background": "#2a2a2a",
                "border": "#555555",
                "text": "#ffffff",
                "focus_border": "#64c8ff",
                "focus_glow": "rgba(100, 200, 255, 0.4)"
            },
            "buttons": {
                "save_bg": "#00cc00",
                "save_hover_bg": "#00ff00",
                "save_glow": "rgba(0, 255, 0, 0.5)",
                "revert_bg": "#cc0000",
                "revert_hover_bg": "#ff0000",
                "revert_glow": "rgba(255, 0, 0, 0.5)"
            },
            "warning": {
                "background": "#aa0000",
                "border": "#ffffff",
                "text": "#ffb3b3"
            }
        }
    },
    "__REMARK_CHART": "Activity monitor colors and dimensions.",
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
            "writeGradientBottom": "rgba(255, 159, 0, 0)",
            "yAxisLabelColor": "#ffffff",
            "yAxisGridColor": "rgba(255, 255, 255, 0.3)"
        },
        "__REMARK_DIMENSIONS": "Chart sizing and line styling parameters.",
        "dimensions": {
            "chartHeight": "50px",
            "cardWidth": "360px",
            "containerGap": "25px",
            "lineTension": "0.7",
            "lineWidth": "2",
            "cardMarginRight": "20px"
        }
    },
    "fonts": {
        "default": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
        "monospace": "Courier New, monospace"
    },
    "__REMARK_DEVICES": "Per-device geometry/layout overrides. Keys are PCI addresses.",
    "devices": {
        "0000:00:10.0": {
            "chassis": {
                "rack_units": 2
            },
            "bay": {
                "gap_px": 6
            }
        },
        "0000:00:10.0-e2": {
            "chassis": {
                "rack_units": 2
            },
            "bay": {
                "gap_px": 6,
                "layout": "horizontal",
                "grid_cols": 4,
                "grid_rows": 3,
                "fill_order": "row_major_ltr",
                "drive_sequence": "horizontal"
            }
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


def _strip_legacy_layout_overrides(config_obj):
    """Remove deprecated per-device chassis layout keys from config payload."""
    if not isinstance(config_obj, dict):
        return config_obj

    devices = config_obj.get("devices")
    if not isinstance(devices, dict):
        return config_obj

    for device_cfg in devices.values():
        if not isinstance(device_cfg, dict):
            continue
        chassis_cfg = device_cfg.get("chassis")
        if not isinstance(chassis_cfg, dict):
            continue
        chassis_cfg.pop("rows", None)
        chassis_cfg.pop("bays_per_row", None)

    return config_obj

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
        merged = _strip_legacy_layout_overrides(merged)

        # If new defaults were added, rewrite config.json so users
        # can see and edit the new options directly.
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
                            # Try ircu path first — gives authoritative per-slot data from the SCSI adapter.
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

                # Step 5: serial→dev map from lsblk
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

if __name__ == "__main__":
    threading.Thread(target=io_monitor_thread, daemon=True).start()
    threading.Thread(target=topology_scanner_thread, daemon=True).start()
    threading.Thread(target=pool_activity_monitor_thread, daemon=True).start()
    socketserver.TCPServer.allow_reuse_address = True
    PORT = get_port()
    print(f"Starting server on port {PORT}")
    with socketserver.TCPServer(("0.0.0.0", PORT), FastHandler) as httpd:
        httpd.serve_forever()