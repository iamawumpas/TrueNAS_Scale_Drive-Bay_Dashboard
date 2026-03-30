# Storage Dashboard - Change Log

## Version 23.7:
* **Menu Section Header Customization**
    * Added new `Dashboard > Menu > Section Name` controls for section header `Colour`, `Font Size`, and `Font Style`.
    * Wired section header style settings through `ui.menu.section_name` in `config.json` with live preview support.
    * Added matching `ui.menu.section_name` defaults in `service.py` so reset-to-default regenerates the same keys.
* **Menu Control Color Customization**
    * Added `Control Background Colour` and `Control Highlight Colour` pickers under `Dashboard > Menu`.
    * Wired control background color to non-button menu controls (inputs/select/slider track areas) without changing SAVE/REVERT/RESET button themes.
    * Wired highlight color to slider thumbs, focus accents, and hover/focus control highlights across all dropdown menus.
* **Dropdown Panel Height Constraint**
    * Limited menu dropdown panels to a max height of `500px`.
    * Added vertical scrolling so long panels remain usable without overflowing the viewport.

## Version 23.6:
* **Drive Temperature Collection and Display Enhancements**
    * Replaced middleware-only temperature dependence with `smartctl`-based collection from `/dev/disk/by-id/ata-*`.
    * Added resilient SMART JSON parsing with support for valid output even when `smartctl` returns non-zero exit codes.
    * Improved disk-to-temperature matching across by-id, partition-suffixed, and runtime-resolved device aliases.
    * Fixed frontend null-temperature handling so missing data no longer renders as false `0C` values.
* **Temperature Alert Thresholds and Visual Signaling**
    * Added conditional temperature styling for bay temperature text:
    * `<=40C`: uses configured temperature color.
    * `>40C and <=60C`: amber/orange blinking warning state.
    * `>60C`: red blinking critical state.
    * Applied threshold logic using backend `temperature_c` values so behavior remains correct in both `C` and `F` display modes.
* **Dashboard Stability and Recovery Improvements**
    * Added sticky last-known-good payload behavior with retry/timeout handling to reduce transient render collapse under backend load.
    * Added partial-topology rejection safeguards to prevent destructive single-chassis fallback during temporary data interruptions.
    * Added Disk Arrays menu rebuild deduplication and recovery hooks to prevent frequent menu closure on high-frequency refresh.
* **Disk Arrays and Topology Data Path Fixes**
    * Restored stable ZFS pool/index join behavior after topology mapping regression.
    * Added shared temperature propagation support across both by-path and IRCU enclosure topology paths.

## Version 23.5:
* **Codebase Cleanup and Redundancy Reduction**
    * Deactivated a redundant legacy `Disk Arrays` CSS block to keep the active style path singular and easier to maintain.
    * Deactivated an overlapping direct reset-button event binding so reset handling flows through one canonical panel-event path.
    * Removed obsolete `.old` backup source files from the repository to reduce maintenance noise and accidental drift.
* **Repository Hygiene**
    * Removed redundant editor metadata artifacts that were no longer required by runtime behavior.
    * Performed post-cleanup validation to ensure frontend/backend behavior remains intact after the cleanup pass.

## Version 23.4:
* **Activity Monitor Styling Controls Expansion**
    * Added Activity Monitor `Server Name` controls for font family, style combinations, and color with live preview support.
    * Added random scratch controls (level, density, intensity) for the Activity Monitor chassis finish.
    * Added graph typography controls for title, legend text, and y-axis label sizing.
    * Added derived subheading color behavior so the Activity Monitor subtitle tracks as a darker shade of server-name color.
* **Dashboard Menu Rebuild and Dropdown Behavior**
    * Reworked top menu into structured dropdown panels for Dashboard, Activity Monitor, and Disk Arrays.
    * Added menu dropdown transparency slider (0-100 mapped to 0.5-1.0 opacity).
    * Added robust live-preview synchronization across menu controls and chart recreation triggers.
* **Disk Arrays Dynamic Per-Enclosure Controls (Phase 1/2/Chassis Wiring)**
    * Added dynamic `Disk Arrays` menu generation based on discovered enclosures.
    * Added per-enclosure `Chassis` settings (color, scratch controls, server-name typography/color, enclosure ID subtitle color).
    * Added per-enclosure `Drive Bay` controls including door color plus grill shape and size scaling.
    * Wired per-enclosure settings to `config.json` under `devices.<enclosure-key>.*` with live preview and render-path support.
