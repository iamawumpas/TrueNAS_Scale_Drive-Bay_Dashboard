# Developer Notes - TrueNAS Scale Drive Bay Assignment

## Core Architecture
The system consists of two main components:
1.  **Backend (`service.py`)**: A Python-based micro-service that polls system hardware via `lsblk`, `/dev/disk/by-path`, and `zpool status`. It serves this data via a lightweight HTTP JSON API.
2.  **Frontend (`index.html`)**: A single-page dashboard that fetches the JSON data every 100ms and dynamically renders the drive bay states, LEDs, and disk information.

## Hardware Mapping & Correlation
Mapping a physical disk slot to a software device name (`sdX`) is achieved through `/dev/disk/by-path`. 

### ZFS Integration
TrueNAS Scale typically uses **Part-UUIDs** in ZFS pool configurations. To ensure the dashboard correctly identifies which pool a physical drive belongs to, the backend performs the following:
- Maps **Part-UUIDs** found in `/dev/disk/by-partuuid` to their parent block devices (e.g., `sda`).
- Parses the output of `zpool status` to extract pool names and the relative index of the disk within that pool.
- Correlates the resolved block device name with the HBA PCI path to place the disk in the correct UI slot.

## Configuration & Customization
The system is designed to be highly configurable via dictionaries at the top of `service.py`.

### UI Configuration (`UI_CONFIG`)
Allows for easy adjustment of the dashboard's look and feel without modifying HTML/CSS:
- **Font Sizes**: Adjust `font_size_info` (Serial/Size) and `font_size_pool` independently.
- **Colors**: Hex codes for Serial Number (Yellow), Disk Size (Pink), and Pool Name (White).
- **Separators**: Toggle the visual `|` character or use standard spacing.

### ZFS Configuration (`ZFS_CONFIG`)
Controls how pool data is presented:
- **Disk Indexing**: Toggle the `- #` numbering suffix.
- **Formatting**: Define custom separators and labels for unallocated drives (e.g., "FREE" or "UNUSED").
- **Alignment**: Uses non-breaking spaces (`&nbsp;`) to ensure labels remain readable when rotated.

## Technical Implementation Details
- **Capacity Conversion**: The backend retrieves raw bytes from `lsblk -b` and converts them to Terabytes ($1024^4$) for a clean `X.XTB` display.
- **I/O Monitoring**: The `background_monitor` thread snapshots `/proc/diskstats` at high frequency to detect delta changes in sector counts, triggering the "Blue" activity LED.
- **LED Logic**: 
  - **Green**: Online and healthy in a ZFS pool.
  - **Purple**: Physical disk present but not allocated to a pool.
  - **Orange**: Disk error or Attention state (parsed from ZFS state).
  - **Blue**: Active I/O detected.
- **PCI Pathing**: The `EXPECTED_LAYOUT` dictionary maps specific PCI addresses (like `0000:00:10.0`) to a friendly name and a defined number of bays. This allows the script to ignore boot drives or internal SSDs not part of the main HBA backplane.
