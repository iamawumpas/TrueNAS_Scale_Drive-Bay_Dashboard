# TrueNAS Scale Drive Bay Assignment
A dashboard to show my disk array arrangement, status, and activity.

<img width="1919" height="566" alt="image" src="https://github.com/user-attachments/assets/a1a61e78-c26e-49db-8e7f-a661e7e7233d" />




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
* **Status Indicators:**
    * **Green:** Drive is connected and functioning normally.
    * **Orange:** Drive is connected, but TrueNAS is reporting errors.
    * **White:** Drive is connected and currently resilvering.
    * **Red:** Drive is connected but marked Offline by TrueNAS.
    * **Purple:** Drive is connected but is a spare or unallocated.

---

## Installation

1.  **SSH into the TrueNAS Scale console.**
2.  **Create a directory on one of your Pools:**
    ```bash
    mkdir -p /mnt/[Pool_Name]/scripts/disk_lights
    ```
3.  **Navigate to the folder:**
    ```bash
    cd /mnt/[Pool_Name]/scripts/disk_lights
    ```
4.  **Upload Files:** Use WinSCP or your preferred file transfer tool to copy `service.py` and `index.html` into this folder.
5.  **Set Permissions:**
    ```bash
    chmod +x /mnt/[Pool_Name]/scripts/disk_lights/service.py
    ```
6.  **Run the Service Manually (for testing):**
    ```bash
    nohup python3 service.py > /dev/null 2>&1 &
    ```
    If successful, you should see a PID response like: `[1] 3321474`

7.  **Verify the Service:**
    ```bash
    ps aux | grep service.py
    ```
    You should see two entries. The first is the running script; the second is your search command (`grep`). If you only see the `grep` entry, the service failed to start.

8.  **Stop the Service (if needed):**
    ```bash
    pkill -9 -f service.py
    ```

9.  **Set up Automation:**
    To ensure the dashboard starts automatically, go to the TrueNAS Web UI:
    * Navigate to **System Settings > Advanced > Init/Shutdown Scripts**.
    * Click **Add**.
    * **Description:** `Disk Light Service`
    * **Type:** `Script`
    * **Script:** `python3 /mnt/[Pool_Name]/scripts/disk_lights/service.py`
    * **When:** `Post Init`
    * **Save.**

---

## What do the files do?

### `service.py`
This is the daemon that interrogates TrueNAS and your HBA to identify:
* The number of used ports.
* Disk serial numbers.
* Slot numbers on breakout cables (see **Logic**).
* Formatted disk capacity (not vdev capacity).
* TrueNAS drive status and read/write activity.
* Pool names, and which drives are allocated to each pool and their order.

Limited customisation can now be made from within the service.py script in the --- CONFIGURATION SECTION ----.

This script also acts as a basic web server to host the dashboard. It uses **port 8010** by default (this can be changed within the script).

### `index.html`
Contains the HTML and embedded CSS needed to render the dashboard. Currently, this is a "read-only" view and is not interactive.

---

## Logic
The logic assumes a specific physical setup based on my hardware:
* The HBA has **4 ports**.
* Each port uses a breakout cable supporting **4 SATA drives**.

| Port | SATA Slots |
| :--- | :--- |
| **Port 1** | SATA 1-4 |
| **Port 2** | SATA 5-8 |
| **Port 3** | SATA 9-12 |
| **Port 4** | SATA 13-16 |

> [!NOTE]
> Since I don't use a backplane, the HBA cannot report the physical "slot" location. The dashboard assumes the drives are physically arranged in the order the cables are plugged in. To change the display order, simply swap the SATA connectors on the physical drives.

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
* **Dynamic Logic:** Detect the specific device TrueNAS reports to better design the chassis layout automatically.
