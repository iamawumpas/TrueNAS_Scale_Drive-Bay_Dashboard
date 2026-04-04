# Developer Notes - TrueNAS Scale Drive-Bay Dashboard

## Core Architecture (v27.3)

The system is split into two independent layers that communicate over HTTP JSON.

### Backend

`service.py` is the startup entry point only. All runtime logic lives in the `py/` package:

- **`py/server.py`** — HTTP handler (`FastHandler`) and three daemon threads:
  - `io_monitor_thread`: samples `/proc/diskstats` every 100 ms, tracks per-device sector-count deltas to set an activity boolean.
  - `topology_scanner_thread`: runs hardware + ZFS detection on a timer, writes results into `GLOBAL_DATA`.
  - `pool_activity_monitor_thread`: appends per-pool I/O samples to rolling `deque` history for the activity charts.
- **`py/topology.py`** — All physical controller and bay-slot discovery. PCI address normalization, sysfs enclosure slot counting, sas2ircu/sas3ircu/storcli adapter queries, `/dev/disk/by-path` bay index parsing.
- **`py/config.py`** — Config file loading, default config generation (`DEFAULT_CONFIG`, `DEFAULT_CONFIG_JSON`), style-config payload serving.
- **`zfs_logic.py`** — ZFS state layer (repo root, not part of the `py/` package for compatibility). Dual-method: TrueNAS `midclt` API primary, `zpool status` fallback.

### Frontend

`app.js` and `MenuSystem.js` are thin orchestrators. Business logic is split into focused ES modules under `js/`:

- **`js/data.js`** — Fetch layer (timeout, retry, last-good cache, topology guards).
- **`js/renderer.js`** — DOM builder with incremental per-chassis diffing. Only replaces bay nodes that changed state.
- **`js/topology.js`** — Grid layout, bay ordering, disk info formatting, status-to-CSS-class mapping.
- **`js/styleVars.js`** — CSS custom property injection for global and per-device config values.
- **`js/configStore.js`** — In-memory config state (original snapshot, working copy, dirty flag, CRUD helpers).
- **`js/stylePreview.js`** — Live-preview CSS application without disk writes; debounced Chart.js recreation.
- **`js/menuBuilder.js`** — Pure HTML string builders for every menu panel.
- **`js/utils.js`** — Shared primitives: `clampInt`, `mixHex`, grill SVG builders, decoration texture helpers, `applyConfigMap`.

---

## Hardware Mapping & Correlation

Mapping a physical disk slot to a software device name (`sdX`) is achieved through `/dev/disk/by-path`.

### ZFS Integration
TrueNAS Scale typically uses **Part-UUIDs** in ZFS pool configurations. To correctly identify pool membership, `py/server.py` runs the topology scanner which:
- Maps **Part-UUIDs** from `/dev/disk/by-partuuid` to parent block devices.
- Calls `zfs_logic.get_zfs_topology()` to get pool names and disk states.
- Correlates resolved block device names with HBA PCI paths to assign each disk to the correct UI slot.

---

## Configuration & Customization

The system is highly configurable via `config.json`. `py/config.py` owns default values and load/save logic. The front-end menu reads and writes config through `js/configStore.js` (in-memory state) and sends `POST /save-config` to persist changes.

### Key config sections
- **`network`**: port number.
- **`ui`**: global dashboard/chassis/bay/menu/legend/activity styling and typography.
- **`chart`**: activity monitor graph colors, dimensions, and typography scales.
- **`devices.<enclosure-key>`**: per-enclosure overrides (chassis color/decorations, bay orientation/order/grill, and per-bay text styles).
- **`fonts`**: default and monospace font families applied as CSS variables.

---

## Technical Implementation Details

- **Capacity Conversion**: Raw bytes from `lsblk -b` converted to Terabytes ($1024^4$) for a clean `X.XTB` display.
- **I/O Monitoring**: `io_monitor_thread` in `py/server.py` snapshots `/proc/diskstats` and tracks delta sector counts, setting the `active` flag that drives the blue Activity LED.
- **Incremental Rendering**: `js/renderer.js` builds a per-chassis model string and compares it to the previous render cycle. Only DOM nodes whose model differs are replaced, preventing full chassis rebuilds on every poll tick.
- **Decoration Textures**: `DecorationTexture.js` generates deterministic seeded canvas textures keyed to slider values. Both the live dashboard and menu preview use the same generator so previews match the rendered output exactly.
- **LED Logic**:
  - **Green**: Online and healthy in a ZFS pool.
  - **Purple**: Physical disk present but not allocated to any pool.
  - **Orange**: Disk has error counts or attention state.
  - **Red**: Disk or pool is FAULTED/UNAVAIL/SUSPENDED.
  - **White**: Disk is RESILVERING.
  - **Blue**: Active I/O detected this cycle.
- **PCI Pathing**: Controller discovery scans `/dev/disk/by-path` for PCI patterns. Virtual controllers are filtered by `is_virtual_storage_controller` in `py/topology.py`. Max bay count is determined by enclosure sysfs, phy count, or vendor tool queries in that priority order. All can be overridden in `config.json` per controller.

