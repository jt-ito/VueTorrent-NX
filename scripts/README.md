# VueTorrent Auto-Exclusion Background Hook

This folder contains background auto-exclusion scripts bundled with VueTorrent.

These scripts allow qBittorrent to automatically set excluded files (e.g. `.exe`, `.lnk`, `.bat`) to **Do Not Download (Priority 0)** in the background whenever a torrent is added, even when VueTorrent is **not open** in your browser.

## How It Works

1. qBittorrent calls this hook immediately when any torrent is added (via magnet link, RSS feed, Sonarr/Radarr, or external client).
2. The script queries qBittorrent's preferences API (`/api/v2/app/preferences`) to get whatever file exclusions you configured in VueTorrent. Any exclusions you add or edit in VueTorrent are **automatically respected**.
3. If the torrent is a magnet link, the script waits for metadata to arrive.
4. It matches the torrent's files against your exclusions and sends a `filePrio` update setting matched files to Priority 0 (`DO_NOT_DOWNLOAD`).

## Universal Compatibility (Zero Extra Software Needed)

- **Docker & Linux**: Uses `auto_exclude.sh`. Works using `/bin/sh`, `curl`, and `awk` already built into Linux, Alpine, and Docker containers (or uses `python3` if present, such as in `linuxserver/qbittorrent`).
- **macOS**: Uses `auto_exclude.sh` natively.
- **Windows**: Uses `auto_exclude.ps1` natively using Windows PowerShell (or `python` if installed).
- **Universal Python**: `auto_exclude.py` is also available for any environment with Python 3.6+.

## qBittorrent Configuration

In qBittorrent, go to **Options -> Downloads -> Run external program**:
Check **Run external program on torrent added** and paste the command for your OS:

### Linux / Docker:
```sh
/bin/sh "/path/to/vuetorrent/scripts/auto_exclude.sh" "%I"
```

### macOS:
```sh
/bin/sh "/path/to/vuetorrent/scripts/auto_exclude.sh" "%I"
```

### Windows:
```powershell
powershell -ExecutionPolicy Bypass -File "C:\path\to\vuetorrent\scripts\auto_exclude.ps1" "%I"
```
*(Or if Python is installed: `python "C:\path\to\vuetorrent\scripts\auto_exclude.py" "%I"`)*

> **Tip**: VueTorrent can configure this command automatically for you in **Settings -> VueTorrent -> General -> File Exclusions**!
