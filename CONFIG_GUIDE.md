# User Guide: config.json

## Default Settings
The system initializes with the following baseline:
* **Port**: 8010
* **Layout**: 1 Chassis, 16 Bays (Horizontal layout).
* **Hardware**: Targeted at HBA PCI Address `0000:00:10.0`.
* **Colors**: High-contrast dark theme with Green (Online), Orange (Error), and Blue (Activity) LEDs.

## Modifying Settings
1. Open `config.json` in any text editor (VS Code is recommended).
2. **Layout Changes**: Adjust `bay_height_vh` or `chassis_width_pct` to fit your specific monitor or tablet screen.
3. **Color Changes**: Update the Hex codes in the `"colors"` block to match your preferred aesthetic (e.g., changing `led_online` to `#00ffff` for a cyan look).
4. Save the file. The dashboard will refresh automatically.

## Handling Errors & Corruption
If you see the hostname in the dashboard **pulsing slowly** with the message `config file error :: reverting to default settings`, the system has entered Fail-safe mode.

### Common Causes:
1. **JSON Syntax Error**: You may have missed a comma `,` or a closing brace `}` in the config file.
2. **Missing File**: The `config.json` was moved or deleted.
3. **Empty File**: The file exists but contains no data.

### How to Fix:
- **If you made a typo**: Check your JSON syntax. You can use an online "JSON Validator" to find the missing comma or bracket. Once fixed and saved, the error message will disappear instantly.
- **If you want to reset**: Simply delete `config.json` and restart `service.py`. The service will generate a fresh, perfectly formatted default file for you to start over with.
- **Check the Terminal**: The `service.py` console will print a specific error message (e.g., `Expecting ',' delimiter`) to help you find the exact line causing the issue.

### Default settings in config.json
```json
{
    "network": {
        "port": 8010
    },
    "layout": {
        "chassis_count": 1,
        "bays_per_chassis": 16,
        "rows_per_chassis": 1,
        "chassis_width_pct": 100,
        "bay_height_vh": 48,
        "bay_width_min_px": 40
    },
    "hardware": {
        "hba_pci_address": "0000:00:10.0",
        "hba_name": "Main HBA Storage"
    },
    "colors": {
        "page_background": "#050505",
        "chassis_background": "#1a1a1a",
        "bay_background": "#121212",
        "text_serial": "#ffff00",
        "text_capacity": "#ff00ff",
        "text_pool": "#ffffff",
        "led_online": "#00ff00",
        "led_resilver": "#ffffff",
        "led_error": "#ffaa00",
        "led_offline": "#ff0000",
        "led_unused": "#8000ff",
        "led_activity": "#008cff"
    },
    "zfs_settings": {
        "show_index": true,
        "pool_separator": " - ",
        "unallocated_label": " "
    }
}
