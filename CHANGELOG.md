# Storage Dashboard - Change Log

## Version 28.10:
* **Smartctl-First Drive Temperatures**
    * Updated topology assembly to source drive temperatures from smartctl first for physically connected HBA drives.
    * Applied smartctl temperature lookup in both ircu-enriched topology and by-path fallback enrichment paths.
* **ZFS Temperature Fallback Path**
    * Retained ZFS-derived temperature values as fallback-only when smartctl has no temperature for a matched device.
    * Preserves pool/state mapping behavior while improving temperature coverage for unallocated disks.
* **Unallocated Drive Temperature Coverage**
    * Unallocated (purple) drives can now display temperature when smartctl data is available via device-path/base-device lookup.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.10.
* **Documentation Synchronization**
    * Updated `How_it_works.md` and wiki backend docs to document smartctl-first drive temperatures with ZFS fallback behavior.
    * Corrected stale backend references to config default generation paths (`py/config.py`) and aligned version references in wiki pages.

## Version 28.9:
* **Per-Device Live Preview Reliability**
    * Hardened per-device chassis card resolution for preview updates so style checkbox changes apply live on both left/right enclosures.
    * Added normalized key lookup handling for device/card key format differences.
* **Font Slider Consistency Normalization**
    * Standardized pixel slider value parsing and min/max clamping in menu panel sync logic.
    * Ensures all font-size sliders (including Disk ID) update with consistent behavior from saved config values.
* **Disk ID Font Scale Alignment**
    * Updated Disk ID font-size cap behavior to align with the same text cap path used by other bay text fields.
* **Bay Text Placeholder Artifact Removal**
    * Removed non-breaking-space placeholders for missing bay text fields and replaced them with empty strings.
    * Prevents font-size-dependent visual artifacts when Serial/Size/Pool/Index/Temperature are absent.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.9.

## Version 28.8:
* **Vertical Bay Short-Side Width Calibration**
    * Added a vertical-layout short-side width compensation factor so vertical bays visually match horizontal short-side proportions more closely.
    * Updated vertical fit behavior to width-fit only, preserving vertical long-side bay length.
* **Vertical Info-Panel Positioning and Span Tuning**
    * Adjusted vertical info-panel center offset and panel span constraints to improve spacing between LEDs, info text, and latch area.
    * Expanded vertical info-panel short-side span for better readability within the widened vertical bay footprint.
* **Configuration Synchronization**
    * Included current `config.json` style/runtime updates captured from live tuning.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.8.

## Version 28.7:
* **Section/Subsection Typography Linkage**
    * Linked subsection title font sizing to the Section Name font size variable across all menu and submenu panels.
    * Removed independent subsection size variable mapping to prevent visual drift between section and subsection headings.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.7.

## Version 28.6:
* **Legend Title Clarification**
    * Renamed Legend dropdown header from `ZFS Status` to `Status LED Legend`.
    * Improves label clarity by matching the panel's LED status indicator purpose.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.6.

## Version 28.5:
* **Update Progress Completion Visibility**
    * Added a short post-completion hold so the progress overlay clearly shows 100% before closing.
    * Ensures users can see the terminal completion state instead of an abrupt close at high-90s progression.
* **Progress Bar Highlight Color Alignment**
    * Updated the repository update progress bar fill to use configured menu highlight color variables.
    * Keeps update-progress styling consistent with the configured slider/control highlight path.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` markers to v28.5.

## Version 28.4:
* **Legend Dropdown Visibility Fix**
    * Removed the hardcoded hidden state on `#legend-chassis` so Legend visibility is controlled by the standard dropdown open class.
    * Eliminated stale Legend overlay selectors (`.legend-overlay-active` and overlay backdrop rules) that were no longer used in the dropdown workflow.
* **Legend Interaction Consistency**
    * Kept Legend on the same open/close behavior path as other menu dropdown panels to reduce regression risk.
* **Release Metadata Synchronization**
    * Updated `VERSION` and `README.md` to v28.4.

## Version 28.3:
* **Repository Update Progress Overlay**
    * Added a centered dashboard overlay during repository updates with a live progress bar and phase text.
    * Overlay now shows file download progress, install progress, and restart phase messaging.
* **Live Update Progress API**
    * Added backend progress state tracking for repo update jobs and exposed it via `GET /repo-sync-update-progress`.
    * Updated `POST /repo-sync-update` to launch an asynchronous background update job so frontend can poll real-time progress.
* **Frontend Progress Polling Integration**
    * Integrated progress polling into repository update workflow in `MenuSystem.js`.
    * Added resilient handling for restart-phase connection interruption so the user still sees completion feedback.

