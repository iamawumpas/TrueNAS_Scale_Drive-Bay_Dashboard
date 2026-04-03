# How It Works — TrueNAS Scale Drive-Bay Dashboard

This document explains what every file does, what the important code inside it is responsible for, and how files connect to each other.

---

## Quick Architecture Summary

```
Browser
  │
  │  HTTP GET /data  (every 100ms)
  │  HTTP GET /pool-activity
  │  HTTP POST /save-config
  │
  ▼
service.py ──► py/server.py ──► py/topology.py   (hardware scan)
                             ├─► py/config.py     (config load/save)
                             └─► zfs_logic.py     (ZFS state/pool map)

Browser renders via:
  index.html
    ├─ app.js ──────────────────► js/data.js       (fetch + retry)
    │                         ├─► js/renderer.js   (DOM build + diff)
    │                         ├─► js/topology.js   (grid + status)
    │                         └─► js/styleVars.js  (CSS variables)
    │
    └─ MenuSystem.js (module) ──► js/configStore.js  (config state)
                              ├─► js/stylePreview.js (live preview CSS)
                              └─► js/menuBuilder.js  (panel HTML)
                              (all three also use js/utils.js)
```

---

## Startup Flow

### `start_up.sh`
Shell script. The only thing TrueNAS Init/Shutdown Scripts and manual restarts call.

1. `cd` into the script's own directory so relative Python imports work.
2. `pkill -9 -f service.py` — kills any running instance to avoid port conflicts.
3. `find . -type d -name __pycache__ | xargs rm -rf` — clears stale bytecode.
4. `sleep 1` — gives the OS time to release the port.
5. `nohup python3 service.py > /dev/null 2>&1 &` — starts the daemon in the background.

**Also called by**: `py/server.py` via `subprocess.Popen` when the front-end sends `GET /trigger-restart` (e.g. after a port change in the menu).

---

### `service.py`
Thin entry point. Imports and wires everything from `py/`:

```python
from py.server import (
    FastHandler, get_port,
    io_monitor_thread, topology_scanner_thread, pool_activity_monitor_thread
)
```

Starts the three daemon threads, then opens a `socketserver.TCPServer` bound to `0.0.0.0:<port>` with `FastHandler` as the request handler.

**Connects to**: `py/server.py` (all symbols).

---

## Backend Modules (`py/`)

### `py/__init__.py`
Empty. Makes the `py/` directory a Python package so `service.py` can use `from py.server import ...` style imports.

---

### `py/config.py`
All config file I/O and default value definitions.

**Key constants:**
- `BASE_DIR` — absolute path to the repo root (one level up from `py/`).
- `CONFIG_FILE` — `BASE_DIR/config.json`.
- `DEFAULT_CONFIG_JSON` — legacy flat-key defaults used for the `/style-config` JSON response.
- `DEFAULT_CONFIG` — full nested config dict used to regenerate `config.json` when missing or corrupt.

**Key functions:**
- `load_config()` — reads `config.json`, parses JSON, falls back to `DEFAULT_CONFIG` on any error.
- `load_style_config()` — returns the styling subset (fonts, colors, fontSizes) served by `GET /style-config`.

**Connects to**: `py/server.py` (imports `load_config`, `load_style_config`, `CONFIG_FILE`, `DEFAULT_CONFIG_JSON`, `BASE_DIR`).

---

### `py/topology.py`
Physical hardware discovery — nothing in here makes network or ZFS calls.

**PCI address utilities:**
- `normalize_pci_address(pci_address)` — converts sas2ircu hex notation (`00h:10h:00h:00h`), dash-separated, or short forms to Linux canonical `DDDD:BB:DD.F`. Used everywhere a PCI address needs to be compared against sysfs paths.

**Enclosure / capacity detection:**
- `find_enclosure_slot_count(pci_address)` — walks `/sys/class/enclosure` to find a backplane attached to a given PCI address and counts its slots. Returns 0 if no backplane is found.
- `count_controller_ports(pci_address)` — counts SAS phy ports via `/sys/class/sas_phy` sysfs entries as a fallback when no backplane is present.
- `get_controller_capacity(pci_address, settings)` — authoritative bay count. Tries (in order): `settings` override from config, enclosure slot count, sas2ircu/sas3ircu `LIST` output, storcli query, sysfs phy count, default 4 ports.

