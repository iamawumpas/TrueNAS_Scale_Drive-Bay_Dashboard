# Python scripts overview

As of **v27.3** the backend is split into a `py/` package. `service.py` is the only startup entry point.

---

## `service.py` — startup entry point

Imports background threads and the HTTP handler from `py.server` and starts the TCP server. This file is launched directly by `start_up.sh` and by any automated init/systemd script.

```
service.py
  └─ imports from py/server.py: FastHandler, get_port,
       io_monitor_thread, topology_scanner_thread, pool_activity_monitor_thread
```

---

## `py/server.py` — HTTP server and background threads

Contains the full HTTP request handler class and three runtime threads:

- **`io_monitor_thread`** — Reads `/proc/diskstats` at 100 ms intervals. Compares sector counts frame-to-frame to set a boolean activity flag per device. Feeds the blue Activity LED on the front-end.
- **`topology_scanner_thread`** — Periodically calls hardware discovery from `py/topology.py` and ZFS mapping from `zfs_logic.py`. Writes results into `GLOBAL_DATA["topology"]`.
- **`pool_activity_monitor_thread`** — Samples per-pool I/O counters and appends readings to the rolling `pool_activity_history` deques consumed by the Activity Monitor charts.

**Endpoints served:**

| Method | Path | Description |
|---|---|---|
| `GET` | `/data` | Returns `hostname`, `topology`, and `config` payload for the front-end render loop |
| `GET` | `/pool-activity` | Returns rolling read/write history for all pools |
| `GET` | `/style-config` | Returns the styling portion of `config.json` |
| `GET` | `/livereload-status` | Returns file modification timestamps for dev auto-reload |
| `GET` | `/trigger-restart` | Runs `start_up.sh` via subprocess and returns the new port |
| `GET` | `/ircu-debug` | Returns HBA/enclosure discovery diagnostic payload |
| `POST` | `/save-config` | Accepts full `config.json` payload and writes to disk |
| `POST` | `/reset-config` | Regenerates `config.json` from defaults and reloads in-memory config |

---

## `py/topology.py` — hardware discovery

All physical controller and bay detection logic:

- **`normalize_pci_address`** — Normalises PCI address strings from various vendor formats (sas2ircu Bus:Dev:Func hex notation, dash-separated, colon-separated) into Linux canonical `DDDD:BB:DD.F` form.
- **`find_enclosure_slot_count`** — Reads `/sys/class/enclosure` to count physical slots on an attached backplane.
- **`count_controller_ports`** — Counts SAS phy ports via sysfs for fallback capacity detection.
- **`get_controller_capacity`** — Determines max bay count via enclosure detection, sas2ircu/sas3ircu/storcli, or sysfs phy count.
- **`is_virtual_storage_controller`** — Filters out virtual/emulated controllers so they are not presented as drive chassis.
- **`get_ircu_slot_topology`** — Maps adapter slot numbers to logical drives using sas2ircu/sas3ircu `DISPLAY` output.
- **`build_serial_to_dev_map`** — Builds a serial-number-to-block-device map from `/dev/disk/by-id`.

---

## `py/config.py` — config persistence

- Owns `DEFAULT_CONFIG` and `DEFAULT_CONFIG_JSON` dictionaries (used to regenerate defaults).
- **`load_config()`** — Reads `config.json`, falls back to defaults if missing or invalid JSON.
- **`load_style_config()`** — Returns the styling-only subset served by `/style-config`.
- Sets `BASE_DIR` and `CONFIG_FILE` paths relative to the repo root so imports work regardless of working directory.

---

## `zfs_logic.py` — ZFS state layer

Not part of the `py/` package (retained at the repo root for compatibility).

- **`get_zfs_topology(uuid_to_dev_map)`** — Dual-method detection:
  - **Primary:** `midclt call pool.query` for full TrueNAS API pool and disk data.
  - **Fallback:** Parses `zpool status -v -p` output when API is unavailable.
  - Returns `(zfs_map, pool_states)` covering all ZFS disk states and per-disk READ/WRITE/CHECKSUM error counts.
- **`get_api_status()`** — Reports API availability; used to trigger the front-end warning banner.

---

Notes:
- `start_up.sh` is also called by `GET /trigger-restart` via subprocess for port/network restart requests.
- The default port is read from `config.json` (`network.port`) and defaults to `8010` if missing or invalid.
- If `config.json` is deleted or corrupt, `py/config.py` regenerates it from `DEFAULT_CONFIG` on next load.

For implementation details see: [service.py](../service.py), [py/server.py](../py/server.py), [py/topology.py](../py/topology.py), [py/config.py](../py/config.py), and [zfs_logic.py](../zfs_logic.py).