## Version 28.2:
* **Repository Update/Restart Reliability Fixes**
    * Removed stale `DiskInfo.js` from repo-sync tracked download list to prevent update failures against current releases.
    * Fixed `/repo-sync-repair` restored-file count handling and hardened startup trigger conditions.
    * Moved post-update/post-repair restart launch to run after HTTP response write so successful installs are not interrupted by immediate process restart.
    * Centralized startup launch path in backend for consistent restart behavior across update and manual restart endpoints.
* **Chassis Rendering Recovery**
    * Restored `style.css` dashboard layout/chassis blocks to a valid known-good baseline after a malformed CSS state caused broken chassis rendering.

## Version 28.1:
* **Legend Menu Behavior Normalization**
    * Reworked the Legend menu to use the same dropdown interaction model as other menu items.
    * Removed legend-specific tinted overlay/backdrop behavior so interactions remain consistent across menu items.
* **Centralized Menu Border/Corner Constants**
    * Added a unified menu constants block in `Menu.css` for shared border-width and corner-radius values.
    * Updated menu panels, submenu sections, controls, modal shell, and status pills to consume shared constants for uniform boundaries.
* **Menu Surface Alignment**
    * Updated menu wrapper/panel wiring for Legend to align with standard dropdown containers and consistent panel anchoring.

## Version 28.0:
* **Rewrite Cleanup and Obsolete Code Removal**
    * Removed obsolete legacy `DiskInfo.js` runtime helper and aligned documentation references to active disk formatting in `js/topology.js`.
    * Removed the deactivated legacy Disk Arrays CSS block from `Menu.css` to keep one maintained style path.
* **Hardcoded Style Reduction**
    * Converted key hardcoded UI colors (alert strip, temperature severity text/shadows, modal shell, action buttons, and services status pills) to CSS-variable-backed theming.
    * Extended `py/config.py` defaults and `js/styleVars.js` mapping to support new optional theme variables under `ui.alerts`, `ui.menu.actions`, `ui.menu.modal`, and `ui.menu.services`.
* **Overlay and Runtime Consistency**
    * Fixed legend overlay backdrop state handling and added Escape key close behavior for consistent overlay UX.
    * Added optional runtime interval controls (`ui.runtime.data_fetch_interval_ms`, `ui.runtime.alert_beep_interval_ms`) and removed duplicated timing/color magic values in frontend JS.
* **Metadata Synchronization**
    * Updated `VERSION`, README release marker, and dashboard HTML title to v28.0.

## Version 27.4:
* **Documentation and Version Synchronization**
    * Updated `README.md` to reflect current v27.x capabilities, including Services monitoring, Repository Sync, kiosk-safe modal confirmations, and restored Drive Bay controls.
    * Updated stale version markers and outdated references across documentation and wiki files.
* **Configuration Example Refresh**
    * Updated customization examples to use current normalized values (`fill_order: left_to_right`) and active bay grill setting key (`grill_size_scale`).
    * Corrected config reference guidance to align with current default generation source (`py/config.py`).
* **UI Metadata Alignment**
    * Updated dashboard HTML page title to current release naming (`Storage Dashboard v27.4`).

## Version 27.3:
* **Drive Bay Menu Controls Restored**
    * Reinstalled missing per-enclosure Drive Bay control groups that were no longer visible in the Disk Arrays menu.
    * Restored `Chassis Configuration` and `Grill` subsections for each enclosure.
* **Per-Bay Typography Controls Reinstated**
    * Restored per-enclosure text controls for `Serial`, `Size`, `Drive Temp`, `Pool Name`, and `ID`.
    * Restored per-field `Font Name`, `Font Size`, `Font Style`, and `Colour` controls mapped to `devices.<enclosure>.bay.*` paths.

## Version 27.2:
* **Kiosk-Safe Modal Confirmations**
    * Replaced browser-native confirmation popups with dashboard modal confirmations for actions that require approval.
    * Added reusable in-app modal behavior for `Download Update`, `Restore Files`, and `Reset Settings` workflows.
* **Browser Compatibility Improvement**
    * Removed dependency on blocked browser `window.confirm` dialogs so confirmation prompts work in restricted browser environments.
    * Preserved existing action safety by requiring explicit user confirmation via in-dashboard modals.

## Version 27.1:
* **Menu Interaction Refinements**
    * Updated menu switching behavior so opening one menu item closes any other open menu/dropdown.
    * Added consistent cross-menu close behavior between standard dropdowns and the Legend panel.
