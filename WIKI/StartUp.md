# start_up.sh — purpose and behavior

`start_up.sh` is the small helper script used to (re)start the Python service on TrueNAS.

What it does:

- Changes into the script directory so relative paths resolve correctly.
- Kills any running instance of `service.py` using `pkill -9 -f` to avoid port conflicts.
- Clears Python bytecode caches (`__pycache__`).
- Sleeps 1 second.
- Launches `service.py` with `nohup python3 service.py > /dev/null 2>&1 &` so it runs in the background.

When the front-end requests a configuration-triggered restart (for example when changing the listening port) the server calls this script via `subprocess` to perform the restart.

If you prefer system-managed startup, create an Init/Shutdown script in the TrueNAS UI or a systemd unit that runs `start_up.sh` on boot instead of relying on `nohup`.
