# VoltStar - Quick Start Guide

Get your VoltStar app running in 10 minutes!

---

## Prerequisites

✅ Android Studio installed  
✅ Firebase account (free tier is fine)  
✅ USB-OTG Android device

---

## Step 1: Firebase Setup (5 minutes)

1. Go to https://console.firebase.google.com/
2. Click **"Create a project"** or use existing
3. Project name: anything you want (e.g., "VoltStar")
4. Click through setup (disable Analytics if you want)
5. Once created, click **"Add app"** → Android icon
6. Package name: `com.abdulhayee.voltstar` (EXACT)
7. Click **"Register app"**
8. **Download google-services.json** (keep this file!)
9. In Firebase Console, go to **"Realtime Database"**
10. Click **"Create Database"**
11. Choose location (doesn't matter)
12. Start in **test mode** (we'll secure it later)
13. **Done!** Firebase is ready.

---

## Step 2: Create Android Project (2 minutes)

1. Open **Android Studio**
2. **File → New → New Project**
3. Select **"Empty Activity"**
4. Settings:
    - Name: `VoltStar`
    - Package: `com.abdulhayee.voltstar`
    - Language: `Kotlin`
    - Minimum SDK: `API 24`
    - Build language: `Kotlin DSL`
5. Click **Finish**
6. Wait for Gradle sync to complete

---

## Step 3: Replace Files (3 minutes)

### Create Directories
```bash
cd YourProjectDirectory/VoltStar
mkdir -p app/src/main/res/xml
```

### Copy Files from Delivery

**Main Source:**
```
MainActivity.kt → app/src/main/java/com/abdulhayee/voltstar/MainActivity.kt
```

**Manifest:**
```
AndroidManifest.xml → app/src/main/AndroidManifest.xml
```

**Resources:**
```
res_values_strings.xml → app/src/main/res/values/strings.xml
res_values_themes.xml → app/src/main/res/values/themes.xml
res_xml_device_filter.xml → app/src/main/res/xml/device_filter.xml
res_xml_backup_rules.xml → app/src/main/res/xml/backup_rules.xml
res_xml_data_extraction_rules.xml → app/src/main/res/xml/data_extraction_rules.xml
```

**Gradle:**
```
app_build.gradle.kts → app/build.gradle.kts
project_build.gradle.kts → build.gradle.kts
settings.gradle.kts → settings.gradle.kts
gradle.properties → gradle.properties
```

**Other:**
```
proguard-rules.pro → app/proguard-rules.pro
gitignore → .gitignore
```

**Firebase Config:**
```
google-services.json (from Step 1) → app/google-services.json
```

---

## Step 4: Build & Run

1. In Android Studio: **File → Sync Project with Gradle Files**
2. Wait for sync (downloads libraries, ~1 minute)
3. Connect your Android device (USB debugging enabled)
4. Click **Run** (green play button)
5. Select your device
6. App installs and launches!

---

## Step 5: Test Connection

1. **Connect hardware:**
    - USB-TTL adapter → Cycle Analyst
    - Adapter → Android device (via OTG cable)
    - Power on Cycle Analyst

2. **Grant permissions:**
    - App shows USB permission dialog
    - Click "OK"

3. **Verify connection:**
    - Status indicator turns **green**
    - "Connected to..." appears in log
    - "Header received" appears in log
    - Telemetry values update on screen

4. **Check Firebase:**
    - Go to Firebase Console → Realtime Database
    - You should see `cycle_readings` node
    - Data appears as you ride!

---

## Troubleshooting

### Build fails
**Check:**
- Is `google-services.json` in `app/` directory?
- Did Gradle sync complete?
- Internet connection OK?

### USB not detected
**Check:**
- Is OTG cable working? (try another device)
- Does phone support USB host? (most do)
- Try different USB ports on adapter

### No data received
**Check:**
- Is Cycle Analyst in ASCII mode (not binary)?
- Is it set to 9600 baud?
- Look for "Header received" in log (if missing, wrong mode)

### Firebase upload fails
**Check:**
- Internet connected? (WiFi or mobile data)
- Is `google-services.json` correct?
- Database rules allow writes?

---

## Next Steps

### Secure Firebase (Recommended)
After testing works, update database rules:

```json
{
  "rules": {
    "cycle_readings": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Then implement Firebase Authentication in your app.

### View Data
- Build a web dashboard
- Export to CSV
- Analyze in spreadsheets

### Customize
- All code is in `MainActivity.kt`
- Add new metrics
- Modify UI colors
- Add charts/graphs

---

## File Organization Reference

```
VoltStar/
├── app/
│   ├── src/main/
│   │   ├── java/com/abdulhayee/voltstar/
│   │   │   └── MainActivity.kt ← ALL YOUR CODE
│   │   ├── res/
│   │   │   ├── values/
│   │   │   │   ├── strings.xml
│   │   │   │   └── themes.xml
│   │   │   └── xml/
│   │   │       ├── device_filter.xml
│   │   │       ├── backup_rules.xml
│   │   │       └── data_extraction_rules.xml
│   │   └── AndroidManifest.xml
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── google-services.json ← FROM FIREBASE
├── build.gradle.kts
├── settings.gradle.kts
├── gradle.properties
└── .gitignore
```

---

## Complete Documentation

For detailed information:
- **README.md** - Full setup guide
- **PROJECT_STRUCTURE.md** - File placement details
- **TECHNICAL_DOCUMENTATION.md** - Architecture and code
- **FILE_MANIFEST.md** - Complete file list

---

## Support

**Logcat Filter:**
```bash
adb logcat -s VoltStar
```

**Common Log Messages:**
- ✅ "Application initialized" - App started
- ✅ "Requesting USB permission..." - USB detected
- ✅ "Connected to..." - Serial connection established
- ✅ "Header received" - Protocol sync complete
- ⚠️ "No USB devices found" - Plug in adapter
- ❌ "Parse error" - Wrong baud/mode on CA

---

**You're all set! Happy riding! 🚴‍♂️⚡**