**Controller filtering:**
- `is_virtual_storage_controller(pci_address)` — returns True for virtio, USB mass-storage, and other non-HBA controllers so they are never shown as drive chassis.

**SAS adapter topology:**
- `_find_ircu_adapter(pci_address)` — scans `sas2ircu LIST` or `sas3ircu LIST` output to find the adapter index matching a PCI address.
- `_parse_ircu_display(output)` — parses `DISPLAY` command output to extract SAS slot-to-device mappings.
- `get_ircu_slot_topology(pci_address)` — calls the above two to return a dict of slot number → device serial mapping.

**Disk identity:**
- `build_serial_to_dev_map()` — reads `/dev/disk/by-id` symlinks to build a serial-number → block-device dict.
- `lookup_zfs_disk_entry(dev_name, zfs_map)` — looks up a block device in the ZFS topology map, trying both base device and partition variants.

**Connects to**: `py/server.py` (imports all the above); also uses `subprocess`, `os`, `re`, `shutil`.

---

### `py/server.py`
The runtime core. Background threads + HTTP handler.

**Global state:**
```python
GLOBAL_DATA = {
    "topology": {},       # Per-controller chassis+disk data
    "io_activity": {},    # {dev: bool} activity flags
    "hostname": ...,
    "config": {},
    "pool_activity_history": {}
}
```

**Background threads:**

| Thread | Interval | What it does |
|---|---|---|
| `io_monitor_thread` | 100 ms | Reads `/proc/diskstats`, diffs sector totals frame-to-frame, sets `io_activity[dev] = True` for 2 cycles after any delta is detected |
| `topology_scanner_thread` | ~5 s | Calls PCI scanner, `get_controller_capacity`, `/dev/disk/by-path` parser, `build_serial_to_dev_map`, `get_zfs_topology`, assembles the full `topology` dict, writes into `GLOBAL_DATA` |
| `pool_activity_monitor_thread` | 1 s | Reads `/proc/diskstats` for pool-member devices, appends per-pool read/write delta to rolling `deque` (max 60 entries = 1 min history) |

**HTTP endpoints:**

| Endpoint | Handler behaviour |
|---|---|
| `GET /data` | Serialises `GLOBAL_DATA["topology"]`, `hostname`, and `config` into JSON. Merges `io_activity` flags into disk entries before responding. |
| `GET /pool-activity` | Returns `pool_activity_history` serialised as JSON. |
| `GET /style-config` | Calls `load_style_config()` and returns JSON. |
| `GET /livereload-status` | Returns `mtime` dict of watched files; used by `livereload.js` dev helper. |
| `GET /trigger-restart` | Writes new port to `config.json` if supplied, then runs `start_up.sh` via `subprocess.Popen`. Returns new port. |
| `GET /ircu-debug` | Returns raw sas2ircu/sas3ircu/enclosure diagnostic data for troubleshooting bay mapping. |
| `POST /save-config` | Reads JSON body, validates top-level keys, writes to `config.json`, invalidates in-memory config cache. |
| `POST /reset-config` | Overwrites `config.json` with `DEFAULT_CONFIG`, reloads, returns new config. |
| `GET /*` | Static file serve from `BASE_DIR` with MIME type detection. |

**Connects to**: `py/config.py` (config load/save/defaults), `py/topology.py` (hardware scan), `zfs_logic.py` (ZFS map + pool states).

---

### `zfs_logic.py`
ZFS state and pool membership layer.

**`get_zfs_topology(uuid_to_dev_map)`**
1. **Primary path** — runs `midclt call pool.query` (TrueNAS only). Parses the JSON response to extract pool name, per-vdev disk state, and READ/WRITE/CHECKSUM error counts.
2. **Fallback path** — runs `zpool status -v -p`, parses text output for pool name, disk GUIDs/paths, and state tokens.
3. Returns `(zfs_map, pool_states)`:
   - `zfs_map`: dict keyed by block device name → `{pool_name, pool_state, disk_state, errors}`.
   - `pool_states`: dict keyed by pool name → state string (ONLINE, DEGRADED, FAULTED, SUSPENDED).

**`get_api_status()`** — Returns a dict indicating whether the TrueNAS `midclt` API is reachable. Used by `py/server.py` to include an API warning in the `/data` response when it falls back to `zpool`.

**Connects to**: `py/server.py` (imported via `from zfs_logic import get_zfs_topology, get_api_status`).

---

## HTML Entry Point

### `index.html`
Static shell. No logic of its own.

