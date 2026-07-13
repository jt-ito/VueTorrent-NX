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

## Demo

A live demo **with mocked data** is available here: <https://vuetorrent.github.io/demo>

<!-- prettier-ignore -->
> [!NOTE]
> This version isn't connected to a qBittorrent instance.
>
> Don't try to download torrents or change preferences, it won't work 😉

## Installation

Checkout the [wiki](https://github.com/jt-ito/VueTorrent-NX/wiki/Installation)!

## Development

- Clone the repo
- `npm install`
- `npm start`
- `npm run lint` (to check for problems in code)
- `npm run lint:fix` (to fix common problems)
- `docker-compose up -d` (starts a qbittorrent docker, optional)
- Open the WebUI on localhost with the default credentials
  - See [#1720](https://github.com/jt-ito/VueTorrent-NX/issues/1720) for more details
- Make sure WebUI > "Host header validation" is disabled in the qBittorrent preferences
- Copy `.env.sample` to `.env` to tweak your dev environment (e.g. mocked data)

## Features

- Torrents
  - add / remove / pause / resume / rename torrents
  - selectively download files
  - view info / trackers / peers / content / tags & categories
  - search for new torrents straight from the WebUI!
- Keyboard shortcuts!
  - Mac keymap is supported (use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>)
  - Press <kbd>Escape</kbd> to dismiss any dialogs or to return to Dashboard view
  - Dashboard
    - Select all torrents with <kbd>Ctrl</kbd>-<kbd>A</kbd>
    - Focus search input with <kbd>Ctrl</kbd>-<kbd>F</kbd>
      - Press again to enable native browser search
    - When no dialogs are opened, press <kbd>Escape</kbd> to unfocus search input
      - Press again to unselect all torrents
    - Delete selected torrents with <kbd>Delete</kbd> (<kbd>Fn</kbd>-<kbd>Backspace</kbd> on Mac)
    - <kbd>Ctrl</kbd>-click on a torrent card to enable multi-select mode
    - Hold <kbd>Shift</kbd> and click on a torrent card to select all torrents between the last selected torrent and the clicked torrent
- System
  - see session stats (down / upload speed, session uploaded / downloaded, free space)
  - beautiful transfer graphs
  - change the most common settings
- Extra features the default WebUI doesn't have
  - mobile friendly! (can be installed as a PWA)
  - Configureable Dashboard: choose which torrent properties are shown for both busy and completed torrents
- Optimized for the latest version of qBittorrent
- Additional backend for improved experience, [see the repo for more info](https://github.com/jt-ito/VueTorrent-NX-backend)
  - This is a work in progress, and is not required to use VueTorrent
  - Stores server-side settings
- Supports [qBittorrent Enhanced Edition](https://github.com/c0re100/qBittorrent-Enhanced-Edition) preferences

## Important Information

VueTorrent is a **WebUI** (think of it as a "visual skin") that uses qBittorrent's WebAPI, enabling full compatibility with automation solutions like the *arr stack.

Everything that is compatible with the classic qBittorrent WebUI will work regardless of the WebUI you chose to use, whether its VueTorrent or another one.

### Reverse Proxy & Timeouts

If you run VueTorrent behind a reverse proxy (like Nginx, Traefik, or Caddy) or a CDN (like Cloudflare), be aware that there are multiple layers of timeouts that can drop connections:
1. **CDN/Edge Timeout**: e.g., Cloudflare (Proxied / Orange Cloud) has an idle connection timeout (~100s on the free tier).
2. **Reverse Proxy Timeout**: e.g., Nginx has its own `proxy_read_timeout` and `proxy_send_timeout` directives.
3. **qBittorrent Session**: Handled natively by VueTorrent's background keep-alive ping.

A connection drop due to inactivity can happen at any of these layers. Fixing one layer does not guarantee another won't drop the connection. Ensure your proxy settings allow long-lived connections for API endpoints if you encounter abrupt disconnects.

**Authentication & Security**: Do **not** disable "Host header validation" in qBittorrent when exposing it externally. Instead, enable `Reverse Proxy support` and add your reverse proxy's internal IP to the trusted subnets list to properly forward headers and preserve security.

### Native "Excluded File Names" Feature (Complementary)

For always-on filtering that doesn't depend on VueTorrent being open, you can also enable qBittorrent's own **"Excluded file names"** setting under Downloads preferences. However, this native setting has known bugs in some qBittorrent versions (e.g. 5.0 - 5.2) where it is silently ignored for magnet links, RSS feeds, and automation-added torrents (see qBittorrent issues #21508, #21624, #24235). VueTorrent provides its own client-side filter to bridge this gap, but the native setting is still a useful complementary layer.

## Contributing

We gladly accept contributions!

Any help is appreciated, whether it's reporting bugs, suggesting enhancements, contributing code or localizing the app.

See the [Contributing Guidelines](https://github.com/jt-ito/VueTorrent-NX/blob/main/.github/CONTRIBUTING.md) for more information.

## Support

- [![Discord](https://img.shields.io/discord/1170618192956243998?logo=discord)](https://discord.gg/KDQP7fR467)
- [![Wiki](https://img.shields.io/badge/Wiki-blue)](https://github.com/jt-ito/VueTorrent-NX/wiki)
- [![FAQ](https://img.shields.io/badge/FAQ-orange)](https://github.com/jt-ito/VueTorrent-NX/wiki/FAQ)

If any of the above didn't help, feel free to open an issue!

See the [Contributing Guidelines](https://github.com/jt-ito/VueTorrent-NX/blob/main/.github/CONTRIBUTING.md) for more information.

## Funding

All donations are appreciated but purely optional.

Checkout the sponsor section of the repository.

## Contributors

- [@m4ximuel](https://github.com/m4ximuel)
- [@Larsluph](https://github.com/Larsluph)
