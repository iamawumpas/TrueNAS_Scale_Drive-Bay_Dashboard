# TrueNAS Scale Drive-Bay Dashboard
**version v21.0**


## Documentation / Wiki

I've moved detailed installation, file-overview, startup, and configuration notes into the repo `WIKI/` folder so they can be copied to the GitHub wiki or used as standalone docs:

- [Installation](WIKI/Installation.md)
- [File Overview](WIKI/FileOverview.md)
- [start_up.sh details](WIKI/StartUp.md)
- [Python scripts overview](WIKI/PythonScripts.md)
- [Manual configuration & references](WIKI/ManualConfiguration.md)

Also see: [CONFIG_GUIDE.md](CONFIG_GUIDE.md), [CUSTOMIZATION_GUIDE.md](CUSTOMIZATION_GUIDE.md), and [CHANGELOG.md](CHANGELOG.md) for canonical references.


A self-hosted dashboard that visualizes TrueNAS Scale drive layout, status, and activity in a chassis-style view.
![Dashboard](image.png)

---

## System Requirements

**Primary Target:** TrueNAS Scale (recommended for TrueNAS API integration)

**Also Runs On:** Any Linux distribution with ZFS support (Ubuntu, Debian, Proxmox, etc.)

**File System:** ZFS is **required**. This project does NOT support other file systems (ext4, btrfs, LVM, etc.).

**Minimum Requirements:**
1. **Linux OS** (Ubuntu 20.04+, Debian 11+, Proxmox 7+, or equivalent)
2. **ZFS** installed and configured with at least one pool
3. **Python 3.6+** (no external pip dependencies)
4. **HTTP port available** (default 8010, configurable in `config.json`)

**Optional:**
- **TrueNAS middleware (`midclt`)** — enables native API integration on TrueNAS Scale (graceful fallback to `zpool` parsing if unavailable)
- **SES/Enclosure support** — automatically detected from `/sys/class/enclosure` if hardware supports it

---

## Why?
* **No Chassis:** I don't have a dedicated disk storage chassis.
* **UI Gaps:** TrueNAS Scale (Community Edition) lacks a dashboard widget that visually shows drive status.
* **Laziness is a Virtue:** Tracing a specific drive in TrueNAS is a long and involved process. I wanted a shortcut.
* **Blinky Lights:** I like them. Simple as that.
* **Home Lab Life:** My lab is just that—a lab. There are wires everywhere and the system is cobbled together from old PCs and servers. I prefer playing with the tech over making it "perfect."

And then there's the whole $$$ thing. If I could afford a 45Drives Storinator or a secondhand disk storage chassis, I’d be using it—but I would still want the blinky lights. I am Gen X, after all.

---

## What Does It Do?
This script generates a virtual Drive Storage Chassis dashboard. It displays:

