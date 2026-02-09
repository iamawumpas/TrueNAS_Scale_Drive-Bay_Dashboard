# Manual configuration

This page collects pointers for manual edits and references to the canonical guides.

1. Primary configuration file: `config.json` (see [CONFIG_GUIDE.md](../CONFIG_GUIDE.md)).

   Note: `CONFIG_GUIDE.md` has been updated to match the authoritative `config.json` shape. Use that guide as the canonical reference when editing `config.json`.

2. Visual/theming options: `config.json` contains `fonts`, `fontSizes`, `fontStyles`, and `colors` used by the front-end. See [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md) for examples.

3. To force a restart after changing the listening port or other network settings, the front-end triggers `GET /trigger-restart`. The server will run `start_up.sh` to perform the restart — you can also run `start_up.sh` manually.

4. If you break `config.json`:
   - Delete the file and restart `service.py`; it will generate a default config from the hardcoded defaults in `service.py`.
   - Check `service.py` console output for JSON parse errors to find the offending line.

5. Where to look for up-to-date guidance:
   - Release history and features: [CHANGELOG.md](../CHANGELOG.md)
   - Primary configuration reference: [CONFIG_GUIDE.md](../CONFIG_GUIDE.md)
   - Styling and theming: [CUSTOMIZATION_GUIDE.md](../CUSTOMIZATION_GUIDE.md)

If you want me to publish these pages to the repository wiki (GitHub wiki), I can push these files to the remote wiki repo or create a lightweight `docs/` branch — tell me which you prefer.
