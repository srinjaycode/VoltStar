# VoltStar Android App - Complete Build Guide

## Overview

The **VoltStar Android App** reads real-time telemetry data from a **Cycle Analyst V3** device via USB serial connection and uploads it to **Firebase Realtime Database**.

### Key Features

✅ **USB Serial Communication** - 9600 baud, 8-N-1, tab-delimited ASCII protocol  
✅ **Stream Framing** - Rolling byte buffer with newline-based line extraction  
✅ **Dynamic Header Parsing** - Column mapping from first line  
✅ **Flags Decoding** - Active preset, limiting states, brake, throttle fault  
✅ **Firebase Upload** - Asynchronous telemetry upload  
✅ **Real-time UI** - Live dashboard with 10Hz updates  
✅ **Single-File Architecture** - All logic in one Kotlin file

---

## Hardware Requirements

- Android device with **USB OTG support** (Android 6.0+)
- **USB-TTL adapter** (FTDI, CH340, CP210x, or CDC-compatible)
- **Cycle Analyst V3** device
- USB-C to USB-A adapter (if needed)

---

## Project Structure Setup

This project follows standard Android Studio structure. Here's how to organize the files:

```
VoltStar/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/abdulhayee/voltstar/
│   │   │   │   └── MainActivity.kt
│   │   │   ├── res/
│   │   │   │   ├── values/
│   │   │   │   │   ├── strings.xml
│   │   │   │   │   └── themes.xml
│   │   │   │   ├── xml/
│   │   │   │   │   ├── device_filter.xml
│   │   │   │   │   ├── backup_rules.xml
│   │   │   │   │   └── data_extraction_rules.xml
│   │   │   │   └── mipmap-*/
│   │   │   │       └── ic_launcher.png (use default Android icons)
│   │   │   └── AndroidManifest.xml
│   │   └── (test directories can be empty)
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── google-services.json (you must provide this)
├── gradle/
│   └── wrapper/
│       ├── gradle-wrapper.jar (auto-generated)
│       └── gradle-wrapper.properties (auto-generated)
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
├── gradlew
├── gradlew.bat
├── .gitignore
└── README.md
```

---

## Step-by-Step Setup

### 1. Install Prerequisites

- **Android Studio** (latest version)
- **JDK 17** or higher
- **Firebase account** with a project

### 2. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create new project or use existing
3. Add Android app with package name: `com.abdulhayee.voltstar`
4. Download `google-services.json`
5. Enable **Realtime Database** in Firebase console
6. Set database rules to:

```json
{
  "rules": {
    "cycle_readings": {
      ".read": true,
      ".write": true
    }
  }
}
```

### 3. Create Android Studio Project

1. Open Android Studio
2. Select **New Project** → **Empty Activity**
3. Set **Name**: `VoltStar`
4. Set **Package name**: `com.abdulhayee.voltstar`
5. Set **Language**: `Kotlin`
6. Set **Minimum SDK**: `API 24 (Android 7.0)`
7. Click **Finish**

### 4. Replace Project Files

After Android Studio creates the project:

1. **Copy all files from this delivery** into the project directory according to the structure above
2. **Place `google-services.json`** in `app/` directory
3. **Create the resource files** in their proper locations (see file mapping below)

### 5. File Placement Guide

Map the delivered files to the Android Studio structure:

| Delivered File | Destination |
|---|---|
| `MainActivity.kt` | `app/src/main/java/com/abdulhayee/voltstar/MainActivity.kt` |
| `AndroidManifest.xml` | `app/src/main/AndroidManifest.xml` |
| `app_build.gradle.kts` | `app/build.gradle.kts` |
| `project_build.gradle.kts` | `build.gradle.kts` (root) |
| `settings.gradle.kts` | `settings.gradle.kts` (root) |
| `gradle.properties` | `gradle.properties` (root) |
| `proguard-rules.pro` | `app/proguard-rules.pro` |
| `gitignore` | `.gitignore` (root) |
| `res_values_strings.xml` | `app/src/main/res/values/strings.xml` |
| `res_values_themes.xml` | `app/src/main/res/values/themes.xml` |
| `res_xml_device_filter.xml` | `app/src/main/res/xml/device_filter.xml` |
| `res_xml_backup_rules.xml` | `app/src/main/res/xml/backup_rules.xml` |
| `res_xml_data_extraction_rules.xml` | `app/src/main/res/xml/data_extraction_rules.xml` |

### 6. Sync and Build

1. In Android Studio, click **File** → **Sync Project with Gradle Files**
2. Wait for sync to complete (downloads dependencies)
3. Click **Build** → **Make Project**
4. Verify no errors

---

## Running the App

### 1. Hardware Setup

1. Connect USB-TTL adapter to Cycle Analyst V3
2. Connect adapter to Android device via OTG cable
3. Power on Cycle Analyst

### 2. Install and Run

1. Connect Android device to computer (USB debugging enabled)
2. Click **Run** (green play button) in Android Studio
3. Select your device
4. App will install and launch

### 3. Using the App