* **Reset-to-Defaults Workflow and Kiosk-Safe UX**
    * Added backend `/reset-config` endpoint to rewrite `config.json` from service defaults and reload in-memory config.
    * Added Dashboard `RESET ALL` action that triggers reset and hard refresh after 3 seconds.
    * Replaced browser popup messaging with an in-app modal flow (confirm/success/error) suitable for kiosk-mode browsers.
* **Rendering and Styling Refinements**
    * Added per-enclosure CSS variable overrides for chassis shell, bay shell, latch gradients, and grill rendering.
    * Added shape-driven grill rendering support (solid, round, square, triangle, hexagonal) with scalable pattern sizing.
    * Added Activity Monitor chart y-axis font-size variable plumbing in frontend chart configuration.

## Version 23.3:
* **2U Bay Scaling and Fit Rework**
    * Reworked chassis bay sizing so horizontal and vertical 12-bay 2U layouts are calculated from explicit long-side and short-side geometry.
    * Added rack-unit height override support so 2U chassis can be tuned to better fill available width without distorting the bay aspect ratio.
    * Refined horizontal bay scaling to better consume chassis width while preserving the rendered drive proportions.
* **Vertical Bay Face Layout Refinement**
    * Increased vertical bay width slightly while keeping the bay height unchanged for better visual balance.
    * Repositioned the vertical LED strip and rotated info block to match horizontal inset spacing more closely.
    * Reduced the rotated info container footprint and increased latch- and LED-side clearance to improve readability inside narrow bays.
* **Chassis Layout and Polling Updates**
    * Centered bay grids and chassis content more consistently inside the enclosure body to reduce uneven dead space.
    * Tightened chassis body sizing so the bay field uses the configured body height directly instead of relying on auto-height behavior.
    * Increased frontend `/data` refresh frequency from 2000 ms to 200 ms so activity LEDs respond much closer to live disk activity.

## Version 23.2:
* **Chassis Proportion Alignment Fix**
    * Rolled back parts of the v22-era bay scaling heuristics that were inflating one enclosure relative to the other.
    * Removed vertical-layout boost logic that over-expanded bay height and width in mixed chassis scenarios.
    * Restored strict aspect-ratio-constrained bay fitting so width and height limits are respected consistently.
* **Side-by-Side Chassis Consistency**
    * Corrected enclosure rendering so left and right chassis stay visually aligned under the same viewport constraints.
    * Reduced unintended stretch bias in the right-hand direct-attach enclosure.
    * Preserved physical drive ratio while bringing bay fields back into line across both chassis.

## Version 23.1:
* **Menu System Rebuild - Phase 1 Baseline**
    * Reintroduced a clean top menu bar shell from scratch while keeping SAVE/REVERT workflow behavior.
    * Removed all legacy dropdown menus and submenus to establish a minimal, stable foundation for the next rebuild phase.
    * Preserved dirty-page handling: SAVE/REVERT activate only when pending changes exist.
    * Preserved live-preview plumbing so unsaved menu-driven config changes can be previewed immediately.
* **Legend Overlay Menu Item**
    * Added right-aligned `Legend` menu item in the top bar.
    * Converted legend display to overlay mode with click-to-open and backdrop click-to-close behavior.
    * Removed inline legend rendering from the top row so legend visibility is now user-invoked from the menu bar.
* **Menu and Overlay Visual Refinement**
    * Styled legend overlay as a menu panel instead of a chassis card (removed flare/striped chassis treatment).
    * Reduced legend overlay footprint to package LED/state labels more compactly.
    * Updated `ALLOCATED-OFFLINE` legend dot to green/black split styling for stronger visual consistency.
    * Updated menu-item hover behavior to text bolding only, removing button-style hover effects.
* **Config-Driven Menu Styling Expansion**
    * Added `ui.menu` style schema in `config.json` for menu bar, controls, buttons, and warning palette values.
    * Added matching `DEFAULT_CONFIG` menu defaults in `service.py` so rebuild/regeneration retains menu styling keys.
    * Kept control-class styling hooks (`spinner`, `fields`, `checkbox`, `radio`, `dropdown`) in CSS, now driven by config variables.

