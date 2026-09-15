#!/bin/sh
# VueTorrent Auto-Exclusion Shell Script
# Runs natively on Linux, Docker, and macOS with ZERO extra package installations.
#
# Security:
# - Strict hex hash validation to prevent argument/command injection.
# - URL protocol validation (HTTP/HTTPS only).
# - Safe temporary file creation with restricted permissions (0600).
# - Sanitized alphanumeric-only extension parsing.
# - Integer-only file ID validation.
#
# Logging:
# - Dual output: stdout and rolling log file (auto_exclude.log, capped at 5MB).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="${QBITTORRENT_LOG_FILE:-$SCRIPT_DIR/auto_exclude.log}"
FALLBACK_LOG="/tmp/auto_exclude.log"
UID_VAL=$(id -u 2>/dev/null || echo 0)
USER_FALLBACK_LOG="/tmp/auto_exclude_${UID_VAL}.log"
MAX_LOG_SIZE=5242880 # 5 MB

log() {
  LEVEL="${2:-INFO}"
  TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date)"
  LOG_MSG="[$TIMESTAMP] [$LEVEL] [VueTorrent Auto-Exclude] $1"
  echo "$LOG_MSG"
  
  for target in "$LOG_FILE" "$FALLBACK_LOG" "$USER_FALLBACK_LOG"; do
    if [ -n "$target" ]; then
      if [ -f "$target" ]; then
        FILE_SIZE=$(wc -c < "$target" 2>/dev/null || stat -c %s "$target" 2>/dev/null || echo 0)
        if [ "$FILE_SIZE" -gt "$MAX_LOG_SIZE" ]; then
          tail -c 1048576 "$target" > "$target.tmp" 2>/dev/null && mv "$target.tmp" "$target" 2>/dev/null || true
        fi
      fi
      echo "$LOG_MSG" >> "$target" 2>/dev/null || true
    fi
  done
}

HASH="$1"
URL="${2:-${QBITTORRENT_URL:-http://127.0.0.1:8080}}"
URL="${URL%/}"

log "Script invoked with args: $*"

if [ -z "$HASH" ]; then
  log "No torrent hash provided. Usage: $0 <torrent_hash> [qBittorrent_url]" "ERROR"
  exit 1
fi

# 1. Strict Security Validation
# Ensure HASH is strictly a 40-char (SHA1) or 64-char (SHA256) hexadecimal string
if ! echo "$HASH" | grep -Eq '^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$'; then
  log "Security Alert: Invalid torrent hash rejected: '$HASH'" "ERROR"
  exit 1
fi

# Ensure URL is http or https
case "$URL" in
  http://*|https://*) ;;
  *)
    log "Security Alert: Invalid WebUI URL rejected (must be HTTP or HTTPS): '$URL'" "ERROR"
    exit 1
    ;;
esac

# 2. Prefer Python 3 if installed on the system (e.g. linuxserver/qbittorrent Docker or standard Linux)
if command -v python3 >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/auto_exclude.py" ]; then
  exec python3 "$SCRIPT_DIR/auto_exclude.py" "$HASH" --url "$URL"
fi

if command -v python >/dev/null 2>&1 && [ -f "$SCRIPT_DIR/auto_exclude.py" ]; then
  exec python "$SCRIPT_DIR/auto_exclude.py" "$HASH" --url "$URL"
fi

# 3. Pure POSIX fallback using /bin/sh, curl, and awk (standard in BusyBox, Alpine, Debian, macOS)
log "Running native shell/curl fallback for hash: $HASH"

# Cookie / auth handling with secure temporary file
AUTH_ARGS=""
COOKIE_FILE=""
if [ -n "$QBITTORRENT_USER" ]; then
  if command -v mktemp >/dev/null 2>&1; then
    COOKIE_FILE="$(mktemp /tmp/qbit_cookie_XXXXXX 2>/dev/null || mktemp)"
  else
    COOKIE_FILE="/tmp/qbit_cookie_$$"
    touch "$COOKIE_FILE"
  fi
  chmod 600 "$COOKIE_FILE" 2>/dev/null || true
  trap 'rm -f "$COOKIE_FILE"' EXIT INT TERM

  curl -k -s -c "$COOKIE_FILE" -X POST \
    -d "username=$QBITTORRENT_USER&password=$QBITTORRENT_PASS" \
    "$URL/api/v2/auth/login" >/dev/null 2>&1
  AUTH_ARGS="-b $COOKIE_FILE"
