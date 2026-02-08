# Storage Dashboard - Change Log

## Version 20.2:
* **Dynamic Port Configuration**
    * Added "Listening Port" spinner control to Dashboard Settings menu (top of menu)
    * Port setting stored in `config.json` under `network.port`, default 8010
    * Real-time server restart via `start_up.sh` when port is changed
    * Automatic browser navigation to new port URL after restart
    * Prominent modal warning users about bookmark/shortcut updates needed
    * Modal stays visible until user acknowledges before redirecting
* **Configuration Improvements**
    * Port input now properly synced during revert operations
    * Added hard cache-clearing refresh on save/revert to ensure UI reflects actual config state
    * Fixed dropdown menu not closing until SAVE/REVERT is clicked
    * Port changes properly trigger restart sequence with clear user feedback
* **Menu System Fixes**
    * Fixed SAVE/REVERT buttons not firing when dropdown menus are open
    * Menu dropdowns now close automatically after save/revert actions
    * Improved event handling to prevent event propagation conflicts

## Version 20:
* **Real-Time Pool Activity Monitor**
    * Integrated live read/write activity graphs for all ZFS pools using Chart.js
    * Added dedicated activity monitoring chassis displayed between menu bar and drive bay displays
    * Implemented 10Hz data sampling with 1-second rolling average for smooth graph visualization
    * Displays 15 seconds of historical activity data per pool
    * Automatic pool detection and dynamic graph generation
    * Beveled glass card design matching overall dashboard aesthetic
    * Centered layout with responsive column fitting
* **Backend Enhancements**
    * Added pool activity monitoring thread with per-pool bandwidth tracking
    * New `/pool-activity` API endpoint for activity history data
    * Dynamic drive-to-pool mapping using lsblk detection
    * Efficient diskstats polling with smoothing buffers

## Version 19.5:
* **Unified Menu Control Standards**
    * Standardized all input controls across menus with consistent sizing: 32px height for dropdowns, sliders, and spinners; 32×32px square color pickers
    * Improved menu layout with inline field controls for more compact and readable interfaces
* **Enhanced Text Customization**
    * Redesigned Chassis "Font & Text" section with inline Font, Color, and Size controls
    * Implemented slider-based font sizing (0-100 scale) for intuitive visual adjustment of text scales
    * Extended the same visual arrangement to all Bay text fields (Pool Name, Disk Number, Serial, Size) for consistency
    * Reorganized text transform options in a 2-column grid layout with visual previews
* **Grill Pattern Control**
    * Converted grill size from text input to intuitive slider (0-100 mapping to 10px-20px)
* **Menu UI Polish**
    * Increased section heading sizes (16.5pt) for better visual hierarchy
    * Removed button outlines and simplified menu button styling for a cleaner interface
    * Implemented hover effect using text-shadow to avoid layout shifts when hovering menu items

## Version 19.1:
* **Moved configurable items to 'config.json' 

## Version 19:
* **New Logic to identify the number of bays to draw per chassis**
    * the logic will pole each PCI device to see if:
        * there is a backplane(s) and how many physical disks can be attached, or
        * scan the vendor CLI to see how many physical lanes there are, or (fallback)
        * use manually entered values in config.json

## Version 18.5:
* **Excuded Virtual PCI Devices**
    * the logic now scans for virtual devices and excludes them from the display.
    * **Virtual Controllers filtered out:**
      * Hyper-V/Azure controllers (vendor 0x1414 - Microsoft)
      * Virtio controllers (vendor 0x1af4 - Red Hat/KVM)
      * VMware controllers (vendor 0x15ad)
      * VirtualBox controllers (vendor 0x80ee)
      * QEMU controllers (vendor 0x1b36)
      * Emulated Intel PIIX IDE controllers (devices 0x7111, 0x7113 - used by Proxmox/QEMU)
      * Any non-storage class devices (not class 0x01xxxx)
    * **HBAs/RAID/Physical Controllers Scanned for:**
      * LSI/Broadcom HBAs (SAS/SATA controllers)
      * Adaptec RAID controllers
      * Marvell controllers
      * Intel real PCIe storage controllers
    
    Any PCI-passthrough devices (appear as their real vendor/device IDs)


## Version 18: 
* ** Removed hardcoded logic**
     * hostname: Now taken from netbios name
     * device PCI address: now enumerates all devices
     * number of drive bays in a chassis: where possible, the script will poll the HBA/RAID device for the maximum number of possible connections, and then draw the approprite number of bays in the chassis. This will extend to SATA expanders and backplanes if present.