**Script load order (important):**
1. `livereload.js` — dev helper (first so it can catch errors in everything else).
2. `ActivityMonitor.js` — defines `window.activityMonitor` which `app.js` references.
3. `DecorationTexture.js` — defines `window.DashboardDecorationTexture` shared by renderer and preview.
4. `geometry.js` — defines `window.GEOMETRY_DEFAULTS` and `window.CHASSIS_BAY_PRESETS`.
5. `DiskInfo.js` — legacy helper (no-op at runtime, retained for compatibility).
6. `MenuSystem.js` — loaded as `type="module"`. Imports `js/configStore.js`, `js/stylePreview.js`, `js/menuBuilder.js`.
7. `app.js` — loaded after all globals are defined. Imports `js/data.js`, `js/renderer.js`, `js/styleVars.js`.

**Connects to**: all JS files listed above.

---

## Frontend Orchestrators

### `app.js`
Main poll-render loop.

```
app.js
  imports: fetchDataWithRetry, getTopologyEntries, hasUsableTopology  ← js/data.js
           renderDashboard, computeDashboardSceneScale                 ← js/renderer.js
           applyUiVariables, applyDeviceVariables                      ← js/styleVars.js
```

**Poll loop (every 100 ms):**
1. `fetchDataWithRetry()` — fetch `/data` with timeout and retry.
2. `applyUiVariables(config, hostname)` — inject CSS variables from `config.ui`.
3. `renderDashboard(topology, config)` — build/update chassis and bay DOM.
4. Dispatch `dashboardUpdate` custom event consumed by `ActivityMonitor.js`.
5. On fetch failure: retain last-good render; show stale-data indicator after TTL expires.

**Connects to**: `js/data.js`, `js/renderer.js`, `js/styleVars.js`, `ActivityMonitor.js` (via custom events and `window.activityMonitor`).

---

### `MenuSystem.js`
Menu orchestrator (ES module).

```
MenuSystem.js
  imports: initConfig, workingConfig, isDirty, ...          ← js/configStore.js
           applyActivityVariables, applyChassisColors, ...  ← js/stylePreview.js
           buildGlobalStylePanel, buildDiskArraysPanel, ...  ← js/menuBuilder.js
           (shared primitives)                               ← js/utils.js
```

**Responsibilities:**
- Builds the top menu bar and registers click/change handlers for all controls.
- On control change: updates `workingConfig` via `configStore`, calls the appropriate `stylePreview` function for instant visual feedback.
- **SAVE**: `POST /save-config` with `workingConfig` JSON body; calls `setOriginalConfigSnapshot()` on success.
- **REVERT**: replaces `workingConfig` with the original snapshot; re-applies all CSS variables.
- **RESET**: `POST /reset-config`; receives new default config; re-initialises `configStore` and re-draws menus.
- Listens for `dashboardUpdate` events to rebuild Disk Arrays panels when the topology changes (e.g. a new chassis is detected).

**Connects to**: `js/configStore.js`, `js/stylePreview.js`, `js/menuBuilder.js`, `js/utils.js`, `js/styleVars.js` (for full variable re-apply on revert).

---

## Frontend Modules (`js/`)

### `js/data.js`
Fetch layer only. No DOM or CSS awareness.

**Exports:**
- `fetchDataWithRetry()` — wraps `fetch('/data')` with a 1500 ms timeout (`AbortController`). Retries up to 2 times with 150 ms then 500 ms delays before throwing.
- `getTopologyEntries(payload)` — safely extracts `Object.entries(payload.topology)`, returns `[]` on invalid input.
- `hasUsableTopology(payload)` — returns true when `getTopologyEntries` has at least one entry.

Also holds module-level last-good payload cache and TTL used by `app.js` to decide whether to keep the old render during a fetch outage.

**Connects to**: `app.js` (all exports consumed there).

---

### `js/renderer.js`
DOM builder with incremental diffing.

**Exports:**
- `computeDashboardSceneScale(availableWidthPx)` — calculates a viewport-aware scale factor (0.5–1.15) based on available width and height against 1280×800 reference dimensions.
- `bayMarkup(disk, latchNumber, layout, tempUnit)` — returns an HTML string for a single drive bay. Calls `formatDiskInfo`, `statusClassForDisk`, `getTemperatureSeverityClass` from `js/topology.js`.
- `renderDashboard(topology, config)` — outer render loop. For each chassis entry, calls `buildEnclosureModel` from `js/topology.js` to get a canonical model string, compares with `previousModels` Map, and only replaces the chassis DOM node if the model changed.

