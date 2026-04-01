# File Overview

This page describes the current front-end and back-end file responsibilities.

## Front-end runtime

- `index.html`
  - Static shell that loads CSS and scripts in this order: `livereload.js` (dev helper), `ActivityMonitor.js`, `MenuSystem.js`, then `app.js`.

- `app.js`
  - Main dashboard renderer and polling loop for `/data`.
  - Builds enclosure models, bay markup, and disk info display.
  - Applies global UI/chart CSS variables from `config.json`.
  - Applies per-enclosure overrides from `config.devices.<key>`.
  - Dispatches dashboard update events consumed by menu and activity monitor.

- `MenuSystem.js`
  - Full configuration menu runtime.
  - Handles SAVE/REVERT/RESET flows with `/save-config` and `/reset-config`.
  - Provides live preview by writing `window.__previewConfig__` and applying preview CSS overrides.
  - Builds per-enclosure Disk Arrays controls (chassis, bay orientation/order, grill, and per-bay text styling).

- `ActivityMonitor.js`
  - Polls `/pool-activity` and `/data` to render per-pool read/write charts (Chart.js).
  - Applies pool-state overlays (FAULTED/DEGRADED) and responsive reflow.
  - Reads chart dimensions/colors from CSS variables populated from config.

- `DiskInfo.js`
  - Legacy helper module retained in the repository.
  - Primary runtime disk formatting is currently handled inside `app.js`.

- `geometry.js`
  - Shared geometry constants and chassis-bay presets used by renderer sizing logic.

- `ui/utils.js`
  - Utility helpers for CSS-variable application and small UI helpers.

## Styling files

- `style.css`
  - Core dashboard/chassis/bay styles.
  - Includes bay orientation variants and single-enclosure bay-content scaling behavior.

- `ActivityMonitor.css`
  - Activity monitor card/chassis/chart layout and state overlay visuals.

- `Menu.css`
  - Top menu, dropdown panels, controls, and modal styles.

- `Base.css`
  - Shared baseline visual styles and common defaults.

## Back-end runtime

- `service.py`
  - HTTP server, topology scan orchestration, config persistence, and endpoint routing.

- `zfs_logic.py`
  - ZFS mapping/state layer (TrueNAS API primary, `zpool` parsing fallback).

- `livereload.js`
  - Development-only helper that polls `/livereload-status` and refreshes browser on file-change snapshots.

For schema and customization details see [CONFIG_GUIDE.md](../CONFIG_GUIDE.md) and [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md).