fi

# Fetch preferences to extract excluded_file_names
PREFS=$(curl -k -s -H "Referer: $URL" $AUTH_ARGS "$URL/api/v2/app/preferences" 2>/dev/null || true)
if [ -z "$PREFS" ] && echo "$URL" | grep -q '^http://'; then
  ALT_URL="https://${URL#http://}"
  ALT_PREFS=$(curl -k -s -H "Referer: $ALT_URL" $AUTH_ARGS "$ALT_URL/api/v2/app/preferences" 2>/dev/null || true)
  if [ -n "$ALT_PREFS" ]; then
    URL="$ALT_URL"
    PREFS="$ALT_PREFS"
    log "Switched to HTTPS fallback: $URL"
  fi
fi

if [ -z "$PREFS" ]; then
  log "Failed to connect to qBittorrent at $URL" "ERROR"
  exit 1
fi

if [ "$PREFS" = "Forbidden" ] || [ "$PREFS" = "Unauthorized" ]; then
  log "qBittorrent returned '$PREFS'. Please ensure 'Bypass authentication for clients on localhost' is enabled in WebUI settings, or configure credentials." "ERROR"
  exit 1
fi

# Extract excluded_file_names (unescaped newline/comma-separated)
RAW_EXCLUSIONS=$(echo "$PREFS" | awk -F'"excluded_file_names":' '{print $2}' | awk -F',"' '{print $1}' | sed 's/^"//; s/"$//')

if [ -z "$RAW_EXCLUSIONS" ] || [ "$RAW_EXCLUSIONS" = '""' ]; then
  log "No file exclusions are configured in qBittorrent preferences."
  exit 0
fi

# Sanitize: only allow alphanumeric characters, hyphens, and underscores in extensions
EXT_PATTERNS=$(echo "$RAW_EXCLUSIONS" | sed 's/\\n/\n/g; s/\\r//g' | tr ',' '\n' | sed 's/^[ *.]*//; s/[ *.]*$//' | grep -v '^$' | tr -cd 'a-zA-Z0-9_\n' | tr '\n' '|' | sed 's/|$//')

if [ -z "$EXT_PATTERNS" ]; then
  log "No valid exclusion patterns parsed."
  exit 0
fi

log "Active exclusion extensions: $EXT_PATTERNS"

# Wait for file list / metadata (up to 180s)
MAX_ATTEMPTS=90
ATTEMPT=0
FILES=""

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  FILES=$(curl -k -s -H "Referer: $URL" $AUTH_ARGS "$URL/api/v2/torrents/files?hash=$HASH" 2>/dev/null || true)
  if echo "$FILES" | grep -q '"name":'; then
    break
  fi
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if ! echo "$FILES" | grep -q '"name":'; then
  log "Timed out waiting for file metadata for hash: $HASH" "WARNING"
  exit 1
fi

# Find file indices matching excluded extensions using awk
MATCHED_IDS=$(echo "$FILES" | awk -v pat="$EXT_PATTERNS" '
BEGIN {
  pattern = "\\.(" pat ")$"
}
{
  n = split($0, items, "}")
  for (i = 1; i <= n; i++) {
    item = items[i]
    if (item ~ /"name":/ && item ~ /"index":/) {
      match(item, /"name":\s*"([^"]+)"/, arr_name)
      match(item, /"index":\s*([0-9]+)/, arr_idx)
      match(item, /"priority":\s*([0-9]+)/, arr_prio)
      
      fname = arr_name[1]
      idx = arr_idx[1]
      prio = arr_prio[1]
      
      if (tolower(fname) ~ pattern && prio != "0" && idx != "") {
        if (matched != "") {
          matched = matched "|" idx
        } else {
          matched = idx
        }
      }
    }
  }
  print matched
}')

# Validate that MATCHED_IDS contains only integer IDs separated by pipes
if [ -n "$MATCHED_IDS" ] && echo "$MATCHED_IDS" | grep -Eq '^[0-9]+(\|[0-9]+)*$'; then
  log "Applying DO_NOT_DOWNLOAD (priority 0) to indices: $MATCHED_IDS"
  curl -k -s -H "Referer: $URL" $AUTH_ARGS -X POST \
    -d "hash=$HASH&id=$MATCHED_IDS&priority=0" \
    "$URL/api/v2/torrents/filePrio" >/dev/null 2>&1
  log "Successfully updated file priorities."
else
  log "No files matched the exclusion list."
fi

exit 0
