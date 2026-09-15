#!/usr/bin/env python3
"""
VueTorrent Auto-Exclusion Script
Cross-platform helper to deselect excluded files in qBittorrent in the background
without requiring the WebUI to stay open.

Security:
- Strict validation of torrent hashes (SHA1 / SHA256 hex format only) to prevent injection.
- Protocol validation (HTTP/HTTPS only) to prevent SSRF.
- Integer-only file ID validation.
- Sanitized exclusion patterns.

Logging:
- Timestamps and severity levels.
- Dual output: stdout and rolling log file (auto_exclude.log, capped at 5 MB).

Compatible with Python 3.6+ using standard library only (zero pip dependencies).
Works on Windows, Linux, macOS, and Docker.
"""

import argparse
import datetime
import fnmatch
import http.cookiejar
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

LOG_FILE_PATH = os.environ.get(
    "QBITTORRENT_LOG_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "auto_exclude.log"),
)
MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB log cap


def log(msg: str, level: str = "INFO"):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [{level}] [VueTorrent Auto-Exclude] {msg}"
    print(formatted, flush=True)

    try:
        if os.path.exists(LOG_FILE_PATH) and os.path.getsize(LOG_FILE_PATH) > MAX_LOG_SIZE_BYTES:
            # Rotate by keeping the last 1MB
            with open(LOG_FILE_PATH, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            with open(LOG_FILE_PATH, "w", encoding="utf-8") as f:
                f.write(content[-1024 * 1024 :])

        with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


def validate_hash(torrent_hash: str) -> bool:
    """Validates that torrent_hash is strictly a 40-char or 64-char hex string."""
    if not isinstance(torrent_hash, str):
        return False
    return bool(re.match(r"^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$", torrent_hash.strip()))


def validate_url(url: str) -> bool:
    """Validates that url uses http or https scheme."""
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def normalize_pattern(pattern: str) -> str:
    """Sanitizes and normalizes an exclusion pattern."""
    cleaned = pattern.strip().lower()
    # Strip any dangerous control or shell characters
    cleaned = re.sub(r'[\0\r\n"\';|&$><]', "", cleaned)
    if not cleaned:
        return ""
    if cleaned.startswith("*."):
        return cleaned
    if cleaned.startswith("."):
        return f"*{cleaned}"
    if "*" not in cleaned and "?" not in cleaned:
        return f"*.{cleaned}"
    return cleaned


class QbitClient:
    def __init__(self, base_url: str, username: str = "", password: str = "", debug: bool = False):
        self.base_url = base_url.rstrip("/")
        self.username = username
        self.password = password
        self.debug = debug

        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookie_jar))

    def _request(self, path: str, data: dict = None, method: str = None) -> bytes:
        url = f"{self.base_url}{path}"
        encoded_data = None
        if data is not None:
            encoded_data = urllib.parse.urlencode(data).encode("utf-8")

        req = urllib.request.Request(url, data=encoded_data, method=method)
        req.add_header("User-Agent", "VueTorrent-AutoExclude/1.0")

        try:
            with self.opener.open(req, timeout=15) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if self.debug:
                log(f"HTTP Error {e.code} on {path}: {e.reason}", level="DEBUG")
            raise
        except urllib.error.URLError as e:
            if self.debug:
                log(f"Connection Error on {path}: {e.reason}", level="DEBUG")
            raise

    def login(self) -> bool:
        if not self.username:
            return True
        try:
            resp = self._request(
                "/api/v2/auth/login",
                data={"username": self.username, "password": self.password},
            )
            result = resp.decode("utf-8").strip()
            if result == "Ok.":
                if self.debug:
                    log("Successfully authenticated with qBittorrent WebUI.", level="DEBUG")
                return True
            log(f"Authentication failed: {result}", level="ERROR")
            return False
        except Exception as e:
            log(f"Login request failed: {e}", level="ERROR")
            return False

    def get_preferences(self) -> dict:
        try:
            data = self._request("/api/v2/app/preferences")
            return json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and self.username:
                if self.login():
                    data = self._request("/api/v2/app/preferences")
                    return json.loads(data.decode("utf-8"))
            raise

    def get_torrent_files(self, torrent_hash: str) -> list:
        try:
            data = self._request(f"/api/v2/torrents/files?hash={torrent_hash}")
            return json.loads(data.decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and self.username:
                if self.login():
                    data = self._request(f"/api/v2/torrents/files?hash={torrent_hash}")
                    return json.loads(data.decode("utf-8"))
            raise

    def set_file_priority(self, torrent_hash: str, file_ids: list, priority: int = 0) -> bool:
        # Strictly validate that all file IDs are integers
        safe_ids = [str(int(i)) for i in file_ids]
        id_str = "|".join(safe_ids)
        try:
            self._request(
                "/api/v2/torrents/filePrio",
                data={"hash": torrent_hash, "id": id_str, "priority": priority},
            )
            return True
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and self.username:
                if self.login():
                    self._request(
                        "/api/v2/torrents/filePrio",
                        data={"hash": torrent_hash, "id": id_str, "priority": priority},
                    )
                    return True
            raise


def process_torrent(
    torrent_hash: str,
    base_url: str,
    username: str = "",
    password: str = "",
    timeout: int = 180,
    interval: int = 2,
    debug: bool = False,
) -> bool:
    # 0. Strict input validation
    if not validate_hash(torrent_hash):
        log(f"Invalid torrent hash format rejected for security: '{torrent_hash}'", level="ERROR")
        return False

    if not validate_url(base_url):
        log(f"Invalid qBittorrent WebUI URL rejected: '{base_url}'", level="ERROR")
        return False

    client = QbitClient(base_url, username=username, password=password, debug=debug)

    # 1. Fetch preferences to extract excluded file extensions
    try:
        prefs = client.get_preferences()
    except Exception as e:
        log(f"Failed to fetch qBittorrent preferences from {base_url}: {e}", level="ERROR")
        return False

    excluded_globs_str = prefs.get("excluded_file_names", "")
    excluded_enabled = prefs.get("excluded_file_names_enabled", True)

    if not excluded_enabled and not excluded_globs_str.strip():
        if debug:
            log("No file exclusions are configured in qBittorrent preferences.", level="DEBUG")
        return True

    patterns = []
    for line in excluded_globs_str.replace("\r", "").split("\n"):
        for part in line.split(","):
            norm = normalize_pattern(part)
            if norm and norm not in patterns:
                patterns.append(norm)

    if not patterns:
        if debug:
            log("Exclusion list is empty. Nothing to deselect.", level="DEBUG")
        return True

    log(f"Active exclusion patterns: {', '.join(patterns)}")

    # 2. Wait for metadata / file list
    log(f"Waiting for torrent metadata (hash: {torrent_hash})...")
    start_time = time.time()
    files = []

    while time.time() - start_time < timeout:
        try:
            files = client.get_torrent_files(torrent_hash)
            if files and len(files) > 0:
                break
        except Exception as e:
            if debug:
                log(f"Polling file list: {e}", level="DEBUG")
        time.sleep(interval)

    if not files:
        log(f"Timed out waiting for file metadata for torrent {torrent_hash}.", level="WARNING")
        return False

    log(f"Metadata retrieved: {len(files)} file(s) found.")

    # 3. Match files against patterns
    to_exclude_ids = []
    excluded_names = []

    for f in files:
        name = f.get("name", "")
        file_id = f.get("index", f.get("id"))
        priority = f.get("priority", 1)

        # Skip files already set to Do Not Download (priority 0)
        if priority == 0:
            continue

        lower_name = name.lower()
        base_name = os.path.basename(lower_name)

        matched = False
        for pat in patterns:
            if fnmatch.fnmatch(lower_name, pat) or fnmatch.fnmatch(base_name, pat):
                matched = True
                break

        if matched and file_id is not None:
            try:
                safe_int_id = int(file_id)
                to_exclude_ids.append(safe_int_id)
                excluded_names.append(name)
            except (ValueError, TypeError):
                log(f"Skipping malformed file ID: {file_id}", level="WARNING")

    # 4. Apply priority 0 to matched files
    if to_exclude_ids:
        log(f"Deselecting {len(to_exclude_ids)} matching file(s):")
        for name in excluded_names:
            log(f"  - [DO NOT DOWNLOAD] {name}")

        try:
            client.set_file_priority(torrent_hash, to_exclude_ids, priority=0)
            log("Successfully updated file priorities to DO_NOT_DOWNLOAD.")
            return True
        except Exception as e:
            log(f"Failed to set file priorities: {e}", level="ERROR")
            return False
    else:
        log("No files matched the exclusion patterns.")
        return True


def main():
    parser = argparse.ArgumentParser(
        description="VueTorrent Auto-Exclusion Hook - Cross-Platform background file exclusion for qBittorrent."
    )
    parser.add_argument("hash", nargs="?", default="", help="Torrent info hash (%%I)")
    parser.add_argument("--hash", dest="opt_hash", default="", help="Torrent info hash")
    parser.add_argument(
        "--url",
        default=os.environ.get("QBITTORRENT_URL", "http://127.0.0.1:8080"),
        help="qBittorrent WebUI URL (default: http://127.0.0.1:8080 or $QBITTORRENT_URL)",
    )
    parser.add_argument(
        "--username",
        default=os.environ.get("QBITTORRENT_USER", ""),
        help="qBittorrent username (if localhost auth not bypassed)",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("QBITTORRENT_PASS", ""),
        help="qBittorrent password (if localhost auth not bypassed)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=180,
        help="Maximum seconds to wait for magnet metadata (default: 180)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=2,
        help="Seconds between metadata polling attempts (default: 2)",
    )
    parser.add_argument("--debug", action="store_true", help="Enable verbose debug logging")

    args = parser.parse_args()
    torrent_hash = (args.hash or args.opt_hash).strip()

    if not torrent_hash:
        parser.print_help()
        sys.exit(1)

    success = process_torrent(
        torrent_hash=torrent_hash,
        base_url=args.url,
        username=args.username,
        password=args.password,
        timeout=args.timeout,
        interval=args.interval,
        debug=args.debug,
    )

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
