# Installation

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

Notes:
- Default web port: `8010` (configured in `config.json`).
- If `config.json` is missing or malformed the service will regenerate a default config on startup.
- For configuration details, see [CONFIG_GUIDE.md](../CONFIG_GUIDE.md) and [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md).
