# Python scripts overview

This project contains two primary Python components:

- `service.py` — main daemon and web server
  - Hosts a simple HTTP server (based on `http.server`) that serves the UI assets and several JSON endpoints used by the front-end:
    - `GET /data` — returns `hostname`, `topology` (detected controllers and disks), and `config` information used to render the UI.
    - `GET /style-config` — returns the `config.json` styling payload (fonts, colors, font sizes) used to set CSS variables.
    - `GET /pool-activity` — returns history arrays used by `ActivityMonitor.js` to draw per-pool read/write graphs.
    - `GET /livereload-status` — returns file modification times for development auto-reload checks.
    - `GET /trigger-restart` — triggers `start_up.sh` to restart the service and returns the new port.
    - `POST /save-config` — accepts a full `config.json` payload and saves it to disk.
  - Contains background threads that scan topology, monitor I/O activity, and collect pool activity history. If `config.json` is missing or invalid the service will regenerate defaults from `DEFAULT_CONFIG_JSON`.

- `zfs_logic.py` — ZFS helper
  - Provides `get_zfs_topology(uuid_to_dev_map)` which parses `zpool status` output to map disks (by UUID or name) to pool, index, and state (including resilvering). Used by `service.py` to build the topology mapping.

Notes:
- `service.py` also exposes a small POST endpoint to persist configuration changes. The front-end `MenuSystem.js` calls this when users click SAVE.
- The default port is read from `config.json` (network.port) and defaults to `8010` if missing.

For implementation details see: [service.py](../service.py) and [zfs_logic.py](../zfs_logic.py).