## Version 23.0:
* **Chassis Display Logic Rebuild (Primary Release Focus)**
    * Rebuilt chassis and bay rendering around a physical 19-inch rack model so bay proportions stay correct while scaling.
    * Refactored enclosure model generation to support per-chassis layout context and viewport-aware sizing.
    * Reworked width allocation so side-by-side chassis are computed from available dashboard width and inter-chassis gap.
    * Updated chassis card sizing behavior to prevent unintended wrapping and preserve inline two-chassis layouts.
* **Temporary Menu System Removal**
    * Removed legacy menu system from active runtime to stabilize the rebuilt dashboard surface.
    * Removed menu stylesheet/script loading from the live page while preserving legacy menu files as `.old` references.
    * Established a clean baseline for a future menu rewrite without legacy coupling to render/layout paths.
* **Config-Driven Styling Consolidation**
    * Expanded `config.json` to centralize dashboard colors, typography, shell styling, activity card styling, and layout variables.
    * Updated runtime CSS-variable application to map the expanded UI/chart style schema.
    * Aligned `service.py` default config rebuild payload with the current config schema to avoid style drift.
* **Header and Information Layout Updates**
    * Updated hostname presentation to small-caps styling and moved enclosure type label inline with title.
    * Removed obsolete header metadata labels from the live chassis header output.
    * Tuned PCI/device text sizing defaults for denser, cleaner bay-face readability.
* **Activity Monitor Integration and Theming**
    * Restored activity monitor bootstrap lifecycle after render and synchronized it with dashboard reflow.
    * Migrated activity monitor styling to the shared CSS-variable theme model for config-level control.
    * Standardized chart color/dimension variable wiring with runtime updates.

## Version 22.2:
* **Physical Bay Geometry Refactor**
    * Introduced shared geometry engine for chassis and bay sizing in `ui/layoutGeometry.js`
    * Unified runtime and live-preview sizing paths to use identical physical layout calculations
    * Added shared header-height baseline so matching rack-unit chassis render at consistent total heights
* **Orientation Consistency Improvements**
    * Updated vertical and horizontal bay layout logic to align long-edge bay sizing behavior
    * Removed horizontal stretch-gap side effects that caused oversized empty bay-area spacing
    * Normalized bay-field spacing to preserve consistent inter-bay gap handling across orientations
* **Bay Face Layout Redesign**
    * Removed legacy "BAY x" label block to free top-face space
    * Moved bay numbering onto the latch face with centered numeric-only labels
    * Reworked info area flow to fit cleanly between LED block and latch boundary
* **Header and Legend Architecture Update**
    * Moved ZFS legend from per-chassis header into dedicated standalone legend chassis
    * Converted legend layout to compact two-column presentation for improved fit
    * Added top-row composition to align activity monitor and legend chassis side-by-side
* **Typography and Styling Controls**
    * Added independent per-device hostname and device-ID scale controls
    * Wired physical rack constants and bay-gap controls through `config.json` layout settings
    * Tuned LED sizing/placement, including vertical LED edge offset adjustment for visual parity

## Version 22.1:
* **Bay Layout Control & Live Preview Enhancements**
    * Reworked Bay Settings into a single panel with inline chassis target selection, bay orientation, and drive-sequence controls
    * Fixed live preview behavior so unsaved menu changes are rendered immediately without being overwritten by backend refresh data
    * Added robust per-device key normalization for topology/config mapping consistency across enclosure keys
* **Horizontal Bay Rendering Improvements**
    * Updated horizontal bay rendering to rotate caddies from the vertical base drawing model
    * Added orientation-specific text handling so bay labels and disk metadata remain left-to-right readable
    * Improved horizontal bay spacing and alignment behavior for mixed chassis layouts
* **Physical Chassis/Bay Sizing Refinements**
    * Introduced rack-unit based chassis sizing logic that derives pixel geometry from chassis width scale
    * Separated header area from bay-area sizing so drive area can be controlled independently
    * Updated bay-area sizing math for vertical layouts to better fill the available chassis bay field
* **Header/Legend Layout Overhaul**
    * Converted chassis header layout to explicit column split logic for stable title/legend placement
    * Reduced legend footprint and tuned legend alignment/padding to prevent title collisions
    * Added configurable alignment improvements for better left/right balance across chassis widths
