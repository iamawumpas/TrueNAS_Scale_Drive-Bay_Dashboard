import json, os, re, shutil, subprocess

DEFAULT_TARGETS_PER_PORT = 4

def normalize_pci_address(pci_address):
    # Strip trailing 'h'/'H' from each hex component (sas2ircu LIST uses 00h:10h:00h:00h format)
    addr = re.sub(r'([0-9a-fA-F]+)[hH]', r'\1', pci_address)
    normalized = addr.replace('-', ':').replace('.', ':')
    parts = normalized.split(':')
    if len(parts) == 4 and len(parts[0]) <= 2:
        # sas2ircu Bus:Device:Function:Segment ÔåÆ Linux 0000:Bus:Device.Function
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

        # ┬½PCI Address : 00h:10h:00h:00h┬╗ (multi-line block style)
        pci_match = re.search(r"PCI\s+Address\s*[:=]\s*([0-9a-fA-FhH:.\- ]+)", line, re.IGNORECASE)
        if pci_match and current_adapter is not None:
            if normalize_pci_address(pci_match.group(1).strip()) == target:
                return current_adapter

        # Table row: ┬½  0  SAS2116_1  1000h  0064h  00h:10h:00h:00h  ÔÇª┬╗
        # Skip 4 whitespace-separated tokens then capture the PCI address token
        table_match = re.search(
            r"^\s*(\d+)(?:\s+\S+){3}\s+([0-9a-fA-FhH:.]+)", line
        )
        if table_match:
            if normalize_pci_address(table_match.group(2)) == target:
                return table_match.group(1)

    # ÔöÇÔöÇ Fallback: match via Bus/Device/Function in each adapter's DISPLAY output
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
      is_backplane=True  ÔåÆ appeared in the header with a Numslots entry; this is a physical
                           SAS expander backplane and gets its own chassis.
      is_backplane=False ÔåÆ NOT in the header; drives are connected directly to HBA PHYs
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
    # Numslots per enclosure from the bottom ┬½Enclosure information┬╗ section
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
            # (enc 1 = HBA virtual enclosure has no SES ÔåÆ direct-attach)
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

      - Each backplane expander (Numslots reported in ircu header) ÔåÆ separate chassis,
        bay positions match physical slot numbers, bay count = Numslots.

      - One direct-attach chassis for drives connected to HBA PHYs without a backplane
        (e.g. SFF-8087 to SATA breakout cables).  Bay capacity is computed as:
            total_adapter_PHYs ÔêÆ (num_backplane_enclosures ├ù DEFAULT_TARGETS_PER_PORT)
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

    # ÔöÇÔöÇ One chassis per backplane enclosure ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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

    # ÔöÇÔöÇ One chassis for direct-attach drives ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
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
    #     e.g. Numslots=16, 1 backplane ├ù 4 lanes = 12 direct-attach bays.
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
    - If backplane is detected, calculate: 4 ports ├ù 40 slots per backplane = 160 bays
    - Each port connects to one backplane with 40 slots
    
    Condition 2: No Backplane (Direct Attached Disks)
    - If no backplane: 4 ports ├ù 4 disks per port = 16 bays
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
        # 4 ports ├ù 40 slots per backplane = 160 total bays
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
        # User override: ports ├ù lanes per port
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
