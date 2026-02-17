# Installation

## System Requirements

**Primary Target:** TrueNAS Scale

**Also Supported:** Linux distributions with ZFS (Ubuntu, Debian, Proxmox, etc.)

**File System:** ZFS is **required**. Does NOT work with ext4, btrfs, LVM, or other file systems.

**Requirements:**
1. Linux OS (Ubuntu 20.04+, Debian 11+, Proxmox 7+, or equivalent)
2. ZFS installed and configured
3. Python 3.6+
4. Available HTTP port (default 8010)

## Installation Steps - TrueNAS Scale

Follow these steps to install and run the dashboard on TrueNAS Scale (summary of the README installation section).

1. SSH into the TrueNAS Scale console.
2. Create a directory on one of your pools and copy the repository files there:

```bash
mkdir -p /mnt/[Pool_Name]/scripts/dashboard
cd /mnt/[Pool_Name]/scripts/dashboard
# use WinSCP or your preferred copy tool to upload files
```

3. Set executable permissions for the service and helper script:

```bash
chmod +x /mnt/[Pool_Name]/scripts/dashboard/service.py
chmod +x /mnt/[Pool_Name]/scripts/dashboard/start_up.sh
```

4. Run the service for testing:

```bash
./start_up.sh
```

You should see a short startup trace. Verify the process is running with:

```bash
ps aux | grep service.py
```

5. (Optional) Add an Init/Shutdown script in the TrueNAS web UI to run the `start_up.sh` at boot. See the README for suggested settings.

## Installation Steps - Other Linux Distributions

For Ubuntu, Debian, Proxmox, or other Linux distributions with ZFS:

1. Ensure ZFS is installed and configured:
```bash
# Verify ZFS is available
zfs list
zpool list
```

2. Create a directory to house the dashboard (anywhere with read access to ZFS):
```bash
mkdir -p /opt/zfs-dashboard  # or any preferred location
cd /opt/zfs-dashboard
```

3. Copy all repository files to this directory (using git, scp, or your preferred method).

4. Set executable permissions:
```bash
chmod +x service.py start_up.sh
```

5. Run the service:
```bash
./start_up.sh
```

6. Access the dashboard at `http://localhost:8010` (or your configured port).

7. **Automation (Optional):**
   - **systemd:** Create `/etc/systemd/system/zfs-dashboard.service` to auto-start the service
   - **cron:** Add `@reboot /opt/zfs-dashboard/start_up.sh` to root crontab

**Note:** The TrueNAS API (`midclt`) will not be available on non-TrueNAS systems. The dashboard will automatically use `zpool status` parsing instead, with identical functionality.

## Important: Pool Dependency & Reliability

### The Issue
Installing the dashboard on a data pool creates a **critical dependency:** if that pool goes offline, the dashboard service cannot run. You lose monitoring visibility precisely when you need it most to diagnose the problem.

### TrueNAS Scale Users
The installation steps above place the dashboard on a data pool for simplicity. For production deployments, consider:

**Option 1: Use Boot Pool (Not Recommended)**
- Install to `/mnt/boot-pool/scripts/dashboard` instead
- Caveat: Boot pool is small (~4GB) and should remain lightweight

**Option 2: Custom Root Installation (Recommended)**
- Install to a directory independent of pools (requires TrueNAS customization)
- Ensures dashboard runs even if all data pools fail
- Contact TrueNAS community for methods to safely install outside pools

**Option 3: Docker Container (Recommended for High Availability)**
- Docker runs from root filesystem
- Independent of pool state
- Adds container management overhead but maximizes reliability

**Option 4: Accept the Dependency**
- Use pool mirroring/raidz to minimize offline risk
- Acceptable for home labs where redundancy is sufficient

### Non-TrueNAS Linux Users
You have the advantage: installing to `/opt/zfs-dashboard` means the dashboard is **completely independent** of pool state. Only the ZFS command-line tools need pool access.

## General Notes

Notes:
- Default web port: `8010` (configured in `config.json`).
- If `config.json` is missing or malformed the service will regenerate a default config on startup.
- For configuration details, see [CONFIG_GUIDE.md](../CONFIG_GUIDE.md) and [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md).