* **Legend Overlay Simplification**
    * Removed dark backdrop overlay activation when opening the Legend panel.
    * Preserved Legend popup toggle behavior without dimming the rest of the dashboard.
* **Services Panel Sizing Tuning**
    * Adjusted Services dropdown sizing to shrink-wrap content instead of using excess panel width.
    * Kept responsive maximum width constraints for smaller screens.

## Version 27.0:
* **TrueNAS Services Monitoring (Auto-Start Scope)**
    * Added backend service discovery using TrueNAS API (`midclt call service.query`).
    * Implemented filtering to track only services configured to Start Automatically.
    * Exposed tracked service status payload in `/data` with running/stopped state and query diagnostics.
* **New Services Menu and Status Panel**
    * Added new `Services` menu item to the left of `Legend` in the top menu bar.
    * Added services dropdown panel listing tracked service names and live `Running` / `Stopped` status badges.
    * Added in-panel status note showing tracking scope and query error feedback.
* **Service Stop Alarm Integration and Visual Attention**
    * Integrated stopped tracked-service detection into existing global alert logic.
    * Services menu label now turns red and blinks once per second when one or more tracked services are stopped.
    * Services menu visual alert clears automatically when all tracked auto-start services return to running state.

## Version 26.6:
* **Menu Font Controls Integrated into Main Menu Section**
    * Merged font-size and font-style controls directly into the Dashboard Menu section (removed separate Menu Font subsection block).
    * Bound controls end-to-end to `ui.menu.size` and `ui.menu.style` so menu typography updates are reflected in both live preview and runtime rendering.
* **Menu Bar Font Style Activation Fix**
    * Removed hardcoded bold overrides on menu button hover/active states that masked configured menu font style values.
    * Updated active-state highlighting to use underline/brightness effects so configured Bold/Italic/AllCaps/SmallCaps settings remain visible.
* **Menu Typography Runtime Consistency Improvements**
    * Added/extended runtime and preview variable mapping for menu typography and defaults (`ui.menu.style`) across config and style pipelines.
    * Ensured menu font controls apply consistently to top menu bar and dropdown panel text styling.

## Version 26.5:
* **Menu Runtime Styling Consistency Fixes**
    * Fixed runtime CSS variable application so dropdown/submenu background color reliably follows the configured Menu background color.
    * Added runtime menu typography variable mapping to keep section/subsection style rendering consistent across live updates.
* **Subsection Menu Control Reliability**
    * Added missing `ui.menu.subsection_name` defaults to active configuration payloads for immediate control availability.
    * Fixed slider value parsing so legacy typography values no longer produce `NaNpx` in the Dashboard Menu panel.
* **Typography Unit Migration for Menu Settings**
    * Added backend one-time normalization converting legacy `pt` values to `px` for `ui.menu` typography size fields during config load.
    * Ensures stable slider behavior and persistent compatibility for older menu typography configurations.

## Version 26.4:
* **Dashboard Menu Subsection Typography Controls**
    * Added `Subsection Menu` controls under Dashboard Menu with end-to-end support for `Font Size` and `Font Style`.
    * Wired new config paths `ui.menu.subsection_name.size` and `ui.menu.subsection_name.style` through menu builders, config defaults, and live CSS variable preview.
    * Updated submenu title styling to use dedicated subsection typography variables with section-title fallback behavior.
* **Dropdown Background Color Alignment**
    * Updated dropdown panel background behavior so it follows the main Menu background color.
    * Retained legacy `dropdown_background` config key for backward compatibility while removing its visual precedence.

## Version 26.3:
* **Repository Sync Toggle Menu-Reload Fix**
    * Fixed issue where toggling "Allow manual update checks and downloading and restoring of missing file(s)" caused the menu to close.
    * Updated repo-sync enable endpoint to apply runtime state without rewriting `config.json`, preventing dev live-reload refresh from being triggered.
    * Preserved immediate toggle behavior for Repository Sync actions while keeping menu interactions stable.
* **Version Format Compatibility Update**
    * Updated local version parsing to support `v.26.3` style values in addition to `v26.3` and `v26.3.0` style tags.
    * Ensures local version reporting and update comparison remain reliable across accepted version formats.

## Version 26.2:
* **Repository Sync Menu UX and Wrapping Improvements**
    * Updated Repository Sync permission text layout so long text fits panel width and wraps cleanly.
    * Kept Repository Sync actions responsive while preserving the existing menu container bounds.
* **Local Version Resolution Hardening**
    * Added explicit local `VERSION` file support for reporting installed dashboard version.
    * Updated version parsing to support both `vX.Y` and `vX.Y.Z` formats.
    * Prevents `Local unknown` display when using two-part release tags.
