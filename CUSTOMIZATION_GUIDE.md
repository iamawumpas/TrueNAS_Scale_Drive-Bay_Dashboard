# Dashboard Customization Guide

## Overview

The TrueNAS Scale Drive Bay Assignment Dashboard is now fully customizable through the `config.json` file. All font, font size, font style, and color settings have been moved from hardcoded CSS/JS values into a centralized configuration file.

## File Structure

### Configuration File
- **`config.json`** - Main configuration file for all styling and theming

### Code Files
- **`service.py`** - Python backend that serves the dashboard and loads config.json
- **`app.js`** - JavaScript that applies config.json settings to the dashboard
- **`Base.css`** - CSS variables (dynamically updated from config.json)
- **`Bay.css`** - Drive bay styling (uses CSS variables)
- **`Chassis.css`** - Chassis enclosure styling (uses CSS variables)
- **`LEDs.css`** - LED indicators styling (uses CSS variables)

## How to Customize

### 1. Edit config.json

Simply open `config.json` in any text editor and modify the values:

```json
{
  "fonts": {
    "default": "Calibri, Candara, Segoe UI, Optima, Arial, sans-serif",
    "monospace": "Courier New, monospace"
  },
  "fontSizes": {
    "legendTitle": "1.25rem",
    "legend": "0.75rem",
    "serverName": "2.8rem",
    "pciAddress": "1.1rem",
    "bayId": "0.8vw",
    "diskSerial": "1.1vw",
    "diskSize": "1.1vw",
    "diskPool": "1.1vw",
    "diskIndex": "1.1vw"
  },
  "fontStyles": {
    "bold": "bold",
    "italic": "italic",
    "underline": "underline",
    "smallCaps": "small-caps",
    "allCaps": "uppercase"
  },
  "colors": {
    "serverName": "#ffffff",
    "pciAddress": "#666666",
    "legend": "#cccccc",
    "legendTitle": "rgba(255, 255, 255, 0.9)",
    "bayId": "#ffaa00",
    "diskSerial": "#ffff00",
    "diskSize": "#ff00ff",
    "diskPool": "#ffffff",
    "diskIndex": "#00ffff",
    "chassisBgBase": "#1a1a1a",
    "chassisBorder": "#333333",
    "chassisShadow": "rgba(0,0,0,0.8)",
    "bayBgBase": "#121212",
    "bayBorder": "#333333",
    "bayTopBorder": "#444444",
    "ledAllocatedHealthy": "#00ff00",
    "ledAllocatedOffline": "#555555",
    "ledError": "#ffaa00",
    "ledFaulted": "#ff0000",
    "ledResilvering": "#ffffff",
    "ledUnallocated": "#a000ff",
    "ledUnallocError": "#ffaa00",
    "ledUnallocFault": "#ff0000",
    "ledActivity": "#008cff"
  }
}
```

### 2. Save the File

After making changes, save `config.json`. The dashboard will automatically reload with your new settings on the next refresh.

### 3. Rebuild config.json (if needed)

If you accidentally corrupt or delete `config.json`, the service will automatically regenerate it with default values from the hardcoded defaults in `service.py`.

## Customization Options

### Fonts

**`fonts.default`** - Default font family used throughout the dashboard
- Used by: Server name, legend, bay labels, disk info
- Example: `"Arial, Helvetica, sans-serif"`

**`fonts.monospace`** - Monospace font for technical information
- Used by: PCI addresses
- Example: `"Consolas, Monaco, monospace"`

### Font Sizes

All font sizes can be specified in:
- `rem` - Relative to root font size (responsive)
- `vw` - Relative to viewport width (scales with screen)
- `px` - Fixed pixel size (not responsive)

**Key Elements:**
- `serverName` - Main hostname display (default: `2.8rem`)
- `pciAddress` - PCI address text (default: `1.1rem`)
- `legendTitle` - Legend box title (default: `1.25rem`)
- `legend` - Legend items (default: `0.75rem`)
- `bayId` - Bay number labels (default: `0.8vw`)
- `diskSerial` - Disk serial numbers (default: `1.1vw`)
- `diskSize` - Disk capacity (default: `1.1vw`)
- `diskPool` - Pool name (default: `1.1vw`)
- `diskIndex` - Pool index (default: `1.1vw`)

