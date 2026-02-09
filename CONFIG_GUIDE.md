````markdown
# config.json — Reference (synchronized with the running service)

This document describes the authoritative `config.json` shape used by `service.py`. When in doubt, consult the repo `config.json` file — the service will regenerate defaults from its internal `DEFAULT_CONFIG_JSON` if the file is missing or invalid.

Top-level sections and purpose:

- `network` (object)
  - `port` (number): TCP port the HTTP server listens on. Default: `8010`.

- `hardware` (object)
  - `controller_overrides` (array): optional manual overrides for controllers. Each override can include `pci_address`, `ports`, and `lanes_per_port`.

- `ui` (object)
  - Granular UI controls. This block is applied live by the front-end and contains nested objects such as `server_name`, `pci_address`, `legend`, `bay_id`, `disk_serial`, `disk_size`, `disk_pool`, `disk_index`, plus `chassis`, `bay`, `led_colors`, and `environment`.
  - Per-element objects typically support: `color`, `font`, `size`, and `style` (array of tokens like `"bold"`, `"italic"`, `"allcaps"`).

- `chart` (object)
  - Controls the Activity Monitor colors and dimensions:
    - `colors`: `readColor`, `writeColor`, `readGradientTop`, `readGradientBottom`, `writeGradientTop`, `writeGradientBottom`, `readDotColor`, `writeDotColor`.
    - `dimensions`: sizing and visual parameters (e.g., `chartHeight`, `cardWidth`, `lineWidth`).

- `fonts`, `fontSizes`, `fontStyles`, `colors` (objects)
  - Legacy/global style buckets that the front-end may use as fallbacks. `ui` subkeys and `devices` overrides take precedence when present.

- `devices` (object)
  - Device-specific overrides keyed by PCI address (e.g. `0000:00:10.0`). Each device entry can contain `chassis`, `bay`, and `environment` objects to override global UI for that particular controller.

Editing notes and runtime behavior:

- Most changes under `ui`, `fonts`, `fontSizes`, `fontStyles`, and `colors` are applied live by the browser; no service restart is required.
- Changes to `network.port` require restarting the service; the front-end exposes a `/trigger-restart` endpoint that invokes `start_up.sh`.
- If the `config.json` is invalid JSON the service logs an error and regenerates defaults from its built-in `DEFAULT_CONFIG_JSON`. Always back up before large edits.

Minimal example:
```json
{
  "network": { "port": 8010 },
  "ui": {
    "server_name": { "color": "#ffffff", "font": "Calibri", "size": "2.8rem", "style": ["bold"] },
    "led_colors": { "allocated_healthy": "#00ff00", "activity": "#008cff" }
  },
  "devices": {
    "0000:00:10.0": { "chassis": { "rows": 1, "bays_per_row": 16 }, "bay": { "height": "44" } }
  }
}
```

Where to look for authoritative references:

- The live `config.json` in the repository root is canonical.
- `service.py` contains `DEFAULT_CONFIG_JSON` used to rebuild the file when missing.
- `CUSTOMIZATION_GUIDE.md` contains friendly examples for themes and accessibility.

Troubleshooting:

- If the UI is not reflecting changes:
  - Clear browser cache or hard reload (Ctrl+F5).
  - Check `service.py` stdout for parse errors when saving via the UI.
  - Confirm you edited valid JSON (use an editor with JSON validation).

````