* **Repository Update Install Workflow**
    * Added dynamic primary action behavior: `CHECK UPDATES` changes to `DOWNLOAD UPDATE` when an update is available.
    * Added backend update installation endpoint that downloads tracked files, verifies writes, and only triggers `start_up.sh` after complete successful install.
* **Non-Dirty Repo Sync Controls**
    * Repository Sync enable/disable checkbox now persists immediately through backend endpoint without activating `SAVE`/`REVERT` dirty state.
    * Repository status checks and update checks remain non-dirty actions and do not activate `SAVE`/`REVERT`.

## Version 26.1:
* **Dashboard Alerts Menu Section**
    * Added a new `Alerts` section in the Dashboard menu above `Reset`.
    * Added `MUTE` action button to silence active alarm beeps for 5 minutes.
    * Added alerts status text line in-menu to show current alert/mute state.
* **5-Minute Unified Mute (Host + Dashboard)**
    * Added backend `/alerts-mute-5m` endpoint and mute countdown state shared through `/data`.
    * Host-side repeating alarm beeps are now suppressed during active mute countdown.
    * Dashboard-side repeating alarm beeps are now suppressed during active mute countdown.
* **Mute Button State Logic and Countdown Label**
    * `MUTE` button is disabled when no alerts are active.
    * `MUTE` button is enabled when alerts are active and no countdown is running.
    * `MUTE` button is disabled while mute countdown is active and shows live `MUTED MM:SS` text.

## Version 26.0:
* **Named Dashboard Alert Triggers (No Severity Levels)**
    * Added three binary alert triggers for attention-only monitoring: `Pool Health Alert`, `Disk Fault/Error Alert`, and `High Temperature Alert`.
    * Pool alert now activates whenever any pool state is not `ONLINE`.
    * Disk alert now activates on fault/offline-style disk states or non-zero ZFS read/write/checksum error counters.
    * Temperature alert now activates whenever any detected drive temperature exceeds `40C`.
* **2-Second Repeating Alarm Beep (Host + Dashboard)**
    * Added backend alert monitor loop that evaluates active alerts and triggers a host-side beep every 2 seconds while any alert is active.
    * Added frontend dashboard beep loop using browser audio at the same 2-second cadence while alerts remain active.
    * Included terminal bell fallback when host `beep` utility is unavailable.
* **Alert State Surfaced in `/data` and On-Screen Banner**
    * Added alert payload to `/data` response with active trigger names and count.
    * Added dashboard alert strip showing active alert names to provide immediate visual attention alongside audible alarms.

## Version 25.3:
* **Repository Sync Menu UI Refinement**
    * Simplified the Repository Sync toggle layout by removing the redundant "Enable GitHub sync" label and consolidating the checkbox with descriptive text.
    * Updated checkbox label to "Allow manual update checks and downloading and restoring of missing file(s)" for clarity.
    * Applied CSS grid layout and alignment fixes to ensure checkbox and text display on a single line without overflow.
* **Auto-Restart on Missing File Restoration**
    * Enhanced `/repo-sync-repair` endpoint to automatically run `start_up.sh` after successfully restoring missing tracked files.
    * Added `startup_initiated` flag to response payload to indicate whether post-restore restart was triggered.
    * Ensures restored files are immediately applied without requiring manual service restart.

## Version 25.2:
* **Customization Guide Modernization (Menu-First Workflow)**
    * Rewrote `CUSTOMIZATION_GUIDE.md` to reflect the current in-app menu workflow (`SAVE`, `REVERT`, `RESET ALL`) as the primary customization path.
    * Added practical, current examples for global styling, per-enclosure layout overrides, and decoration/grill tuning.
    * Clarified when manual `config.json` editing is still useful (bulk edits, migration, scripted deployment, recovery).
* **Documentation Reference Alignment**
    * Updated `README.md`, `CONFIG_GUIDE.md`, and local wiki pages to describe `CUSTOMIZATION_GUIDE.md` as menu-first guidance plus advanced manual overrides.
    * Removed outdated wording that implied manual config editing as the default customization workflow.
* **GitHub Wiki Consistency Update**
    * Synced `Installation.md`, `FileOverview.md`, and `ManualConfiguration.md` in the GitHub wiki repository.
    * Normalized wiki links so customization references resolve correctly in the GitHub wiki context.

## Version 25.1:
* **Texture Utility File Rename**
    * Renamed shared texture utility file from `scratchTexture.js` to `DecorationTexture.js`.
    * Updated script loading in `index.html` to reference `DecorationTexture.js`.
    * Kept runtime global compatibility via `window.DashboardDecorationTexture`.
