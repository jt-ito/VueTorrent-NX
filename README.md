# VueTorrent-NX

The sleekest looking WebUI for qBittorrent made with Vue.js!

[![Discord](https://img.shields.io/discord/1170618192956243998?logo=discord)](https://discord.gg/KDQP7fR467)

![VueTorrent](https://cdn.jsdelivr.net/gh/jt-ito/VueTorrent-NX@main/VueTorrent-logo.png)

![Vue](https://img.shields.io/badge/Vue-%5E3.4.26-brightgreen) ![Vuetify](https://img.shields.io/badge/Vuetify-%5E3.6.4-brightgreen)
![qBittorrent](https://img.shields.io/badge/qBittorrent-4.4%2B-brightgreen)

![stars](https://img.shields.io/github/stars/jt-ito/VueTorrent-NX) ![Forks](https://img.shields.io/github/forks/jt-ito/VueTorrent-NX)
![Issues](https://img.shields.io/github/issues/jt-ito/VueTorrent-NX) ![Closed](https://img.shields.io/github/issues-closed/jt-ito/VueTorrent-NX)
![Closed PR](https://img.shields.io/github/issues-pr-closed/jt-ito/VueTorrent-NX) ![Version](https://img.shields.io/github/v/release/jt-ito/VueTorrent-NX)
![Test Status](https://img.shields.io/github/actions/workflow/status/jt-ito/VueTorrent-NX/test.yml)
![Downloads](https://img.shields.io/github/downloads/jt-ito/VueTorrent-NX/total)
[![Contributor Covenant](https://img.shields.io/badge/Contributor_Covenant-2.1-4baaaa.svg)](.github/CODE_OF_CONDUCT.md)

## Screenshots

- Desktop

<p>
  <img src="docs/screenshots/screenshot-desktop.webp" width="800" alt="Screenshot Desktop (Light Mode)" />
</p>

- Desktop Dark Mode

<p>
  <img src="docs/screenshots/screenshot-desktop-dark-mode.webp" width="800" alt="Screenshot Desktop (Dark Mode)" />
</p>

- Mobile Light Mode

<p>
  <img src="docs/screenshots/screenshot-mobile.webp" width="400" alt="Screenshot Mobile Dashboard (Light Mode)" />
  <img src="docs/screenshots/screenshot-mobile-navbar.webp" width="400" alt="Screenshot Mobile Navbar (Light Mode)" /> 
</p>

- Mobile Dark Mode

<p>
  <img src="docs/screenshots/screenshot-mobile-dark-mode.webp" width="400" alt="Screenshot Mobile Dashboard (Dark Mode)" />
  <img src="docs/screenshots/screenshot-mobile-navbar-dark-mode.webp" width="400" alt="Screenshot Mobile Navbar (Dark Mode)" /> 
</p>

## What makes VueTorrent-NX different?

VueTorrent-NX is a hardened, automation-friendly fork of the original VueTorrent WebUI. While the original VueTorrent is a beautiful visual skin for qBittorrent, it suffers from several concurrency and file-picker race conditions when used alongside *arr stack automation (Sonarr, Radarr, etc.).

**VueTorrent-NX introduces the following critical fixes and features:**

- **Automation Safety:** Prevents the manual file-picker dialog from accidentally intercepting or locking up background torrents added by external APIs (like Sonarr/Radarr).
- **Concurrency Guards:** Introduces strict `activeLocalAdds` guards and `try/finally` safety wrappers to prevent race conditions during rapid UI-initiated adds, keeping your *arr stack functioning smoothly in the background.
- **Robust Hash Resolution:** Replaces fragile strict-equality string matching for `.torrent` uploads with a resilient fuzzy-matching algorithm and a timestamp-based fallback, ensuring the WebUI never fails to resolve a torrent hash.
- **Native Exclusion Syncing:** Correctly manages and syncs qBittorrent's native `excluded_file_names` preference without permanent native pollution. Hitting "Reset Settings" now fully and cleanly wipes native exclusions.
- **Independent CI/CD:** Uses a completely streamlined, standard GitHub Actions release pipeline tailored for this fork, abandoning the complex upstream pipelines.

## Installation

1. Go to the [Releases](https://github.com/jt-ito/VueTorrent-NX/releases) page.
2. Download the latest `vuetorrent.zip`.
3. Extract the folder to a location of your choice.
4. Open qBittorrent settings -> Web UI -> Use alternative Web UI.
5. Point the path to the extracted `vuetorrent` directory.

## Development

- Clone the repo
- `npm install`
- `npm run dev`
- `npm run build` to compile

Note: Make sure WebUI > "Host header validation" is disabled in the qBittorrent preferences if you are accessing it locally for development.

## Important Information

### Reverse Proxy & Timeouts
If you run VueTorrent-NX behind a reverse proxy (like Nginx, Traefik, or Caddy) or a CDN (like Cloudflare), be aware that there are multiple layers of timeouts that can drop connections:
1. **CDN/Edge Timeout**: e.g., Cloudflare (Proxied / Orange Cloud) has an idle connection timeout (~100s on the free tier).
2. **Reverse Proxy Timeout**: e.g., Nginx has its own `proxy_read_timeout` and `proxy_send_timeout` directives.
3. **qBittorrent Session**: Handled natively by VueTorrent's background keep-alive ping.

Ensure your proxy settings allow long-lived connections for API endpoints if you encounter abrupt disconnects.

### Native "Excluded File Names" Feature (Complementary)
For always-on filtering that doesn't depend on VueTorrent being open, you can also enable qBittorrent's own **"Excluded file names"** setting under Downloads preferences. However, this native setting has known bugs in some qBittorrent versions (e.g. 5.0 - 5.2) where it is silently ignored for magnet links, RSS feeds, and automation-added torrents (see qBittorrent issues #21508, #21624, #24235). VueTorrent-NX provides its own robust client-side filter to bridge this gap, but the native setting is still a useful complementary layer.

## Support & Issues

If you encounter any issues specific to this fork's automation guards, file-picker, or release builds, please [open an issue](https://github.com/jt-ito/VueTorrent-NX/issues) on this repository.
