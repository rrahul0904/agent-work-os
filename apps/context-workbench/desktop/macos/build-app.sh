#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"
swift build -c release
binary_dir="$(swift build -c release --show-bin-path)"
destination="${1:-$script_dir/dist}"
bundle="$destination/Context Continuity.app"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp "$binary_dir/ContextContinuityMac" "$bundle/Contents/MacOS/ContextContinuityMac"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>en</string>
    <key>CFBundleExecutable</key><string>ContextContinuityMac</string>
    <key>CFBundleIdentifier</key><string>com.agentworkos.contextcontinuity</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key><string>Context Continuity</string>
    <key>CFBundleDisplayName</key><string>Context Continuity</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>CFBundleVersion</key><string>1</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <key>LSUIElement</key><true/>
    <key>NSMicrophoneUsageDescription</key><string>Dictate notes using your microphone.</string>
    <key>NSSpeechRecognitionUsageDescription</key><string>Transcribe speech for your agent handoffs and research notes.</string>
</dict>
</plist>
PLIST
if command -v codesign >/dev/null 2>&1; then
  codesign --force --sign - "$bundle"
fi
echo "$bundle"