* **Code and Documentation Reference Alignment**
    * Updated runtime comments and developer notes to use `DecorationTexture.js` naming.
    * Updated README and architecture documentation (`How_it_works.md`) to reflect the new file name.
    * Updated local wiki pages and GitHub wiki pages so file maps and script-order references match runtime.
* **Scratch Prefix Cleanup Standardization**
    * Replaced remaining `scratch*` naming references with `decoration*` terminology across documentation and changelog entries where applicable.
    * Verified there are no remaining `scratchTexture.js`, `DashboardScratchTexture`, or `scratch*` references in tracked source and docs.

## Version 25.0:
* **Major Frontend Refactor to Modular Architecture**
    * Split large runtime logic from `app.js` into focused modules under `js/` (`data.js`, `topology.js`, `styleVars.js`, `renderer.js`, `utils.js`).
    * Rewrote `app.js` as a thin orchestration layer for polling, rendering, and Activity Monitor lifecycle management.
    * Added incremental DOM-diff rendering in `js/renderer.js` to avoid full chassis rebuilds when only disk state changes.
* **Menu System Refactor and Separation of Concerns**
    * Reworked `MenuSystem.js` into a thinner controller and extracted dedicated modules for state, preview styling, and panel markup generation.
    * Added `js/configStore.js`, `js/stylePreview.js`, and `js/menuBuilder.js` for improved maintainability and clearer ownership of menu logic.
    * Updated script loading so `MenuSystem.js` runs as an ES module.
* **Backend Service Refactor While Preserving Entry Point**
    * Split backend logic from `service.py` into `py/topology.py`, `py/config.py`, and `py/server.py` while keeping `service.py` as the startup entry point used by `start_up.sh`.
    * Added `py/__init__.py` to support package-style imports for extracted server modules.
    * Kept existing `/data`, `/save-config`, `/reset-config`, and activity endpoints intact through the refactor.

## Version 24.9:
* **Chassis Container Fill Scaling**
    * Single-chassis layouts now scale to 95% of the available container width with height and bay geometry adjusting proportionally.
    * Two-or-more chassis layouts now each fill half the available row width (accounting for the inter-card gap) so both cards fill the full row with no excess whitespace.
    * Odd-count chassis (3, 5, …) continue to center the last card on its own row via existing flex-wrap layout behavior.
    * The 19-inch rack-width clamp is retained throughout; it is now scaled to match the per-layout target width so proportional chassis sizing is preserved.
    * Gap is read from the live computed canvas style so customized `--dashboard-gap` values are respected automatically.
* **"Decoration" Naming Standardization Across All Files**
    * Standardized user-visible menu labels to `Decoration Level / Density / Intensity` in Activity Monitor and per-enclosure Disk Arrays panels.
    * Standardized `config.json` keys to `decoration_level / decoration_density / decoration_intensity`.
    * Standardized internal JS identifiers, CSS variables (`--activity-random-decorations`, `--enc-chassis-decorations`), and the shared texture utility (`DashboardDecorationTexture`) for consistency.
    * Updated `WIKI/ManualConfiguration.md` and the GitHub-hosted wiki to reflect the new terminology.

## Version 24.8:
* **Drive-Bay Container Transparency for Decoration Visibility**
    * Made the shared drive-bay holder container transparent so chassis decoration textures remain visible behind bay grids.
    * Applied via the common `.chassis-body` style path, covering both horizontal and vertically aligned chassis layouts.
    * Preserved existing bay shell, latch, LED, and metadata styling while removing the opaque underlay.

## Version 24.7:
* **Menu and Submenu Flow Reordering**
    * Reorganized top-level menu flow and subsection ordering for a more logical customization sequence.
    * Reordered Activity Monitor, Dashboard, and Disk Arrays panel content to group related controls and reduce navigation friction.
    * Preserved existing control behavior and data bindings while updating presentation order only.
* **Bay LED Edge Alignment Refinements**
    * Adjusted vertical and horizontal LED panel edge offsets so LED groups sit closer to their bay edges with more consistent visual balance.
    * Tuned per-orientation LED panel sizing/padding to keep alignment stable across scene-scale changes.
* **Info Container Expansion Tuning**
    * Expanded horizontal info-container usable space toward the LED side.
    * Expanded vertical info-container usable space toward the latch side while preserving latch-clearance safeguards.
    * Kept vertical text rendering/flicker stability protections intact.