* **Bay Spacing and Edge Padding Normalization**
    * Unified inter-bay gap and bay-field edge padding via shared gap variable usage
    * Removed conflicting legacy `.slots` rules from chassis styling to eliminate spacing overrides
    * Standardized spacing behavior across vertical and horizontal bay orientations
* **LED Visual Tuning**
    * Reduced bay LED size to 80% of prior size for better fit inside dense bay layouts
    * Preserved existing status/activity color behavior while improving visual proportionality

## Version 22.0:
* **SAS HBA Backplane & Direct-Attach Support (sas2ircu / sas3ircu)**
    * **Per-Enclosure Chassis Rendering:** Each physical SAS backplane expander now renders as its own chassis; direct-attach drives (SFF-8087 to SATA breakout) render as a separate chassis alongside it - no hard-coded bay counts
    * **Authoritative Slot Detection:** Backplane bay count derived from the highest occupied drive slot reported by the SAS adapter (`sas2ircu`/`sas3ircu DISPLAY`), not the firmware `Numslots` field which includes management pseudo-slots
    * **SES-Based Backplane Classification:** Enclosures are classified via the presence of an `Enclosure services device` block in adapter output; the HBA virtual enclosure is correctly identified as direct-attach regardless of whether it appears in the Enclosure information header
    * **Direct-Attach Capacity Calculation:** Direct-attach bay count = HBA virtual enclosure `Numslots` minus lanes consumed by connected backplane ports (`DEFAULT_TARGETS_PER_PORT` per backplane), giving the true number of remaining direct-connect PHY lanes
    * **Dynamic Multi-Adapter Discovery:** Topology scanner probes each HBA PCI address against available ircu tools; falls back to `/dev/disk/by-path` for controllers with no ircu support (NVMe, non-SAS HBAs)
    * **Per-Controller Sub-Keys:** ircu-derived chassis use `{pci_key}-e{enclosure_id}` and `{pci_key}-da` keys so multiple backplanes and the direct-attach segment are tracked independently in the topology
* **PCI Address Normalisation**
    * **`h`-Suffix Stripping:** `sas2ircu LIST` outputs addresses in `00h:10h:00h:00h` format; normaliser now strips `h`/`H` suffixes before comparison
    * **Bus:Device:Function Conversion:** Short 4-part ircu addresses are correctly mapped to Linux `0000:BB:DD.F` format for matching against `/dev/disk/by-path` entries
    * **Fallback BDF Matching:** If `LIST` parsing fails, `_find_ircu_adapter` enumerates adapters and reads Bus/Device/Function fields directly from each adapter's `DISPLAY` output
* **Serial Number Normalisation**
    * **Dash-Stripped Aliases:** `lsblk` includes manufacturer punctuation in serials (e.g. `WD-WCC3F3XV1DKV`) while `sas2ircu` omits it (`WDWCC3F3XV1DKV`); `build_serial_to_dev_map` now stores both forms so every disk resolves to its correct device name and ZFS pool membership
* **ZFS State Enrichment for ircu Disks**
    * **Full State Inheritance:** Each ircu-discovered disk is cross-referenced against `zfs_map` for pool name, pool index, ZFS state (ONLINE/DEGRADED/FAULTED/RESILVERING etc.) and activity LED
    * **SCSI State Fallback:** Disks with no ZFS record are checked against raw SCSI state (`Failed`, `Missing`, `Critical`, `Degraded`) and marked `FAULTED` if any fault keyword is present
    * **Model Field Added:** Drive model number from `sas2ircu` output is included in each disk record for future display use
* **Diagnostic Endpoint**
    * **`/ircu-debug` Endpoint:** New HTTP GET endpoint returns a 6-step JSON diagnostic report covering PCI address discovery, ircu tool availability and LIST output, adapter lookup result, per-enclosure parse results, serial-to-device mapping, and final topology with disk counts - for troubleshooting without log file access

## Version 21.0:
* **TrueNAS Scale API Integration**
    * **Primary Detection Method:** Native TrueNAS Scale API via `midclt call pool.query` for direct ZFS pool/disk metadata
    * **Intelligent Fallback:** Automatic fallback to `zpool status -v -p` parsing if API unavailable
    * **Direct Integer Error Counts:** No K/M/G suffix parsing needed - API provides exact error numbers
    * **Enhanced State Detection:** Properly detects ONLINE, DEGRADED, FAULTED, UNAVAIL, REMOVED, OFFLINE, RESILVERING states
    * **Pool-Level Monitoring:** Tracks pool states (ONLINE, DEGRADED, FAULTED, SUSPENDED) independent of disk states
    * **Recursive vdev Processing:** Parses nested vdev structures (raidz, mirror) with accurate error propagation