### Colors

All colors can be specified as:
- Hex codes: `#ffffff`, `#ff0000`
- RGB/RGBA: `rgb(255, 255, 255)`, `rgba(255, 255, 255, 0.9)`

**Text Colors:**
- `serverName` - Hostname text color
- `pciAddress` - PCI address text color
- `legend` - Legend item text color
- `legendTitle` - Legend title color
- `bayId` - Bay label color
- `diskSerial` - Serial number color
- `diskSize` - Disk size color
- `diskPool` - Pool name color
- `diskIndex` - Pool index color

**Background & Border Colors:**
- `chassisBgBase` - Chassis background color
- `chassisBorder` - Chassis border color
- `chassisShadow` - Chassis shadow color
- `bayBgBase` - Drive bay background color
- `bayBorder` - Drive bay border color
- `bayTopBorder` - Drive bay top border color

**LED Status Colors:**
- `ledAllocatedHealthy` - Healthy allocated drive (default: green)
- `ledAllocatedOffline` - Offline allocated drive (default: grey)
- `ledError` - Drive with errors (default: orange)
- `ledFaulted` - Faulted drive (default: red)
- `ledResilvering` - Resilvering drive (default: white)
- `ledUnallocated` - Unallocated drive (default: purple)
- `ledUnallocError` - Unallocated drive with errors (default: orange)
- `ledUnallocFault` - Unallocated faulted drive (default: red)
- `ledActivity` - Drive activity indicator (default: blue)

## Example Customizations

### Dark Blue Theme
```json
{
  "colors": {
    "chassisBgBase": "#0a1628",
    "chassisBorder": "#1e3a5f",
    "bayBgBase": "#0d1b2a",
    "bayBorder": "#1e3a5f",
    "serverName": "#e0f4ff",
    "diskSerial": "#00d9ff",
    "diskSize": "#a855f7",
    "diskPool": "#ffffff"
  }
}
```

### High Contrast Theme
```json
{
  "colors": {
    "serverName": "#ffffff",
    "diskSerial": "#ffff00",
    "diskSize": "#00ffff",
    "diskPool": "#00ff00",
    "chassisBgBase": "#000000",
    "bayBgBase": "#111111"
  }
}
```

### Larger Text for Accessibility
```json
{
  "fontSizes": {
    "serverName": "3.5rem",
    "bayId": "1.2vw",
    "diskSerial": "1.5vw",
    "diskSize": "1.5vw",
    "diskPool": "1.5vw"
  }
}
```

## Technical Details

### How It Works

1. **Backend (service.py)**
   - Contains hardcoded `DEFAULT_CONFIG_JSON` for rebuilding
   - Loads `config.json` on startup and serves it via `/style-config` endpoint
   - Automatically merges new defaults if config structure changes

2. **Frontend (app.js)**
   - Fetches `/style-config` on every update cycle
   - Applies all settings to CSS variables dynamically
   - Changes take effect immediately without page reload

3. **CSS Files**
   - Use CSS variables (e.g., `var(--server-name-color)`)
   - Variables are set dynamically by JavaScript from config.json
   - Fallback defaults in Base.css ensure functionality if config fails

### Configuration Persistence

- Changes to `config.json` persist across server restarts
- If `config.json` is deleted, it will be recreated with defaults
- Modular design keeps individual JS and CSS files maintainable
- No need to edit code files to customize appearance

## Troubleshooting

### Dashboard not reflecting changes
1. Clear browser cache (Ctrl+F5)
2. Check browser console for errors
3. Verify `config.json` is valid JSON (use a JSON validator)

### config.json won't save
1. Check file permissions
2. Ensure JSON syntax is valid (no trailing commas, proper quotes)

### Reset to defaults
Delete `config.json` and restart the service. The file will be automatically regenerated with default values.

## Support

For issues or questions, refer to the main README.md or project documentation.
