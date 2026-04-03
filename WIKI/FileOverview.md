# File Overview

This page describes the current front-end and back-end file responsibilities as of **v25.0**.

> For a detailed per-file code map with inter-file connection diagrams see [How_it_works.md](../How_it_works.md).

---

## Startup entry points

- `start_up.sh`
  - Shell script that kills any running `service.py` instance, clears Python bytecode caches, and relaunches the daemon with `nohup python3 service.py`. Also called by the front-end restart trigger.

- `service.py`
  - Thin Python entry point. Imports background threads and the HTTP handler from `py/server.py`, starts them, and opens the TCP server. This is the only file `start_up.sh` launches.

---

## Backend modules (`py/`)

- `py/server.py`
  - HTTP request handler class (`FastHandler`) and three background threads:
    - `io_monitor_thread` — high-frequency `/proc/diskstats` sampler that sets the per-device activity flag.
    - `topology_scanner_thread` — periodic hardware scan that updates `GLOBAL_DATA["topology"]`.
    - `pool_activity_monitor_thread` — samples pool I/O counters and appends to the rolling history used by the activity charts.
  - Hosts all JSON endpoints: `GET /data`, `GET /pool-activity`, `GET /style-config`, `GET /livereload-status`, `GET /trigger-restart`, `GET /ircu-debug`, `POST /save-config`, `POST /reset-config`.

- `py/topology.py`
  - Hardware discovery: PCI controller scanning, enclosure slot detection via `/sys/class/enclosure`, SAS phy counting, sas2ircu/sas3ircu/storcli adapter query, `/dev/disk/by-path` parsing, and disk-to-bay-slot index resolution.

- `py/config.py`
  - Config persistence: reads and writes `config.json`, generates `DEFAULT_CONFIG` and `DEFAULT_CONFIG_JSON` defaults, and serves the style-config payload.

- `py/__init__.py`
  - Empty package marker that allows `service.py` to import from `py.*` as a package.

- `zfs_logic.py`
  - ZFS mapping and state layer. Uses TrueNAS `midclt call pool.query` as the primary source and falls back to `zpool status -v -p` parsing. Returns `(zfs_map, pool_states)` covering all disk states (ONLINE, DEGRADED, FAULTED, UNAVAIL, REMOVED, OFFLINE, RESILVERING) and per-disk error counts (READ/WRITE/CHECKSUM).

---

## Front-end runtime

- `index.html`
  - Static shell that loads CSS files and scripts. `MenuSystem.js` is loaded as `type="module"`. Script order: `livereload.js`, `ActivityMonitor.js`, `DecorationTexture.js`, `geometry.js`, `DiskInfo.js`, `MenuSystem.js` (module), `app.js`.

- `app.js`
  - Main orchestrator and polling loop. Imports from `js/data.js`, `js/renderer.js`, and `js/styleVars.js`. Calls `fetchDataWithRetry`, applies UI CSS variables, delegates chassis+bay rendering, and manages Activity Monitor lifecycle events.

- `MenuSystem.js`
  - Menu orchestrator loaded as an ES module. Imports config state from `js/configStore.js`, live preview from `js/stylePreview.js`, and panel markup from `js/menuBuilder.js`. Wires up all menu controls, SAVE/REVERT/RESET flows, and dispatches config change events.

- `ActivityMonitor.js`
  - Polls `/pool-activity` and `/data`. Renders per-pool read/write charts using Chart.js. Applies FAULTED (red box) and DEGRADED (orange overlay) pool state visuals. Reads chart dimensions and colors from CSS variables.

---

## Frontend modules (`js/`)

- `js/data.js`
  - Fetch layer. Timeout-wrapped `fetch` call to `/data`, retry logic with configurable back-off delays, last-good-payload caching with TTL, and topology guard helpers (`hasUsableTopology`, `getTopologyEntries`).

- `js/renderer.js`
  - HTML markup builders and DOM render loop. Builds full enclosure and bay HTML strings, then diffs against a per-chassis model cache so only changed bays are replaced in the DOM. Also computes dashboard scene scale.

- `js/topology.js`
  - Grid resolution (rows × columns from config), bay fill ordering (row-major LTR or column-major TTB), disk info text formatting, status-to-CSS-class mapping, and temperature severity classification.

- `js/styleVars.js`
  - CSS custom property injector. Reads `config.ui` and `config.chart` and writes values to `document.documentElement.style`. Also applies per-device decoration, grill pattern, and chassis color overrides.

- `js/configStore.js`
  - In-memory config state manager. Holds the original snapshot and working copy of `config.json`. Provides `deepClone`, path-based `getNestedValue`/`setNestedValue`, dirty flag, and menu control value normalization.

- `js/stylePreview.js`
  - Live preview helpers used while the menu is open. Applies activity monitor, chart typography, chassis color, and bay decoration changes directly to CSS variables without writing to disk. Debounces Chart.js recreation.

- `js/menuBuilder.js`
  - Pure HTML string builders for every menu panel: global style controls, Activity Monitor settings, and per-enclosure Disk Arrays controls (orientation, grill, bay text styles).

- `js/utils.js`
  - Shared primitives: `clampInt`, `mixHex`, `applyConfigMap`, `applyStyleConfig`, grill SVG generators, decoration texture helpers, `sliderToUnit`, `sliderToScale`.

---

## Shared JS files (root)

- `geometry.js`
  - Chassis bay geometry presets (`CHASSIS_BAY_PRESETS`) and reference scene dimensions (`GEOMETRY_DEFAULTS`). Consumed by `js/topology.js` and `js/renderer.js`.

- `DecorationTexture.js`
  - Deterministic seeded decoration texture generator (`DashboardDecorationTexture`). Shared between chassis rendering and menu live preview so identical slider settings always produce the same texture.

- `DiskInfo.js`
  - Legacy helper retained for compatibility. Active disk formatting is handled by `js/topology.js`.

- `livereload.js`
  - Dev-only. Polls `/livereload-status` and calls `location.reload()` when file timestamps change.

---

## Styling files

- `style.css` — Core chassis, bay, LED, and layout styles including bay orientation variants.
- `ActivityMonitor.css` — Activity monitor card, chart, and state overlay visuals.
- `Menu.css` — Top menu bar, dropdown panels, controls, and modal styles.
- `Base.css` — Shared baseline visual styles and common defaults.

---

## Configuration and documentation files

- `config.json` — Primary runtime config. Auto-generated with defaults if missing. Edited via the UI or manually.
- `style-config.json` — Style-only config payload served by the `/style-config` endpoint.
- `CONFIG_GUIDE.md` — Canonical reference for all `config.json` keys.
- `CUSTOMIZATION_GUIDE.md` — Theming, fonts, colors, and layout examples.
- `How_it_works.md` — Detailed per-file code map with inter-file connection descriptions.
- `Developer_Notes.md` — Architecture and implementation notes.
- `CHANGELOG.md` — Version history.