* **API Change Detection & Monitoring**
    * **Red Warning Bar:** Prominent warning banner at top of page when TrueNAS API changes or becomes unavailable
    * **Menu Bar Alert:** Menu bar changes to red background with white text to indicate API issues
    * **Error Details:** Shows specific error message (timeout, call failure, JSON parse error, not found)
    * **Fallback Mode Indicator:** Clearly displays "(Using fallback mode)" when running on zpool status parsing
    * **Pulsing Animation:** Warning banner pulses to draw attention without being intrusive
* **Enhanced Error Detection Logic**
    * **READ/WRITE/CKSUM Parsing:** All error columns properly parsed and tracked per disk
    * **UNAVAIL State:** Disks in UNAVAIL state marked as FAULTED (red)
    * **REMOVED State:** Physically removed disks marked as FAULTED (red)
    * **Error-Based DEGRADED:** Any disk with READ > 0, WRITE > 0, or CKSUM > 0 automatically marked DEGRADED (orange)
    * **Pool FAULTED/SUSPENDED:** All disks in FAULTED/SUSPENDED pools marked as FAULTED (red) regardless of individual state
    * **Multiple Regex Patterns:** Separate patterns for disks with/without error columns for robust parsing
* **Pool State Visual Indicators**
    * **FAULTED/SUSPENDED Pools:** Activity chart replaced with solid RED box displaying "FAULTED" in white text
    * **DEGRADED Pools:** Orange overlay with "DEGRADED" text displayed on top of activity chart
    * **Pulsing Warning:** FAULTED pool indicators pulse to draw attention
    * **Automatic Chart Hiding:** Chart canvas hidden when pool is FAULTED (no data available)
    * **Pool State Tracking:** Pool states passed from backend to frontend for real-time display updates
* **Blinking LED Animations - CRITICAL FIXES**
    * **Fixed Missing Animations:** Added CSS animations for `status-led.allocated-offline`, `status-led.unalloc-error`, `status-led.unalloc-fault`
    * **Allocated Offline:** Blinks between GREEN and GRAY (1s interval) for offline allocated disks
    * **Unallocated Error:** Blinks between PURPLE and ORANGE (1s interval) for spare disks with errors
    * **Unallocated Fault:** Blinks between PURPLE and RED (1s interval) for faulted spare disks
    * **Radial Gradient Preservation:** Blinking maintains 3D LED sphere appearance with proper gradients
    * **Glow Effects:** Box-shadow colors change with blink state for realistic LED effect
* **Complete Disk State Coverage**
    * **Priority 1:** Pool FAULTED/SUSPENDED → All disks RED
    * **Priority 2:** Disk resilvering/repairing/replacing → WHITE
    * **Priority 3:** Disk UNAVAIL/REMOVED → RED (allocated) or PURPLE/RED blink (unallocated)
    * **Priority 4:** Disk has errors (R/W/C > 0) → ORANGE (allocated) or PURPLE/ORANGE blink (unallocated)
    * **Priority 5:** Disk FAULTED → RED (allocated) or PURPLE/RED blink (unallocated)
    * **Priority 6:** Disk DEGRADED → ORANGE
    * **Priority 7:** Disk OFFLINE → GREEN/GRAY blink
    * **Priority 8:** Disk ONLINE → GREEN (allocated) or PURPLE (unallocated)
* **Improved ZFS Parsing**
    * **`zpool status -v -p` Flag:** Uses `-p` flag for exact numeric error counts (no suffix parsing)
    * **Dual Pattern Matching:** Handles both error-column and no-error-column line formats
    * **Repairing Keyword Detection:** Detects "(repairing)", "(resilvering)", "(replacing)" text indicators
    * **Whitespace Resilient:** Regex patterns handle variable spacing in zpool output
