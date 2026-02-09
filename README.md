# TrueNAS Scale Drive Bay Assignment
**version 19.3**


A dashboard to show my disk array arrangement, status, and activity.
![Disk Chassis](image-2.png)


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
    * **Green:** Drive is connected, and TrueNAS reports it is functioning normally.
    * **Green [Blinking]** Drive is connected but TrueNAS is reporting *OFFLINE*
    * **Orange:** Drive is connected, but TrueNAS is reporting error(s).
    * **Silver:** Drive is connected and currently resilvering.
    * **Red:** Drive is connected, but marked Offline by TrueNAS.
    * **Purple:** Drive is connected but is a spare or unallocated.
    * **Purple/Orange [Blinking]** Drive is connected and unallocated, but TrueNAS reports an error.
    * **Purple/Red [Blinking]** Drive is conenced and unallocated, but TrueNAS reports faulted.

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
4.  **Upload Files:** Use WinSCP or your preferred file transfer tool to copy all of the files in the disk_lights folder from this repository, into this folder.
5.  **Set Permissions:**
    ```bash
    chmod +x /mnt/[Pool_Name]/scripts/disk_lights/service.py
    chmod +X /mnt[Pool_Name]/scripts/disk_lights/start_up.sh
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
    * **Script:** `python3 /mnt/[Pool_Name]/scripts/disk_lights/start_up.sh`
    * **When:** `Post Init`
    * **Save.**

---

## What do the files do?
### `start_up.sh`
The startup script for TrueNAS to use at initialisation. Ensures the script directory is parsed to the various python and javascript files. 


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

> **[NOTE]**
> Since I don't currently have a backplane, the HBA cannot report the physical "slot" location, but it can identify which cable a drive is connected to (mine are numbered 1, 2, 3, 4,). The dashboard assumes the drives are physically arranged in the order the cables are plugged in. To change the display order, simply swap the SATA connectors on the physical drives.

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
* **Become Fully customisable.**
  * adjust chassis colour scheme .
  * adjust status LED colours, activity LED colours.
  * adjust the dimensions of the bays.
  * adjust the number of rows of bays per chassis.
  * adjust chassis width.
  * adjust drive bay colour scheme.
  * adjust drive bay information colours.
  * which PCI devices are displayed.
  * drag and drop drive bays to match your physical layout.
* **Pool IO Graphs**
  * display the last 60s.
  * server side cache of data.
  * read and write data.
  * 1 graph per pool.
