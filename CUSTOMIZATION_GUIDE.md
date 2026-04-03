# Dashboard Customization Guide

This guide is current for the **menu-driven configuration workflow**.

## Recommended workflow (menu-first)

Use the in-app top menu for nearly all customization:

1. Open the dashboard in your browser.
2. Use menu panels to adjust dashboard, activity monitor, and per-enclosure disk array styling.
3. Observe live preview changes immediately.
4. Click **SAVE** to persist changes to `config.json` via `POST /save-config`.
5. Use **REVERT** to discard unsaved edits or **RESET ALL** to regenerate defaults via `POST /reset-config`.

Most style changes do not require a service restart.

## What the menu controls write

Menu edits are persisted into these `config.json` sections:

- `ui`: global dashboard/chassis/bay/menu/legend/activity styling and typography.
- `chart`: activity monitor chart colors, dimensions, and typography.
- `devices.<enclosure-key>`: per-enclosure overrides (chassis color/decoration, bay orientation/order/grill, and per-bay text style).

For the authoritative full schema, use `CONFIG_GUIDE.md`.

## When to edit config.json manually

Manual edits are still useful for:

- Bulk updates across many devices.
- Search/replace operations for repeated style values.
- Recovery or migration tasks.
- Network port changes when preparing scripted deployments.

After manual edits:

- Refresh the browser for style updates.
- If you changed `network.port`, run `start_up.sh` or use `/trigger-restart`.

## Practical customization examples

### High readability theme

```json
{
  "ui": {
    "server_name": { "color": "#ffffff", "size": "3.0rem", "style": ["bold"] },
    "disk_serial": { "color": "#ffff66", "size": "1.2rem" },
    "disk_size": { "color": "#ff99ff", "size": "1.1rem" }
  },
  "chart": {
    "colors": {
      "readColor": "#00d9ff",
      "writeColor": "#ffb347"
    }
  }
}
```

### Per-enclosure bay layout override

```json
{
  "devices": {
    "0000:00:10.0": {
      "bay": {
        "layout": "horizontal",
        "fill_order": "row_major_ltr",
        "height": "44"
      }
    }
  }
}
```

### Decoration and grill tuning

```json
{
  "devices": {
    "0000:00:10.0": {
      "chassis": {
        "decoration_level": 35,
        "decoration_density": 45,
        "decoration_intensity": 30
      },
      "bay": {
        "grill_shape": "hexagonal",
        "grill_size": 62
      }
    }
  }
}
```

## Runtime behavior and resilience

- The server reads and serves config from `config.json`.
- If `config.json` is missing or invalid JSON, defaults are regenerated automatically.
- The UI applies config through CSS variables and modular render helpers.

## Troubleshooting

### Changes do not appear

1. Hard refresh the browser (Ctrl+F5).
2. Confirm you clicked **SAVE** in the menu.
3. Validate `config.json` syntax if edited manually.

### Bad config after manual edits

1. Restore from backup if available.
2. Or delete `config.json` and restart `service.py` to regenerate defaults.

## Related documents

- `CONFIG_GUIDE.md` — authoritative key-by-key schema reference.
- `WIKI/ManualConfiguration.md` — manual editing and restart notes.
- `How_it_works.md` — file-level architecture and data flow.