**Connects to**: `js/topology.js` (geometry + disk formatting), `js/styleVars.js` (per-device CSS override application), `app.js` (consumer of `renderDashboard`).

---

### `js/topology.js`
Grid resolution and disk data formatting. No DOM access.

**Exports:**
- `normalizeTopologyKey` / `normalizeLayout` / `normalizeFillOrder` — canonicalise config values that may come in multiple string forms.
- `statusClassForDisk(disk)` — returns the CSS class string for a disk's LED state (e.g. `allocated-healthy`, `faulted`, `unallocated`, `resilvering`). Covers both allocated and unallocated cases.
- `getTemperatureSeverityClass(disk)` — returns `temp-warn` or `temp-crit` CSS class based on temperature thresholds.
- `formatDiskInfo(disk, unit)` — returns `{serial, size, temperature, pool, index}` safe display strings.
- `buildEnclosureModel(chassisData, config, enclosureKey)` — the key function consumed by `js/renderer.js`. Resolves grid dimensions, applies fill-order sorting, and returns a deterministic model string encoding the visible state of every bay.

**Connects to**: `geometry.js` (imports `GEOMETRY_DEFAULTS`, `CHASSIS_BAY_PRESETS`), `js/utils.js` (imports `clampInt`), `js/renderer.js` (consumer).

---

### `js/styleVars.js`
CSS custom property injector. No logic beyond mapping config values to property names.

**Exports:**
- `applyUiVariables(config, hostname)` — maps every `config.ui` and `config.fonts` field to its corresponding `--css-variable` on `document.documentElement.style`. Also sets hostname label.
- `applyDeviceVariables(enclosureKey, deviceConfig, sceneScale)` — applies per-chassis overrides: chassis colors, bay size/orientation, grill pattern, and decoration texture. Calls `buildGrillImageCss` and `getDecorationTextureFn` from `js/utils.js`.

**Connects to**: `js/utils.js` (grill + decoration helpers, `applyConfigMap`, `mixHex`), `app.js` (consumer of `applyUiVariables`), `js/renderer.js` (consumer of `applyDeviceVariables`), `js/stylePreview.js` (imports `applyDeviceVariables` for live preview).

---

### `js/configStore.js`
In-memory config state manager. No DOM or network access.

**Module-level state:**
- `originalConfig` — the last saved/loaded snapshot.
- `workingConfig` — the live, possibly dirty, copy being edited in the menu.
- `isDirty` — true when `workingConfig` differs from `originalConfig`.

**Exports:**
- `initConfig(config)` — sets both snapshots from a fresh server response.
- `setWorkingConfigFrom(config)` — replaces working copy (used on revert/reset).
- `setOriginalConfigSnapshot()` — promotes working copy to the saved snapshot after a successful save.
- `markClean()` — clears `isDirty`.
- `getNestedValue(obj, path)` — safe deep-read by path array.
- `normalizeMenuControlValue(path, rawValue)` — normalises `layout` and `fill_order` strings from user input.
- `getLegacyMenuFallback(path)` — reads legacy `drive_sequence` config key for backward compatibility.

**Connects to**: `MenuSystem.js` (primary consumer of all exports).

---

### `js/stylePreview.js`
Live preview helpers. All changes are CSS-only; nothing is written to disk.

**Exports:**
- `scheduleChartRecreation()` — debounced (120 ms) call to `window.activityMonitor.recreateCharts()`. Called when chart colors change in the menu to avoid recreating charts on every slider tick.
- `applyActivityVariables(config)` — writes activity monitor CSS variables from `config.ui.activity`.
- `applyChassisColors(enclosureKey, config)` — applies chassis color/stripe/gradient variables for a specific device.
- Several other `apply*` helpers one per major style section (chart typography, bay text styles, decoration sliders, grill settings).

**Connects to**: `js/utils.js` (imports `applyConfigMap`, `mixHex`, `getDecorationTextureFn`, `sliderToUnit`, `sliderToScale`), `js/styleVars.js` (imports `applyDeviceVariables` for full per-device re-apply), `MenuSystem.js` (consumer of all exports), `ActivityMonitor.js` (indirectly via `window.activityMonitor`).

---

### `js/menuBuilder.js`
Pure HTML string generators. No state reads or writes; all data is passed in as arguments.