## Version 24.6:
* **Vertical Bay LED-to-Info Proportion Adjustment**
    * Increased spacing between the vertical LED panel and rotated info panel to better match horizontal bay visual proportions.
    * Applied scale-aware offset logic so spacing remains consistent across scene-scale and bay-scale changes.
* **Vertical Info Panel Latch-Clearance Safeguard**
    * Added vertical info-panel height constraints to prevent rotated metadata text from overlapping the latch area.
    * Preserved existing vertical text layout and flicker-stability behavior while enforcing latch-safe bounds.
* **Targeted Vertical CSS Refinement**
    * Final adjustments were limited to vertical info-panel geometry in `style.css` with no horizontal rendering changes.

## Version 24.5:
* **Decoration Pattern Stability Fix (Mirror/Live Refresh Safe)**
    * Fixed chassis decoration patterns changing during normal dashboard data refresh and mirror access.
    * Kept decoration textures stable unless decoration sliders (`level`, `density`, `intensity`) are changed.
* **Deterministic Decoration Generation Standardization**
    * Switched decoration generation to deterministic seeded output keyed by slider values, eliminating random cross-refresh variation.
    * Ensured Activity and Disk Arrays chassis paths resolve to the same decoration texture for identical slider settings.
* **Shared Decoration Utility Cleanup**
    * Added shared `DecorationTexture.js` as the single source of truth for decoration texture generation.
    * Removed duplicated decoration generator implementations from `app.js` and `MenuSystem.js`.
    * Updated script load order in `index.html` so shared utility is available before menu and app runtime logic.

## Version 24.4:
* **Vertical Bay Info-Panel Flicker Stabilization**
    * Fixed vertical drive-bay info text flicker that was visually coupling to LED blink animation repaints.
    * Applied compositor/paint isolation directly on the original vertical info panel path (`translateZ(0)`, `backface-visibility`, `contain: paint`) to stabilize text rendering.
* **Vertical Layout Preservation and Regression Recovery**
    * Restored original vertical info-panel geometry and rendering structure after wrapper-based experiments caused clipping regressions.
    * Kept horizontal bay rendering and ordering unchanged while ensuring vertical bays again show full Serial/Size/Temp/Pool/ID information.
* **Targeted CSS-Only Finalization**
    * Final fix was constrained to the vertical info-panel CSS path to minimize risk and preserve established bay sizing behavior.

## Version 24.3:
* **Activity Monitor Geometry-Scale Synchronization**
    * Updated Activity Monitor layout flow so chart card geometry reflows whenever dashboard scene scale or container dimensions change.
    * Added ResizeObserver-based reflow triggers on the activity chassis and parent container to catch runtime geometry changes beyond window resize events.
    * Added layout-signature tracking to avoid redundant width recomputation while keeping card sizing responsive.
* **Chart Internal Text and Style Runtime Scaling**
    * Added runtime Chart.js style refresh so y-axis label font size tracks scene-scale updates in real time.
    * Synced y-axis tick color, grid color, and line rendering properties with active style variables during live updates.
    * Applied chart resize/update on style changes so canvas-rendered chart text stays aligned with dashboard geometry scaling.
* **Activity Monitor Lifecycle Stability**
    * Added scheduled reflow/style refresh orchestration via requestAnimationFrame to reduce layout thrash under rapid updates.
    * Added explicit observer/listener cleanup in destroy path to prevent stale scaling callbacks.

## Version 24.2:
* **Disk Arrays Menu Value Hydration Hardening**
    * Added comprehensive menu-path hydration so dynamic Disk Arrays controls initialize from persisted config values instead of falling back to UI defaults.
    * Added silent backfill for missing per-device menu keys and immediate persistence to `config.json` via `/save-config`.
    * Ensured hydration runs during initialization and topology/menu rebuild cycles so controls remain stable after runtime updates.
* **Legacy Bay Value Normalization for Radio Controls**
    * Added normalization for legacy bay layout and fill-order values (including `row_major_ltr`, `column_major_ttb`, and shorthand aliases) so menu radios map to current option values.
    * Added legacy `drive_sequence` fallback mapping for older configurations missing canonical `fill_order`/`layout` keys.
    * Updated panel sync logic to render normalized values consistently for radio/select controls and persist canonical values.
* **Configuration Consistency Improvements**
    * Prevented stale legacy values from leaving radio groups visually unselected.
    * Unified menu-state read/write behavior so displayed control state always reflects effective runtime configuration.

