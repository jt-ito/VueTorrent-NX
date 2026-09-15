# VueTorrent Auto-Exclusion PowerShell Script
# Runs natively on Windows 10/11/Server with ZERO extra software installations.
#
# Security:
# - Strict hex hash validation to prevent argument injection.
# - Protocol validation (HTTP/HTTPS only).
# - Integer-only file ID validation.
# - Sanitized alphanumeric exclusion patterns.
#
# Logging:
# - Dual output: console and rolling log file (auto_exclude.log, capped at 5MB).

param (
    [Parameter(Position=0, Mandatory=$true)]
    [string]$Hash,

    [Parameter(Position=1)]
    [string]$Url = $env:QBITTORRENT_URL,

    [string]$Username = $env:QBITTORRENT_USER,
    [string]$Password = $env:QBITTORRENT_PASS,
    [int]$Timeout = 180
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = if ($env:QBITTORRENT_LOG_FILE) { $env:QBITTORRENT_LOG_FILE } else { "$ScriptDir\auto_exclude.log" }
$MaxLogSize = 5 * 1024 * 1024

function Write-Log {
    param (
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $formatted = "[$timestamp] [$Level] [VueTorrent Auto-Exclude] $Message"
    Write-Host $formatted

    try {
        if (Test-Path $LogFile) {
            $item = Get-Item $LogFile -ErrorAction SilentlyContinue
            if ($item -and $item.Length -gt $MaxLogSize) {
                $content = Get-Content $LogFile -Raw -ErrorAction SilentlyContinue
                if ($content -and $content.Length -gt 1048576) {
                    $content.Substring($content.Length - 1048576) | Set-Content $LogFile -ErrorAction SilentlyContinue
                }
            }
        }
        $formatted | Out-File -FilePath $LogFile -Append -Encoding utf8 -ErrorAction SilentlyContinue
    } catch {
        # Non-critical if logging fails
    }
}

# 1. Strict Security Validation
if (-not $Hash -or ($Hash -notmatch '^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$')) {
    Write-Log "Security Alert: Invalid torrent hash rejected: '$Hash'" "ERROR"
    exit 1
}

if (-not $Url) {
    $Url = "http://127.0.0.1:8080"
}
$Url = $Url.TrimEnd('/')

if ($Url -notmatch '^https?://') {
    Write-Log "Security Alert: Invalid WebUI URL rejected (must be HTTP or HTTPS): '$Url'" "ERROR"
    exit 1
}

# 2. Prefer Python if installed on Windows
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd -and (Test-Path "$ScriptDir\auto_exclude.py")) {
    & python "$ScriptDir\auto_exclude.py" $Hash --url $Url
    exit $LASTEXITCODE
}

# 3. Native Windows PowerShell fallback using built-in Invoke-RestMethod
Write-Log "Running native PowerShell fallback for hash: $Hash"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Login if credentials provided
if ($Username) {
    try {
        $loginBody = @{ username = $Username; password = $Password }
        Invoke-RestMethod -Uri "$Url/api/v2/auth/login" -Method Post -Body $loginBody -WebSession $session -TimeoutSec 15 | Out-Null
    } catch {
        Write-Log "Authentication warning: $_" "WARNING"
    }
}

# Fetch preferences
try {
    $prefs = Invoke-RestMethod -Uri "$Url/api/v2/app/preferences" -Method Get -WebSession $session -TimeoutSec 15
} catch {
    Write-Log "Failed to connect to qBittorrent at $($Url): $_" "ERROR"
    exit 1
}

$rawExclusions = $prefs.excluded_file_names
if (-not $rawExclusions) {
    Write-Log "No file exclusions configured in preferences."
    exit 0
}

# Parse & sanitize patterns
$patterns = @()
foreach ($line in ($rawExclusions -split "[\r\n,]+")) {
    $p = $line.Trim()
    # Strip any dangerous control or shell characters
    $p = $p -replace '[\0\r\n"'';|&$><]', ''
    if ($p) {
        if ($p -notlike "*.*" -and $p -notlike "*") {
            $p = "*.$p"
        } elseif ($p.StartsWith(".")) {
            $p = "*$p"
        }
        $patterns += $p.ToLower()
    }
}

if ($patterns.Count -eq 0) {
    Write-Log "No valid exclusion patterns found."
    exit 0
}

Write-Log "Active exclusion patterns: $($patterns -join ', ')"

# Wait for torrent files / metadata
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$files = $null

while ($stopwatch.Elapsed.TotalSeconds -lt $Timeout) {
    try {
        $files = Invoke-RestMethod -Uri "$Url/api/v2/torrents/files?hash=$Hash" -Method Get -WebSession $session -TimeoutSec 15
        if ($files -and $files.Count -gt 0) {
            break
        }
    } catch {
        # Metadata still downloading
    }
    Start-Sleep -Seconds 2
}

if (-not $files -or $files.Count -eq 0) {
    Write-Log "Timed out waiting for file metadata for hash: $Hash" "WARNING"
    exit 1
}

Write-Log "Metadata retrieved: $($files.Count) file(s) found."

$idsToExclude = @()
foreach ($file in $files) {
    $fileName = $file.name
    $fileId = if ($null -ne $file.index) { $file.index } else { $file.id }
    $priority = $file.priority

    if ($priority -eq 0) {
        continue
    }

    $lowerName = $fileName.ToLower()
    $baseName = [System.IO.Path]::GetFileName($lowerName)

    $matched = $false
    foreach ($pat in $patterns) {
        if ($lowerName -like $pat -or $baseName -like $pat) {
            $matched = $true
            break
        }
    }

    if ($matched) {
        # Strictly ensure fileId is integer
        try {
            $intId = [int]$fileId
            $idsToExclude += $intId
            Write-Log "  - [DO NOT DOWNLOAD] $fileName"
        } catch {
            Write-Log "Skipping invalid file ID: $fileId" "WARNING"
        }
    }
}

if ($idsToExclude.Count -gt 0) {
    $idStr = $idsToExclude -join '|'
    try {
        $body = @{
            hash = $Hash
            id = $idStr
            priority = 0
        }
        Invoke-RestMethod -Uri "$Url/api/v2/torrents/filePrio" -Method Post -Body $body -WebSession $session -TimeoutSec 15 | Out-Null
        Write-Log "Successfully deselected $($idsToExclude.Count) file(s)."
    } catch {
        Write-Log "Failed to update file priorities: $_" "ERROR"
        exit 1
    }
} else {
    Write-Log "No files matched the exclusion list."
}

exit 0