**Exports:**
- `toSafeId(str)` — sanitises a string for use in HTML `id` attributes.
- `htmlEscape(str)` — escapes `& < > "` for safe HTML interpolation.
- `getDiskArraysMenuSignature(topology, hostname)` — returns a stable string representing the current topology shape, used by `MenuSystem.js` to decide if the Disk Arrays panel needs to be rebuilt.
- `buildGlobalStylePanel(config)` — returns full HTML for the Dashboard global style panel.
- `buildActivityMonitorPanel(config)` — returns full HTML for the Activity Monitor style panel.
- `buildDiskArraysPanel(topology, config, hostname)` — returns full HTML for the per-enclosure Disk Arrays panel, generating one section per detected chassis.
- Individual sub-builder helpers for sliders, color pickers, font dropdowns, and toggle rows.

**Connects to**: `MenuSystem.js` (all exports consumed there).

---

### `js/utils.js`
Shared primitives. No DOM access, no state.

**Exports:**
- `clampInt(value, fallback, min, max)` — safe integer clamp with NaN fallback.
- `mixHex(hex, amount)` — lightens (positive) or darkens (negative) a `#rrggbb` colour by linear mixing toward white or black.
- `grillSliderScale(v)` — maps a 0–100 slider value to a non-linear grill size scale factor.
- `buildGrillImageCss(shape, holeColor, grillPx)` — returns a CSS object (`{image, opacity, size}`) for a grill pattern SVG data URL. Supports `round`, `square`, `triangle`, `hexagonal`, `solid`, and `none` shapes.
- `getDecorationTextureFn()` — returns `window.DashboardDecorationTexture` if defined, else a no-op.
- `applyConfigMap(style, map)` — iterates a `{cssVar: value}` map and calls `setProperty`/`removeProperty` on a CSSStyleDeclaration.
- `applyStyleConfig(style, config, rules)` — higher-level helper that applies a list of `[cssVar, configPath]` rules by resolving nested config paths.
- `sliderToUnit(value, config)` — converts a slider integer to a `px` or `rem` string for CSS.
- `sliderToScale(value)` — converts a 0–100 slider value to a 0.5–2.0 scale factor.

**Connects to**: consumed by `js/styleVars.js`, `js/stylePreview.js`, `js/topology.js` (via `clampInt`), `js/menuBuilder.js`, `MenuSystem.js`.

---

## Shared JS Files (repo root)

### `geometry.js`
Defines two globals attached to `window`:
- `GEOMETRY_DEFAULTS` — reference chassis dimensions (bay width/height, margin, LED size) at 1× scale.
- `CHASSIS_BAY_PRESETS` — lookup table keyed by bay count (e.g. `8`, `16`, `24`) to default row/column suggestions.

**Connects to**: `js/topology.js` (imports both constants), `js/renderer.js` (imports via `js/topology.js`).

---

### `DecorationTexture.js`
Defines `window.DashboardDecorationTexture`. Generates a `<canvas>` data URL with deterministic pseudo-random decoration lines seeded by the three decoration slider values (level, density, intensity). The same seed always produces the same output so the texture does not change on every poll cycle.

**Connects to**: `js/styleVars.js` and `js/stylePreview.js` via `getDecorationTextureFn()` from `js/utils.js`.

---

### `ActivityMonitor.js`
Standalone module. Sets `window.activityMonitor` on load.

**Poll loop:**
1. `GET /pool-activity` — gets rolling read/write history arrays.
2. `GET /data` — gets pool states (FAULTED/DEGRADED).
3. Renders/updates Chart.js line charts for each pool.
4. Applies state overlays: FAULTED → replaces chart with red "FAULTED" box; DEGRADED → orange overlay banner.
5. Responds to `dashboardUpdate` events from `app.js` to reflow when the topology changes.

**Key method consumed externally**: `window.activityMonitor.recreateCharts()` — called by `js/stylePreview.js` after chart color changes in the menu.

**Connects to**: `app.js` (via `dashboardUpdate` events and `window.activityMonitor`), `js/stylePreview.js` (calls `recreateCharts`), backend `/pool-activity` and `/data` endpoints.

---

### `DiskInfo.js`
Legacy module. Defined `DiskInfoFormatter` in earlier versions. Retained to avoid breaking any external references. Active disk formatting is now in `js/topology.js`.

