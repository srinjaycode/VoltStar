# VoltStar Android App (VAA)

The **VoltStar Android App** is an Android application designed to read real-time data from a **Cycle Analyst V3** device and upload it to a **Firebase Realtime Database**. The data can then be visualized on a web dashboard for analytics and performance monitoring.

---

## **Features**

- Reads real-time serial data from **Cycle Analyst V3** via USB or Bluetooth adapters.  
- Parses the ASCII data stream including:
  - **Speed (S)**  
  - **Voltage (V)**  
  - **Current (A)**  
  - **RPM**  
  - **Distance (D)**  
  - **Amp-hours (Ah)**  
  - **Degrees of rotation (Deg)**  
  - **Timestamp**  
- Uploads parsed data to a **Firebase Realtime Database**.  
- Supports fast log rates (10Hz) with display averaging settings for unique readings.  
- Works over **Wi-Fi** (required for Firebase data upload).  

---

## **Code Overview**

### **Android App**

- **Data Reading:** Reads serial ASCII data from Cycle Analyst and parses it into individual fields.  
- **Firebase Upload:** Writes parsed readings to Firebase Realtime Database.  
- **Configuration:** `build.gradle.kts` and `gradle.properties` for dependencies and build setup.  
- **UI:** Minimal UI; the main purpose is data collection and upload.

### **Firebase**

- **Realtime Database:** Stores telemetry readings for use in a web dashboard.  
- **Test Data:** JSON structure for testing if the Cycle Analyst device is unavailable.

Example Firebase JSON structure:

```json
{
  "cycle_readings": {
    "reading_001": {
      "speed": 0,
      "voltage": 54.4,
      "current": 0.3,
      "rpm": 0,
      "distance": 0,
      "ah": 0,
      "deg": 0,
      "timestamp": 1730304000000
    }
    // ... more readings
  }
}
```

---

## **Libraries Used**

- `com.google.firebase:firebase-database-ktx` – Firebase Realtime Database integration  
- `androidx.lifecycle:lifecycle-runtime-ktx` – Lifecycle-aware components  
- `androidx.activity:activity-compose` – Jetpack Compose activity support  
- `androidx.compose.ui:ui`, `material3`, `tooling` – Compose UI framework  

---

## **Project Structure**

```
/app/                   # Android Studio app module
/build.gradle.kts       # App module Gradle build script
/gradle/                # Gradle wrapper
/gradle.properties      # Gradle properties
/gradlew                # Gradle wrapper script (Linux/Mac)
/gradlew.bat            # Gradle wrapper script (Windows)
/settings.gradle.kts    # Gradle settings
/.gitignore             # Git ignore rules
```

> ⚠️ **Do not include `google-services.json` in Git; each developer must generate their own.**

---

## **Installation & Setup**

### **Android Studio**

1. Clone the repository:

```bash
git clone https://github.com/<your-username>/<repo>.git
cd <repo>
git checkout android-app
```

2. Place your **Firebase `google-services.json`** in the `app/` folder.  

3. Open the project in **Android Studio**.  

4. Sync Gradle to download dependencies.  

---

### **Firebase Setup**

1. Create a new Firebase project in [Firebase Console](https://console.firebase.google.com/).  
2. Add an **Android app** with package name:

```
com.abdulhayee.voltstar
```

3. Download the generated `google-services.json`.  
4. Place it in the `app/` folder of the project.  

---

### **Running the App**

1. Connect an Android device or start an emulator.  
2. Build and run the project in Android Studio.  
3. The app will read data from the Cycle Analyst and upload it to Firebase.  
4. Data can be accessed in Firebase or visualized in a web dashboard.

---

## **How to Use**

- **For Users:** Connect your Cycle Analyst device and monitor the data upload.  
- **For Monitoring:** Use Firebase console or future web dashboard to analyze readings.  

---

## **Git Workflow**

### **Initial Commit**

```bash
git clone https://github.com/<your-username>/<repo>.git
cd <repo>
git checkout android-app

git add app/ gradle/ build.gradle.kts gradle.properties gradlew gradlew.bat settings.gradle.kts .gitignore
git commit -m "Add Android Studio project files"
git push origin android-app
```

### **Updating the Branch**

```bash
git add app/ gradle/ build.gradle.kts gradle.properties gradlew gradlew.bat settings.gradle.kts .gitignore
git commit -m "Update Android app files"
git push origin android-app
```

### **Feature Branch Workflow**

```bash
git checkout -b feature/your-feature-name
git add .
git commit -m "Describe feature or fix"
git push origin feature/your-feature-name
```

---

## **Notes**

- Each developer must generate their own `google-services.json`.  
- **deg** represents degrees of rotation from Cycle Analyst.  
- Test JSON data can be used if the Cycle Analyst device is unavailable.  
- This README provides complete setup, build, run, and update instructions for the Android app branch.
