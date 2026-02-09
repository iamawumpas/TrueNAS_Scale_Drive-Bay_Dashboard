# File Overview — JS/CSS pairs

This page describes the main front-end file pairs and what they do.

- `app.js` + `style.css` / `Base.css`:
  - `app.js` is the client entry point. It fetches `/data` and `/style-config`, applies the styling from `config.json` as CSS variables, and orchestrates UI updates.
  - `style.css` and `Base.css` contain global layout and CSS variable fallbacks used by the app.

- `MenuSystem.js` + `Menu.css`:
  - `MenuSystem.js` builds the dynamic configuration menus, handles SAVE/REVERT, and writes updates to `/save-config`.
  - `Menu.css` styles the menu UI and controls.

- `Chassis.js` + `Chassis.css`:
  - `Chassis.js` generates the markup/container layout for each detected controller/chassis.
  - `Chassis.css` defines chassis framing, spacing, and visual effects.

- `Bay.js` + `Bay.css`:
  - `Bay.js` renders an individual drive bay (labels, serial, pool, LED container).
  - `Bay.css` contains bay-specific styles (grill patterns, labels, responsiveness).

- `DiskInfo.js` + (shared CSS):
  - `DiskInfo.js` formats disk metadata (capacity, serial, pool name) for display inside bays. Uses shared CSS variables.

- `LEDManager.js` + `LEDs.css`:
  - `LEDManager.js` maps drive state to LED CSS classes and blink/animation behavior.
  - `LEDs.css` contains the LED colors and animations.

- `ActivityMonitor.js` + `ActivityMonitor.css`:
  - `ActivityMonitor.js` fetches `/pool-activity` and renders per-pool read/write charts (Chart.js).
  - `ActivityMonitor.css` styles the activity cards and charts.

- `index.html`:
  - Static HTML shell that loads the scripts and styles.

- `livereload.js`:
  - Development helper used for auto-refresh during local editing.

For more implementation and customization details see [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md) and [CONFIG_GUIDE.md](../CONFIG_GUIDE.md).