### `livereload.js`
Development helper only. Polls `GET /livereload-status` every 1.5 seconds and calls `location.reload()` if any watched file's `mtime` has changed since the last check. Has no effect in production (the endpoint remains available but is never called if this file is removed from the script list).

---

## Styling Files

### `style.css`
Core dashboard styles. Key sections:
- **Layout**: `.dashboard-canvas`, `.chassis-row`, `.chassis-card` flex layout and scaling.
- **Chassis body**: `.chassis-body` transparent background (allows decoration textures to show through bay grids).
- **Bay shells**: `.bay-shell`, `.bay-horizontal`, `.bay-vertical` — dimensions, borders, grill overlays.
- **LEDs**: `.status-led`, `.activity-led` and all status colour classes (`allocated-healthy`, `faulted`, `unallocated`, etc.).
- **Info panel**: `.info-panel`, `.info-panel-vertical` — size, rotation for vertical bays, compositor isolation for flicker prevention (`translateZ(0)`, `backface-visibility`, `contain: paint`).
- **Animations**: `@keyframes blink` for offline/spare-fault indicators.

### `ActivityMonitor.css`
Activity monitor card layout, chart container sizing, FAULTED/DEGRADED overlay positioning and colour.

### `Menu.css`
Top menu bar, dropdown panel positioning, control rows (sliders, colour pickers, dropdowns), save/revert/reset button states, and the unsaved-changes indicator badge.

### `Base.css`
Page-level reset, body background, font defaults, scrollbar styling, and shared `--css-variable` baseline values that other CSS files inherit.

---

## Configuration Files

### `config.json`
Single source of truth for all runtime settings. Auto-generated from `DEFAULT_CONFIG` in `py/config.py` if missing. Never checked into version control with user data in it (covered by `.gitignore`).

```
config.json
  network.port             → TCP port the server listens on
  fonts.*                  → CSS font family strings
  ui.environment.*         → page background, body text color
  ui.layout.*              → max-width, gap, top-gap
  ui.chassis.*             → chassis card colors, borders, shadow, gradient
  ui.bay.*                 → bay background, border colors
  ui.led_colors.*          → LED color hex values per state
  ui.activity.*            → activity monitor chassis/legend colors
  chart.*                  → Chart.js line colors, grid, typography
  devices.<pci-key>.*      → per-enclosure overrides (bay size, layout, grill, decoration)
```

### `style-config.json`
Smaller style-only config file served by `GET /style-config`. Used by the front-end before the full `/data` response arrives to apply visual settings without waiting for a topology scan.

---

## Data Flow: One Poll Cycle

```
1. app.js calls fetchDataWithRetry()
   → GET /data?t=<timestamp>
   → py/server.py reads GLOBAL_DATA (kept fresh by topology_scanner_thread)
   → Returns JSON: { hostname, topology: { "<pci-key>": { settings, disks[] } }, config }

2. app.js calls applyUiVariables(config, hostname)
   → js/styleVars.js writes CSS variables to :root
   → CSS variables cascade to all chassis, bay, LED, font styles

3. app.js calls renderDashboard(topology, config)
   → js/renderer.js iterates topology entries
     → For each chassis: js/topology.js builds a model string
     → Compare with previousModels Map
     → If different: replace chassis innerHTML, call applyDeviceVariables
     → If same: skip (no DOM write)

4. app.js dispatches 'dashboardUpdate' event
   → ActivityMonitor.js receives event, polls /pool-activity, updates charts
   → MenuSystem.js receives event, checks if Disk Arrays panel needs rebuild
```

---

## Data Flow: Menu Save Cycle

```
1. User changes a control in the menu
   → MenuSystem.js updates workingConfig path via configStore
   → MenuSystem.js calls the relevant stylePreview apply function
   → CSS variable updates instantly; no server call

2. User clicks SAVE
   → MenuSystem.js sends POST /save-config with workingConfig JSON body
   → py/server.py validates, writes config.json, invalidates CONFIG_CACHE
   → On success: configStore.setOriginalConfigSnapshot(); isDirty = false
   → next poll cycle: /data returns updated config; applyUiVariables re-runs

3. User clicks REVERT
   → configStore.setWorkingConfigFrom(originalConfig)
   → MenuSystem.js re-applies all CSS variables from original snapshot
   → No server call

4. User clicks RESET
   → MenuSystem.js sends POST /reset-config
   → py/server.py writes DEFAULT_CONFIG to config.json, returns new config
   → configStore.initConfig(newConfig); menu panels are rebuilt
```
