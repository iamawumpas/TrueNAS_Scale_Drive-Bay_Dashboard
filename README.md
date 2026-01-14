# TrueNAS Scale Drive Bay Assignment Dashboard

A real-time, web-based visual dashboard for monitoring physical drive health, activity, and ZFS pool assignments on TrueNAS Scale.

<img width="1917" height="570" alt="image" src="https://github.com/user-attachments/assets/f7a620ba-10ba-40ca-9a7e-c5ea055c8b4c" />


## Features

-   **Physical Mapping**: Correlates ZFS Part-UUIDs and block devices to their physical HBA slots.
-   **ZFS Awareness**: Automatically parses `zpool status` to display Pool Names and disk indices (e.g., `Data-1`, `Data-2`).
-   **Real-time I/O Monitoring**: High-frequency polling of `/proc/diskstats` drives a "Blue" activity LED for every disk.
-   **Health Status**: Visual LED indicators for ZFS health (ONLINE, UNUSED, or ATTENTION).
-   **Configurable UI**: Easily adjust colors, font sizes, and labels via a simple dictionary in the Python script.
-   **Smart Formatting**: Automatically converts disk capacity to TB and displays the last 3 digits of serial numbers for quick physical identification.

## New in this Version

-   **ZFS UUID Parser**: No longer relies on simple device names; correctly maps drives using ZFS internal unique identifiers.
-   **TB Conversion**: Displays human-readable Terabyte sizes.
-   **User-Configurable Styles**: Dedicated `UI_CONFIG` and `ZFS_CONFIG` variables for easy layout adjustments.
-   **Enhanced Readability**: Larger font sizes and color-coded information (Yellow Serials, Pink Sizes, White Pool Names).

## Prerequisites

-   **TrueNAS Scale** (Linux-based)
-   **Python 3.x**
-   Root/Sudo access (required to read `lsblk` serials and `zpool status`)

## Installation & Setup

1.  **Download the files**:
    -   `service.py` (The Backend)
    -   `index.html` (The Frontend)

2.  **Identify your HBA PCI Address**:
    Run `ls -l /dev/disk/by-path` to find the PCI address of your storage controller (e.g., `0000:00:10.0`).

3.  **Configure `service.py`**:
    Update the `EXPECTED_LAYOUT` dictionary with your PCI address and the number of drive bays.
    ```python
    EXPECTED_LAYOUT = {"0000:00:10.0": {"name": "Main Storage", "bays": 16}}
    ```

4.  **Run the service**:
    ```bash
    sudo python3 service.py
    ```

5.  **Access the Dashboard**:
    Open your browser and navigate to `http://your-truenas-ip:8010`.

## Configuration Options

You can customize the dashboard by editing the variables at the top of `service.py`:

| Variable | Description |
| :--- | :--- |
| `UI_CONFIG['font_size_info']` | Adjusts the size of Serial Numbers and Capacities. |
| `UI_CONFIG['color_sn']` | Sets the color of the Serial Number (default: Yellow). |
| `ZFS_CONFIG['show_index']` | Toggles the numbering suffix on pool names (e.g., the "- 1" in "Data-1"). |
| `ZFS_CONFIG['pool_separator']` | Change the character between the pool name and index. |

## How it Works

1.  The **Python Backend** runs a high-frequency thread to monitor disk activity and a 5-second interval thread to poll hardware stats.
2.  It serves a JSON object containing the hostname, UI configurations, and the disk topology map.
3.  The **HTML Frontend** uses Vanilla JavaScript to fetch this data and update the DOM 10 times per second, ensuring the activity LEDs feel responsive.

## License

MIT License - Feel free to use and modify for your own home lab!
