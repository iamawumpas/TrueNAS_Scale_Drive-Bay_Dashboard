# TrueNAS Scale Drive Bay Assignment
A dashboard to show my disk array arrangement, status, and activity.

![Dashboard Preview](https://github.com/user-attachments/assets/2700a1bc-75f2-4fb2-825d-8c9a03b3310c)

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
5.  **Set Permissions:** ```bash
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

It also acts as a basic web server to host the dashboard. It uses **port 8010** by default (this can be changed within the script).

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

## Future Plans
* **Dynamic Logic:** Detect the specific device TrueNAS reports to better design the chassis layout automatically.
* **Pool Labeling:** Add Pool names to the drive icons to identify which disks belong to which VDEV/Pool.