* **Backend Architecture Improvements**
    * **Tupled Return Values:** `get_zfs_topology()` now returns `(zfs_map, pool_states)` tuple
    * **API Status Tracking:** New `get_api_status()` function returns `{available: bool, error_message: str}`
    * **Global Pool States:** Pool states stored in `GLOBAL_DATA["pool_states"]` for frontend access
    * **Global API Status:** API status stored in `GLOBAL_DATA["api_status"]` for monitoring
    * **Enhanced `/data` Endpoint:** Returns `pool_states` and `api_status` in JSON response
* **Code Quality & Maintainability**
    * **Modular Error Handling:** Try/except blocks with specific error types (TimeoutExpired, CalledProcessError, JSONDecodeError)
    * **Comprehensive Logging:** Debug output for all state transitions and error detections
    * **Error Count Storage:** `read_errors`, `write_errors`, `cksum_errors` tracked per disk for future features
    * **vdev Status Preservation:** Original vdev status stored alongside computed final state
* **User Experience Enhancements**
    * **Clear Visual Hierarchy:** Pool issues immediately visible via color-coded overlays
    * **No Silent Failures:** API issues prominently displayed rather than hidden
    * **Fallback Reliability:** System continues working even if API becomes unavailable
    * **Future-Proof:** API detection allows graceful handling of TrueNAS updates

## Version 20.6:
* **Dashboard Scale Control**
    * Added dashboard scale slider (50-150%, step 1) in Dashboard Settings → Environment panel
    * Live percentage display textbox (read-only) with 80/20 layout split alongside slider
    * Real-time preview of dashboard zoom during adjustment
    * Switched from CSS `transform: scale()` to `zoom` property - fixes layout dimensions and scrollbar issues
    * Properly scales both visual appearance and layout flow (eliminates spurious scrollbars when zoomed out)
* **Layout & Spacing Improvements**
    * Increased gap between menu bar and activity monitor to 30px for better visual separation
    * Dashboard wrapper auto-centered with fit-content width constraint
    * Reduced chassis bottom margin to 5px (via `:last-child` selector for final chassis only)
    * Wrapper properly positioned below menu bar with no excessive whitespace
* **Network Settings UI Enhancements**
    * Listening port textbox constrained to 25% max-width for cleaner layout
    * Port label displays on single line with `white-space: nowrap`
    * Restart notification text aligned with bottom of port textbox
* **Cache-Busting & Redraw Fixes**
    * Enhanced cache-busting on save: adds timestamp query parameter to force full page reload
    * Added cache-busting to `/data` endpoint in `app.js` for fresh topology fetch
    * Fixed issue where changing chassis rows or bays_per_row required manual hard refresh
    * Chassis now properly redraws with new layout immediately after save

## Version 20.5:
* **Performance & UI Optimizations**
    - Added `ui/utils.js` with shared UI helpers to centralize CSS-variable writes and common DOM helpers.
    - Consolidated repeated CSS-variable set operations into `applyConfigMap()` to reduce style thrash.
    - Introduced DOM caches (`unitsMap`, `slotContainersMap`) to avoid expensive repeated queries.
    - Implemented delta-updates (`updateTextIfChanged`, `setClassIfChanged`) to minimize DOM writes for hot-path updates (disk cells, LEDs).
    - Applied per-unit CSS-variable overrides immediately when unit elements are created to avoid redundant global writes.
    - Gated verbose debug logging behind `UI_DEBUG` to reduce console noise in normal operation.
    - Fixed a `MenuSystem.js` syntax regression and applied low-risk refactors to improve runtime stability.

## Version 20.4:
* **Bay Height Customization**
    * Added adjustable bay height slider (20-60vh range) in Bay Appearance section of Bay Settings submenu
    * Real-time live preview of bay height changes without requiring save operation
    * Bay height setting persists per-device in `config.json` under `devices[pci].bay.height`
* **Enhanced Preview System**
    * Optimized live preview performance by preventing chart recreation during configuration adjustments
    * Added `shouldRecreateCharts` parameter to `applyChangesToUI()` to control when charts rebuild
    * Chart recreation now occurs only on save/revert operations, not during slider movements
    * Preview changes no longer overwritten by 100ms update polling loop
* **CSS Architecture Improvements**
    * Bay height now properly applies to `.storage-unit` elements via CSS variables
    * Grid `gridAutoRows` dynamically updates alongside CSS variable changes
    * Fixed CSS variable scope precedence to ensure preview updates display correctly

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