## Version 24.1:
* **Unified Scene-Scale Geometry Refinement**
    * Reworked runtime scaling so chassis, bays, legend, menu shell, and activity cards use the same scene-scale pathway.
    * Removed mixed mobile-only bay text scaling paths and replaced them with unified per-scene scaling behavior.
    * Updated Activity Monitor sizing and y-axis label sizing to respect the shared dashboard scale factor.
* **Chassis Width and Centering Corrections**
    * Added a 19-inch-equivalent maximum render width for each enclosure chassis so cards do not over-expand on wide containers.
    * Centered chassis rows inside the dashboard canvas when available space exceeds capped chassis width.
    * Removed a conflicting small-screen `width: 100%` chassis rule that previously bypassed the width cap.
* **Legend and Menu Layout Stability**
    * Fixed legend overlay sizing so the legend panel shrinks to content instead of forcing an oversized minimum width.
    * Updated menu shell/button/dropdown dimensions to scale from the same dashboard scene factor.
    * Removed special-case menu wrapping behavior so line breaks occur naturally only when content truly exceeds available width.
* **Bay Geometry and Text-Fit Corrections**
    * Restored true bay long/short physical ratio handling for vertical and horizontal layouts.
    * Added a final bay-grid fit pass so bay shells always fit inside the enclosure body bounds.
    * Added bay-internal content fit scaling and per-bay text caps to keep Serial/Size/Pool/Index/Temp/ID labels inside each bay on smaller displays.
    * Refined vertical bay info-block geometry to use centered, proportion-based dimensions instead of brittle offset heuristics.
* **Visual Containment Safeguards**
    * Changed chassis body overflow handling to prevent bay overflow artifacts when display area is constrained.

## Version 24.0:
* **Container Queries: Responsive Scaling for Embedded Environments**
    * Replaced all viewport-based scaling (`vw`/`vh`) with CSS Container Queries (`cqw`/`cqh`) for better iframe/embedded support.
    * Added `container-type: inline-size` declarations to body, `#dashboard-wrapper`, `#menu-bar`, and `#activity-chassis` for responsive context.
    * Updated Configuration values: all `*vw` font sizes now use `*cqw` (e.g., `1.1vw` → `1.1cqw`).
    * Updated CSS max-width constraints to use container units: `98vw` → `98cqw`, `95vw` → `95cqw`, `100vw` → `100cqw`.
    * Updated JavaScript scaling calculations to use container element widths instead of viewport dimensions.
* **JavaScript Layout Reflow Improvements**
    * Updated `ActivityMonitor.js` `reflowLayout()` to calculate chart columns based on container width, not viewport width.
    * Updated `app.js` render function to derive available width from `#dashboard-wrapper` container instead of `window.innerWidth`.
    * Maintains fallback to viewport dimensions for unsupported browsers or edge cases.
* **Benefits**
    * Dashboard now scales correctly in iframes (Home Assistant, other embedded contexts).
    * Each container independently tracks its own width, enabling nested/multi-container scenarios without recalculation.
    * Maintains full browser compatibility: modern browsers use CQ logic, older browsers degrade gracefully to fallback values.
    * No visual changes to dashboard appearance—pure scaling infrastructure improvement.

## Version 23.9:
* **Single-Enclosure Bay Content Scaling**
    * Added proportional bay-content scaling for single-enclosure layouts so latch size, bay numbers, LEDs, and disk metadata scale with chassis growth.
    * Kept two-enclosure layouts at baseline sizing for predictable side-by-side rendering.
    * Applied scale-aware spacing and positioning updates for vertical bay info blocks to preserve alignment.
* **Per-Enclosure Drive Bay Typography Controls**
    * Added Drive Bay submenu controls per enclosure for `Pool Name`, `ID`, `Serial`, `Size`, and `Drive Temp` typography.
    * Added per-field controls for `Font Name`, `Font Size`, `Font Style`, and `Colour`, saved under `devices.<enclosure>.bay.*`.
    * Removed global Drive Temperature typography controls from the top Disk Arrays panel and moved customization to per-enclosure scope.
* **Typography Override and Specificity Fixes**
    * Fixed CSS specificity conflicts so per-field font-size settings apply correctly in both live preview and saved render paths.
    * Applied the same specificity fixes for horizontal and vertical bay layouts across Pool/ID/Serial/Size/Temp values.
* **Activity Monitor Manual Graph Resizing**
    * Added `Graphs > Manual Size` controls in Activity Monitor for chart dimensions.
    * Added `Height` slider mapping `0-100` to `25px-150px` (`chart.dimensions.chartHeight`).
    * Added `Length` slider mapping `0-100` to `100px-500px` (`chart.dimensions.cardWidth`).
    * Wired slider mapping logic end-to-end for live preview and persisted config updates.