* ** Visual Tweaks**
* ** Multiple Threads**
    * shifted the Activity and Status logic, PCI Device scanning to one thread updating in real time ( < 100ms)
    * shifted Drive Size, ID, Serial Number, and Pool Name to a different thread ( 5 - 10 s). Chassis and Bay redraws are also in this thread

## Version 17: Hot-Reload & Dynamic Config
* **Auto-Refresh (Hot-Reload):**
    * Added a project file watcher in `service.py` that monitors modification timestamps of `.py`, `.js`, `.css`, and `.html` files.
    * Implemented a `/version` API endpoint to serve the current project state.
    * Added a frontend polling mechanism in `app.js` that triggers a `location.reload()` if a code change is detected.
* **Dynamic Configuration:**
    * Updated the backend to prioritize settings in `config.json` over hardcoded defaults.
    * Ensured autogenerated `config.json` files include user-requested remarks/comments for network and chassis settings.
* **Bug Fixes:** * Fixed a crash in `service.py` caused by empty device paths during hardware scans.
    * Improved Mime-type handling for ES6 modules to prevent "Strict MIME type checking" errors in modern browsers.
* **State Persistence:** Refined the `DISK_CACHE` logic to ensure hostnames and topology updates are synchronized across the background monitoring thread.

### Version 14 (Modular Finalization)
- **Codebase Modularization**: Successfully split the monolithic application into 11 distinct files to prevent future changes from breaking unrelated features.
- **Improved Maintainability**: Isolated LED logic, Disk formatting, Chassis design, and Bay styling into independent JavaScript and CSS modules.
- **Legend Refinement**: Fixed HTML syntax errors in the legend and applied `white-space: nowrap` to prevent text overlapping or wrapping on smaller screens.
- **Color Consolidation**: Moved all status color definitions and gradient logic (including legend split-dots) into a single `LEDs.css` file.

### Version 13 (Visual & Logic Update)
- **Realistic Bay Design**: Redrew the drive latches with a 3D recessed handle grip and mechanical pivot points for a more professional, "hardware" look.
- **LED Alignment**: Moved the Status and Activity LEDs to a side-by-side horizontal configuration at the top of each caddy.
- **Logic Correction**: Fixed the "Critical Error" blinking state for unallocated faulted drives to properly cycle between Red and Purple.
- **Legend Update**: Added "Critical Error" and "Unallocated Error" labels to the cloudy legend to match the updated diagnostic logic.

### Version 12 (Layout & Diagnostics)
- **Data Grid Swap**: Reorganized the drive information layout. Serial Numbers and Pool Names are now on the left, while Size and Pool Index are on the right.
- **Diagnostic States**: Introduced the "Unallocated Fault" state, differentiating between drives that are part of a ZFS pool and those that are sitting idle but failing hardware checks.

### Version 11 (Physical Appearance)
- **Caddy Texture**: Added a dot-mesh background pattern to the drive bays to simulate the perforated metal used in real server front-panels.
- **Brushed Metal Chassis**: Updated the storage unit background with a repeating linear gradient to mimic industrial brushed steel.

### Version 10 (Dynamic Legend)
- **"Cloudy" Legend**: Implemented a frosted-glass (backdrop-filter) status legend at the top of each chassis for quick reference of LED states.
- **ZFS Integration**: Hardened the connection between `zfs_logic.py` and the frontend to ensure "Resilvering" status is prioritized over "Online."

### Version 9 (Performance & Activity)
- **IO Activity Monitoring**: Integrated `/proc/diskstats` on the backend to track real-time disk read/write activity.
- **Activity LEDs**: Added a blue "Activity" LED to each bay that pulses based on actual disk usage.

### Version 8 (Multi-Chassis Support)
- **PCI Address Tracking**: Added support for systems with multiple HBAs (Host Bus Adapters), allowing the dashboard to render separate chassis for different PCI addresses.
- **Dynamic Headers**: The hostname and array name are now pulled dynamically from `config.json` and the system OS.

### Version 7 (Core Visual Foundation)
- **3D LED Bulbs**: Replaced flat color circles with radial gradients to simulate physical LED bulbs catching the light.
- **ZFS Logic Base**: Implemented the primary state engine that translates `zpool status` outputs into Green, Orange, Red, and Purple visual cues.