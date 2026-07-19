#!/bin/bash

VUETORRENT_DIR="./config/vuetorrent"
VERSION_FILE="$VUETORRENT_DIR/version.txt"
RETRY_LIMIT=10
RETRY_COUNT=0

echo "Starting version check script..."

# Ensure directory exists
mkdir -p "$VUETORRENT_DIR"

# Get the current version
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat "$VERSION_FILE")
    if [ -z "$CURRENT_VERSION" ]; then
        echo "Version file is empty!"
        CURRENT_VERSION=""
    else
        echo "Current version: $CURRENT_VERSION"
    fi
else
    echo "Version file not found! Proceeding with download..."
    CURRENT_VERSION=""
fi

echo "Waiting for 8 seconds to ensure VPN connection..."
sleep 8

# Function to fetch and compare versions
version_check() {
    LATEST_VERSION=$(curl -s https://api.github.com/repos/jt-ito/VueTorrent-NX/releases/latest | grep -o '"tag_name": "[^"]*' | cut -d'"' -f4)
    echo "Latest version: $LATEST_VERSION"

    # Remove the "v" prefix from the versions
    CURRENT_VERSION=${CURRENT_VERSION#"v"}
    LATEST_VERSION=${LATEST_VERSION#"v"}

    # If no version file or new version detected, proceed with download
    if [ -z "$CURRENT_VERSION" ] || [ "$CURRENT_VERSION" != "$LATEST_VERSION" ]; then
        echo "Downloading VueTorrent version: $LATEST_VERSION"

        TEMP_FILE=$(mktemp)
        DOWNLOAD_URL="https://github.com/jt-ito/VueTorrent-NX/releases/download/v$LATEST_VERSION/vuetorrent.zip"

        if wget -O "$TEMP_FILE" "$DOWNLOAD_URL"; then
            echo "Download successful."

            rm -rf "$VUETORRENT_DIR"
            mkdir -p "$VUETORRENT_DIR"

            if unzip "$TEMP_FILE" -d "$VUETORRENT_DIR"; then
                echo "File extracted."

                # Move files up one level if they were nested
                if [ -d "$VUETORRENT_DIR/vuetorrent" ]; then
                    mv "$VUETORRENT_DIR/vuetorrent"/* "$VUETORRENT_DIR"
                    rm -rf "$VUETORRENT_DIR/vuetorrent"
                    echo "Nested directory removed."
                fi

                rm "$TEMP_FILE"
                echo "v$LATEST_VERSION" > "$VERSION_FILE"
                echo "Version file updated."

                return 0 # Success
            else
                echo "Unzip failed!"
                rm "$TEMP_FILE"
                return 1 # Failure
            fi
        else
            echo "Download failed!"
            rm "$TEMP_FILE"
            return 1 # Failure
        fi
    else
        echo "No new version available."
        return 0 # Success
    fi
}

# Retry loop
until version_check || [ "$RETRY_COUNT" -ge "$RETRY_LIMIT" ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "Retrying... ($RETRY_COUNT/$RETRY_LIMIT)"
    sleep 1
done

if [ "$RETRY_COUNT" -ge "$RETRY_LIMIT" ]; then
    echo "Script failed after $RETRY_LIMIT attempts."
    exit 1
fi

echo "Public IP address is: $(curl -s ifconfig.me)"
echo "Script completed."
