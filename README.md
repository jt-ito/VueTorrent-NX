# VueTorrent-NX

The sleekest, most robust WebUI for qBittorrent — built with Vue.js!

[![Discord](https://img.shields.io/discord/1170618192956243998?logo=discord)](https://discord.gg/KDQP7fR467)
![Vue](https://img.shields.io/badge/Vue-%5E3.4.26-brightgreen) ![Vuetify](https://img.shields.io/badge/Vuetify-%5E3.6.4-brightgreen)
![qBittorrent](https://img.shields.io/badge/qBittorrent-4.4%2B-brightgreen)
![Version](https://img.shields.io/github/v/release/jt-ito/VueTorrent-NX)

---

## 📸 Screenshots

### Dark Mode
<p>
  <img src="public/Dashboard.png" width="800" alt="Dashboard (Dark Mode)" />
</p>
<p>
  <img src="public/File_Selector.png" width="800" alt="File Selector (Dark Mode)" />
</p>
<p>
  <img src="public/Settings.png" width="800" alt="Settings (Dark Mode)" />
</p>

### Light Mode
<p>
  <img src="public/Dashboard_Light.png" width="800" alt="Dashboard (Light Mode)" />
</p>
<p>
  <img src="public/File_Selector_Light.png" width="800" alt="File Selector (Light Mode)" />
</p>

---

## ✨ What Makes VueTorrent-NX Different?

VueTorrent-NX takes the incredibly beautiful visual design of the original VueTorrent WebUI and transforms it into a hardened, automation-friendly powerhouse. If you've ever experienced concurrency issues, UI freezes, or file-picker race conditions while using automation tools like Sonarr or Radarr (*arr stack), **VueTorrent-NX is built for you.**

We've completely overhauled the core engine to prioritize flawless concurrency, zero-crash state management, and an unparalleled aesthetic experience. 

### 🚀 Key Features & Fixes

- **Native Exclusion Syncing (NEW!):** The Pre-Download File Selection dialog now seamlessly integrates with your native qBittorrent `excluded_file_names` setting! Whenever you add a new torrent, any files matching your native exclusions (such as `*.exe`, `*.txt`, or `*.nfo`) are automatically detected and deselected in the beautiful Vue UI before the download even begins.
- **Flawless UI Layouts (NEW!):** We've eliminated the visual bugs and awkward alignments present in the original file-picker dialogs. The pre-download picker is now perfectly centered and elegantly restrained to a clean 800px width on desktop devices for maximum readability.
- **Zero-Crash State Persistence (NEW!):** We've resolved critical underlying bugs related to Vue 3 state persistence across page reloads. You will no longer encounter state-wiping crashes (like the infamous `pendingPickerHashes.has is not a function` error) when refreshing your dashboard.
- **Bulletproof Automation Safety:** Say goodbye to manual interventions locking up your system. VueTorrent-NX prevents the manual file-picker dialog from accidentally intercepting or freezing background torrents added by external APIs (like Sonarr or Radarr).
- **Advanced Concurrency Guards:** We've introduced strict `activeLocalAdds` guards and `try/finally` safety wrappers. This eliminates race conditions during rapid, UI-initiated torrent additions and guarantees your *arr stack continues functioning smoothly in the background.
- **Resilient Hash Resolution:** We've replaced the fragile strict-equality string matching for `.torrent` file uploads with a resilient fuzzy-matching algorithm and a timestamp-based fallback, ensuring the WebUI never fails to resolve a torrent hash.
- **Independent & Fast CI/CD:** We utilize a completely streamlined, standard GitHub Actions release pipeline specifically tailored for this fork, abandoning the complex upstream pipelines to bring you faster, more reliable updates.

---

## 💾 Installation

Upgrading to VueTorrent-NX is incredibly simple:

1. Head over to our [Releases](https://github.com/jt-ito/VueTorrent-NX/releases) page.
2. Download the latest `vuetorrent.zip`.
3. Extract the folder to a convenient location on your system.
4. Open your qBittorrent settings, navigate to **Web UI**, and check **Use alternative Web UI**.
5. Point the path directly to your extracted `vuetorrent` directory.
6. Refresh your browser, and enjoy!

---

## 🛠️ Development

Want to compile it yourself or contribute?

```bash
# Clone the repository
git clone https://github.com/jt-ito/VueTorrent-NX.git
cd VueTorrent-NX

# Install dependencies
npm install

# Start the local dev server
npm run dev

# Compile for production
npm run build
```

> **Note:** Make sure WebUI > "Host header validation" is disabled in your qBittorrent preferences if you are accessing it locally for development!

---

## ⚠️ Important Information

### Reverse Proxy & Timeouts
If you're running VueTorrent-NX behind a reverse proxy (like Nginx, Traefik, or Caddy) or a CDN (like Cloudflare), be aware of connection timeouts:
- **CDN/Edge Timeout:** Cloudflare (Proxied / Orange Cloud) has a default idle connection timeout (around 100s on the free tier).
- **Reverse Proxy Timeout:** Nginx utilizes its own `proxy_read_timeout` and `proxy_send_timeout` directives.
- **qBittorrent Session:** Sessions are handled natively by VueTorrent's background keep-alive ping.

*Tip: Ensure your proxy settings allow long-lived connections for API endpoints if you encounter abrupt disconnects.*

### Native "Excluded File Names" Feature (Complementary)
For always-on filtering that doesn't depend on VueTorrent being open in a tab, you can enable qBittorrent's native **"Excluded file names"** setting under your Downloads preferences. 

However, please note that this native setting has known bugs in some qBittorrent versions (e.g. 5.0 - 5.2) where it is silently ignored for magnet links, RSS feeds, and automation-added torrents (see qBittorrent issues #21508, #21624, #24235). VueTorrent-NX provides its own robust client-side filter to bridge this gap, but the native setting remains a fantastic complementary layer!

---

## 🤝 Support & Issues

If you encounter any issues—especially those specific to this fork's automation guards, file-picker logic, or release builds—please [open an issue](https://github.com/jt-ito/VueTorrent-NX/issues) on this repository. We're always looking to improve!