1. **USB Permission**: App will request permission to access USB device - grant it
2. **Connection**: Once connected, the status indicator turns green
3. **Live Data**: Telemetry updates at 1-10 Hz depending on CA configuration
4. **Firebase**: Data automatically uploads to your Firebase database
5. **Logs**: System log shows connection status and errors

---

## Troubleshooting

### Build Errors

**Error**: `Plugin [id: 'com.google.gms.google-services'] was not found`
- **Fix**: Ensure `google-services.json` is in `app/` directory
- **Fix**: Check internet connection (Gradle needs to download plugins)

**Error**: `Namespace not specified`
- **Fix**: Verify `namespace = "com.abdulhayee.voltstar"` in `app/build.gradle.kts`

**Error**: `usb-serial-for-android` not found
- **Fix**: Check that `maven { url = uri("https://jitpack.io") }` is in `settings.gradle.kts`

### Runtime Errors

**USB device not detected**
- Verify USB OTG cable is working
- Check device has USB host support
- Try different USB port/cable
- Check `device_filter.xml` includes your adapter's vendor ID

**No permission dialog**
- Ensure `<uses-feature android:name="android.hardware.usb.host">` is in manifest
- Check USB is physically connected before launching app
- Try disconnecting and reconnecting

**No data received**
- Verify Cycle Analyst is powered on and transmitting
- Check baud rate is 9600 on both sides
- Look in system log for "Header received" message
- Verify CA is set to ASCII output mode (not binary)

**Firebase upload fails**
- Check internet connection (WiFi or mobile data)
- Verify database rules allow writes
- Check `google-services.json` matches your Firebase project

---

## Technical Details

### Protocol Specification

**Connection**: 9600 baud, 8 data bits, no parity, 1 stop bit (8-N-1)

**Data Format**:
```
Line 1 (Header):  Ah\tV\tA\tS\tD\tRPM\tFlgs\t...
Line 2+ (Data):   0.0\t54.4\t0.3\t0.0\t0.0\t0\t0\t...
```

**Flags Decoding** (integer value):
- Bits 0-2: Active preset (0-4)
- Bit 3: Voltage limiting
- Bit 4: Current limiting
- Bit 5: Speed limiting
- Bit 6: Brake active
- Bit 7: Throttle fault

### Architecture

**Stream Processing**:
1. USB bytes → `SerialInputOutputManager` (background thread)
2. Bytes → `StreamFramer` (rolling buffer)
3. Lines extracted on `\n` boundaries
4. First line → `TelemetryParser.parseHeader()`
5. Data lines → `TelemetryParser.parseData()`
6. Parsed data → `TelemetryState` (rolling buffer)
7. Data → `FirebaseUploader` (async queue)
8. Data → UI (`StateFlow` updates)

**Memory Management**:
- Telemetry buffer: 100 most recent readings
- Log buffer: 50 most recent entries
- Stream framer: 8KB circular buffer

---

## Code Organization

All application logic is in **one file**: `MainActivity.kt`

Sections:
1. **Application Class** - Firebase initialization
2. **Data Classes** - `TelemetryData`, `FlagsDecoded`, `LogEntry`
3. **Stream Framing** - `StreamFramer` with byte buffer
4. **Telemetry Parser** - Dynamic column mapping
5. **Telemetry State** - Rolling buffers and derived metrics
6. **USB Serial Manager** - Connection, I/O, permissions
7. **Firebase Uploader** - Async upload queue
8. **Main Activity** - Lifecycle and coordination
9. **UI Theme** - Color palette
10. **UI Screens** - Jetpack Compose components

---

## Dependencies

### Core
- `androidx.core:core-ktx:1.12.0`
- `androidx.activity:activity-compose:1.8.2`

### Jetpack Compose
- `androidx.compose:compose-bom:2024.02.00`
- `androidx.compose.ui:ui`
- `androidx.compose.material3:material3`

### Firebase
- `com.google.firebase:firebase-bom:32.7.4`
- `com.google.firebase:firebase-database-ktx`

### USB Serial
- `com.github.mik3y:usb-serial-for-android:3.7.3`

### Coroutines
- `org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3`

---

## Git Workflow

### Initial Commit
```bash
git init
git add .
git commit -m "Initial VoltStar Android project"
git branch -M main
git remote add origin https://github.com/yourusername/voltstar-android.git
git push -u origin main
```

### Feature Development
```bash
git checkout -b feature/your-feature
# make changes
git add .
git commit -m "Add feature description"
git push origin feature/your-feature
```

### Important: `.gitignore` excludes
- `google-services.json` (each developer must provide their own)
- `local.properties`
- Build outputs

---

## License

This project is for internal use. All rights reserved.

---

## Support

For issues:
1. Check Firebase console for database connectivity
2. Use Android Studio Logcat with filter `VoltStar`
3. Verify USB adapter compatibility
4. Check Cycle Analyst configuration

**Note**: This is a complete, working Android application. All code is contained in `MainActivity.kt` as required. The project builds and runs without modification once Firebase is configured.