* **Wiki and Documentation Synchronization**
    * Updated repository wiki pages to match current runtime architecture and configuration behavior.
    * Synced the same page updates to the GitHub hosted wiki so repository docs and wiki docs are aligned.

## Version 23.8:
* **Single-Enclosure Bay Content Scaling**
    * Added proportional bay-content scaling for single-enclosure layouts so latch size, bay numbers, LEDs, and disk metadata scale with chassis growth.
    * Kept two-enclosure layouts at baseline sizing for predictable side-by-side rendering.
    * Applied scale-aware spacing and positioning updates for vertical bay info blocks to preserve alignment.
* **Per-Enclosure Drive Bay Typography Controls**
    * Added Drive Bay submenu controls per enclosure for `Pool Name`, `ID`, `Serial`, `Size`, and `Drive Temp` typography.
    * Added per-field controls for `Font Name`, `Font Size`, `Font Style`, and `Colour`, saved under `devices.<enclosure>.bay.*`.
    * Removed global Drive Temperature typography controls from the top Disk Arrays panel and moved customization to per-enclosure scope.
* **Typography Override and Specificity Fixes**
    * Fixed CSS specificity conflicts so per-field font-size settings apply correctly in both live preview and saved render paths.
    * Applied the same specificity fixes for horizontal and vertical bay layouts across Pool/ID/Serial/Size/Temp values.
* **Activity Monitor Manual Graph Resizing**
    * Added `Graphs > Manual Size` controls in Activity Monitor for chart dimensions.
    * Added `Height` slider mapping `0-100` to `25px-150px` (`chart.dimensions.chartHeight`).
    * Added `Length` slider mapping `0-100` to `100px-500px` (`chart.dimensions.cardWidth`).
    * Wired slider mapping logic end-to-end for live preview and persisted config updates.
* **Wiki and Documentation Synchronization**
    * Updated repository wiki pages to match current runtime architecture and configuration behavior.
    * Synced the same page updates to the GitHub hosted wiki so repository docs and wiki docs are aligned.

## Version 23.8:
* **Menu Runtime Soft Modularization (No Behavior Change)**
    * Moved full menu runtime logic into `MenuSystem.js` and restored `livereload.js` to a focused dev-only auto-reload helper.
    * Updated script load order so menu runtime remains initialized before `app.js` render orchestration.
    * Preserved existing cross-module runtime integration (`window.__previewConfig__`, `window.MenuLivePreview`, and dashboard update events).
* **Disk Arrays Per-Enclosure Chassis Configuration Controls**
    * Added new `Chassis Configuration` subsection under each Disk Arrays enclosure panel.
    * Added per-enclosure `Bay Orientation` radio controls (`Vertical` / `Horizontal`) mapped to `devices.<enclosure>.bay.layout`.
    * Added per-enclosure `Bay Order` radio controls (`Left-to-Right` / `Top-to-Bottom`) mapped to `devices.<enclosure>.bay.fill_order`.
    * Wired both controls into live preview and save/revert workflows so changes apply immediately and persist in `config.json`.
* **Orientation/Grid Rendering Stability Refinements**
    * Fixed preview-render path so enclosure model generation consumes active preview config, not only persisted backend config.
    * Updated grid resolution to use preset-first chassis defaults for deterministic layout behavior by rack-unit and orientation.
    * Preserved horizontal per-enclosure grid overrides while isolating vertical layout from incompatible legacy horizontal grid values.
    * Corrected fallback precedence that caused some horizontal enclosures to flatten into a single row.

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
    * Added random decoration controls (level, density, intensity) for the Activity Monitor chassis finish.
    * Added graph typography controls for title, legend text, and y-axis label sizing.
    * Added derived subheading color behavior so the Activity Monitor subtitle tracks as a darker shade of server-name color.
* **Dashboard Menu Rebuild and Dropdown Behavior**
    * Reworked top menu into structured dropdown panels for Dashboard, Activity Monitor, and Disk Arrays.
    * Added menu dropdown transparency slider (0-100 mapped to 0.5-1.0 opacity).
    * Added robust live-preview synchronization across menu controls and chart recreation triggers.
* **Disk Arrays Dynamic Per-Enclosure Controls (Phase 1/2/Chassis Wiring)**
    * Added dynamic `Disk Arrays` menu generation based on discovered enclosures.
    * Added per-enclosure `Chassis` settings (color, decoration controls, server-name typography/color, enclosure ID subtitle color).
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
    * Reintroduced a clean top menu bar shell from a fresh baseline while keeping SAVE/REVERT workflow behavior.
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