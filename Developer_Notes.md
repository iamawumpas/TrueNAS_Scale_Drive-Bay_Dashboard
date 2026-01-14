# Technical Documentation: Drive Bay Dashboard

This document explains the interaction between the Python backend and the HTML/CSS frontend for developers looking to modify or extend the project.

## 1. Backend Architecture (`service.py`)

The backend is a multi-threaded Python script that functions as both a system monitor and a specialized web server.

### Data Collection Logic
* **`get_io_snapshot()`**: Reads `/proc/diskstats` to track read/write sectors for every block device.
* **`background_monitor()`**: Runs in a dedicated daemon thread. It compares snapshots every 100ms. If a delta is detected, it triggers an activity state with a "cooldown" period to ensure the LED blink is visible to the human eye.
* **`update_heavy_stats()`**: Polls system-heavy information every few seconds to avoid overhead. It correlates `/dev/disk/by-path` (physical HBA ports) with `zpool status` and `lsblk` to identify drive health and serial numbers.

### The API Endpoint
The script overrides `do_GET` to create a JSON endpoint at `/data`. It merges the physical topology, ZFS health, and real-time I/O activity into a single payload for the frontend.

## 2. Frontend Logic (`index.html`)

### The Update Loop
The dashboard uses an `async function update()` triggered by `setInterval(update, 100)`.
1. It fetches the latest JSON from the Python backend.
2. It dynamically maps the topology data to the "Caddy" DOM elements.
3. It toggles CSS classes (e.g., `.blue`, `.orange`, `.status-empty`) based on the disk state.

### CSS Styling & Visual Effects
* **Chassis & Caddy:** Uses `linear-gradients` and `repeating-linear-gradients` to create a brushed metal texture and a perforated "grill" background.
* **Industrial Stencil Effect:** Uses an SVG filter (`#heavy-scratch`) combined with `-webkit-mask-image` to give text a weathered, stenciled look.
* **LED Animations:**
    * `.blue`: Fast `pulse` animation for activity.
    * `.white`: `resilver-glow` animation using filter brightness shifts.
    * `.red`: `fault-pulse` for critical attention.

## 3. Data Interaction Map

| Component | Responsibility | Source/Mechanism |
| :--- | :--- | :--- |
| **Python Threading** | Concurrent I/O and Health monitoring | `threading.Thread` |
| **I/O Detection** | Delta tracking for "blinky" lights | `/proc/diskstats` |
| **ZFS Integration** | Determining LED color states | `zpool status` |
| **JS Fetch** | Real-time DOM manipulation | `window.fetch` |

## 4. Customization Guide
* **Modify Port:** Change the `PORT` variable in `service.py` (default 8010).
* **Adjust Layout:** Update `EXPECTED_LAYOUT` in `service.py` to match your HBA's PCI address and port count.
* **Visuals:** CSS styles for colors and animations are located within the `<style>` block in `index.html`.