* **Physical Arrangement:** Shows drives as detected by the HBA and the specific breakout cables attached (since I don't have a backplane).
* **Identification:** Displays formatted Drive Capacity and the **last 3 digits of the drive serial number** (I label my physical disks this way for easy tracing).
* **Activity:** Real-time read/write activity via a blue "blinky" LED.
* **Status Indicators (Allocated Disks):**
    * **Green:** Drive is healthy and functioning normally in a pool
    * **Green/Gray [Blinking]:** Drive is allocated but marked OFFLINE by TrueNAS
    * **Orange:** Drive has READ/WRITE/CHECKSUM errors but still functioning
    * **White:** Drive is currently resilvering/repairing/replacing
    * **Red:** Drive is FAULTED, UNAVAIL, REMOVED, or in a FAULTED/SUSPENDED pool

* **Status Indicators (Unallocated/Spare Disks):**
    * **Purple:** Healthy spare drive ready for use
    * **Purple/Orange [Blinking]:** Spare drive with READ/WRITE/CHECKSUM errors
    * **Purple/Red [Blinking]:** Spare drive is FAULTED, UNAVAIL, or REMOVED

* **Pool Activity Monitor:**
    * **Normal:** Real-time read/write activity charts for each pool
    * **DEGRADED Pool:** Orange "DEGRADED" overlay on chart (pool still functioning)
    * **FAULTED/SUSPENDED Pool:** Red box with "FAULTED" text replaces chart (pool I/O suspended)

---

## What's New in v21.0?

* **🔌 Native TrueNAS Scale API Integration:** Direct access to ZFS metadata via `midclt` for faster, more accurate disk state detection
* **🚨 Intelligent Error Detection:** Automatically detects and displays READ, WRITE, and CHECKSUM errors on all disks
* **⚠️ API Change Monitoring:** Red warning banner and menu bar alert if TrueNAS API changes or becomes unavailable
* **📊 Pool State Visualization:** FAULTED pools show red box, DEGRADED pools show orange overlay on activity charts
* **💡 Blinking LED Animations:** Unallocated disks with errors or faults now properly blink purple/orange or purple/red
* **🔄 Automatic Fallback:** Seamlessly falls back to `zpool status` parsing if API is unavailable
* **🎯 Complete State Coverage:** Detects ONLINE, DEGRADED, FAULTED, UNAVAIL, REMOVED, OFFLINE, RESILVERING states

---

## Key Features
* **Live Configuration Menus:** Adjust chassis layout, bay appearance, fonts, colors, and chart options directly in the UI.
* **Instant Preview:** Most styling changes (including bay height) update live without a service restart.
* **Per-Device Overrides:** Device-specific settings stored in `config.json` under each PCI address.
* **Flexible Layout:** Configure rows and bays-per-row, with empty bay placeholders when the grid exceeds detected drives.
* **Activity Monitor:** Optional per-pool read/write charts with smooth updates and compact card layout.
* **Resilient Config:** Auto-generates `config.json` if missing and falls back to hardened defaults if malformed.

---

## Known Limitations

### Pool Dependency (TrueNAS Scale)
On TrueNAS Scale, the default installation places the dashboard on a data pool (`/mnt/[Pool_Name]/scripts/dashboard`). **If that pool goes offline, the dashboard service cannot run.** This is problematic since the dashboard's primary purpose is to monitor pool health.

**Workarounds:**
1. **Recommended:** Install the dashboard on the root filesystem instead (requires TrueNAS Scale custom configuration)
2. **For Non-TrueNAS Linux:** Install on a system directory like `/opt/zfs-dashboard` (independent of pool state)
3. **High Availability:** Ensure the pool has redundancy (mirrored vdevs, raidz) to minimize offline risk
4. **Docker Alternative:** Run the dashboard in a container from root filesystem for pool-independent operation

### File System Requirements
This dashboard **only works with ZFS**. It does NOT support ext4, btrfs, LVM, or other file systems.

---

## Installation

1.  **SSH into the TrueNAS Scale console.**
2.  **Create a directory on one of your Pools:**
    ```bash
    mkdir -p /mnt/[Pool_Name]/scripts/dashboard
    ```
3.  **Navigate to the folder:**
    ```bash
    cd /mnt/[Pool_Name]/scripts/dashboard
    ```
4.  **Upload Files:** Use WinSCP or your preferred file transfer tool, to copy all of the files in the dashboard folder from this repository, into this folder on your TrueNAS server.
5.  **Set Permissions:**
    ```bash
    chmod +x /mnt/[Pool_Name]/scripts/dashboard/service.py
    chmod +X /mnt[Pool_Name]/scripts/dashboard/start_up.sh
    ```
6.  **Run the Service Manually (for testing):**
    ```bash
    ./start_up.sh
    ```
    If successful you will see the following output
    ```
    Stopping any existing service...
    Clearing __pycache__ directories...
    (re)starting the service...
    ```
7.  **Verify the Service:**
    ```bash
    ps aux | grep service.py
    ```
    You should see two entries similat to below:
    ```
    root      366525  4.9  0.1 248916 19788 pts/0    Sl   17:59   0:45 python3 service.py
    root      369663  0.0  0.0   3880  1384 pts/0    S+   18:14   0:00 grep service.py
    ```
    
     The first is the running script; the second is your search command (`grep`). If you only see the `grep service.py` entry, the service failed to start.

8.  **Stop the Service (if needed):**
    ```bash
    pkill -9 -f service.py
    ```

9.  **Set up Automation:**
    To ensure the dashboard starts automatically, go to the TrueNAS Web UI:
    * Navigate to **System Settings > Advanced > Init/Shutdown Scripts**.
    * Click **Add**.
    * **Description:** `Disk Status Service`
    * **Type:** `Script`
    * **Script:** `python3 /mnt/[Pool_Name]/scripts/dashboard/start_up.sh`
    * **When:** `Post Init`
    * **Save.**

---

## What do the files do?
### `start_up.sh`
Stops the service on TrueNAS (if running), clears stale caches, and (re)launches the Python daemon.

### `service.py`
Main daemon that interrogates TrueNAS and your HBA to identify:
* Used ports
* Disk serial numbers
* Breakout slot positions (see **Logic**)
* Formatted disk capacity (not vdev capacity)
* Drive status and activity
* Pool names and drive-to-pool mapping

It also hosts the web dashboard on **port 8010** by default (configurable).

### `zfs_logic.py`
Helper logic for drive and pool discovery used by `service.py`.

### `app.js`
Client entry point that fetches `/data`, renders chassis and bays, and drives live updates.

### `MenuSystem.js`
Builds the configuration menus, handles input, previews changes, and saves to `config.json`.

### `Chassis.js`
Generates chassis markup and container layout for each device.

### `Bay.js`
Generates bay markup for each drive slot.

### `DiskInfo.js`
Formats disk metadata (capacity, pool, serial, index) for display.

### `LEDManager.js`
Maps disk states to LED classes for consistent status colors.

### `ActivityMonitor.js`
Fetches pool activity data and renders the read/write charts.

### `index.html`
Static HTML shell that loads the dashboard scripts and styles.

### `style.css`
Base styling for overall layout and global theme variables.

### `Base.css`
Common typography and shared UI styling.

### `Chassis.css`
Styling for chassis containers and layout framing.

### `Bay.css`
Styling for bays, including size, grill pattern, and labels.

### `LEDs.css`
LED indicator styles and animations.

### `Menu.css`
Menu layout and form control styling.

### `ActivityMonitor.css`
Styles for the activity monitor cards and charts.

### `livereload.js`
Optional dev helper for auto-refresh during local development.

### `config.json`
Primary configuration store, auto-generated on first run if missing.

### `config.json.backup`
Local backup copy of the configuration (optional).

### `CONFIG_GUIDE.md`
Detailed reference for configuration keys and examples.

### `CUSTOMIZATION_GUIDE.md`
Tips for theming, fonts, colors, and layout tweaks.

### `Developer_Notes.md`
Implementation notes and internal architecture notes.

### `CHANGELOG.md`
Version history and feature highlights.

### `LICENSE`
Project license.

### `image.png`
README screenshot (you will update this).

### `.gitignore`
Git ignore rules for generated and local-only files.

### `__pycache__/`
Python bytecode cache directory (generated at runtime).

---

## Logic
The logic now builds the layout dynamically from what TrueNAS reports:
* **Controller discovery:** Scans `/dev/disk/by-path` for PCI-based storage controllers and skips virtual/emulated controllers.
* **Capacity detection:**
  * If an enclosure/backplane is detected under `/sys/class/enclosure`, the slot count is used as the bay capacity.
  * If no backplane is found, it falls back to SAS phy counts or vendor tools (sas2ircu/sas3ircu/storcli) to estimate direct-attach capacity.
  * Capacity can be overridden in `config.json` per controller (ports, lanes, max_bays).
* **Bay numbering:** Each disk path is parsed for tokens like `phy`, `ata`, `sas`, `port`, `slot`, or `exp` followed by a number, which becomes the bay index.
* **Layout vs hardware:** Rows and bays-per-row are display settings. They do not change the detected bay count, only how the grid is drawn.

> **[NOTE]**
> Without a backplane, physical slot order is inferred from the by-path naming. If your cable order does not match the displayed order, swap SATA connectors or adjust layout settings.

---
## Configuration System

The dashboard is controlled by a central `config.json` file. This file dictates everything from the HBA hardware address to the specific hex codes for drive status LEDs.

### How it Works
- **On First Run**: If the script does not find `config.json` in its directory, it will automatically generate one with standard settings (16-bay single chassis, 8010 port, standard colors).
- **Live Updates**: You do not need to restart the service to change settings. When you save changes to `config.json`, the dashboard detects the file-change timestamp and updates the UI for all connected users within 5 seconds.
- **Resilience**: The service is designed to be "always-up." If the config file is accidentally deleted or becomes corrupted (e.g., a typo in the JSON syntax), the service will immediately switch to internal "Hardened Defaults" to ensure you don't lose sight of your storage health.

> For information on what can be configured, read [CONFIG_GUIDE.md](https://github.com/iamawumpas/TrueNAS-Scale-Drive-Bay-Assignment/blob/main/CONFIG_GUIDE.md)
---

## Future Plans
* **Responsive Chassis Width:** Allow dynamic chassis width adjustment to better fit different screen sizes and preferences.
* **Visual Reordering:** Drag-and-drop bay rearrangement to customize logical order independent of physical HBA port mapping.
* **Extended Metrics:** Detailed per-drive latency tracking, temperature monitoring via SMART data, and predictive health metrics.
* **Mobile Responsive Design:** Optimize dashboard layout for smaller screens and mobile devices.