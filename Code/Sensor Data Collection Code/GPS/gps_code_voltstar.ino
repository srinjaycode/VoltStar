#include <TinyGPS++.h>
#include <SoftwareSerial.h>

// GPS Module connection
SoftwareSerial GPS_SoftSerial(4, 3); // (Rx, Tx)
TinyGPSPlus gps;

// Constants
const double EARTH_RADIUS = 6371000;  // Earth's radius in meters
const unsigned long GPS_TIMEOUT = 60000; // 60 seconds timeout for initial GPS fix
unsigned long startupTime;

// Variables for speed calculation
float prevLat = 0.0, prevLon = 0.0;
unsigned long prevTime = 0;
float currentSpeed = 0.0;

double toRadians(double degrees) {
    return degrees * PI / 180.0;
}

double haversine(double lat1, double lon1, double lat2, double lon2) {
    double phi1 = toRadians(lat1);
    double phi2 = toRadians(lat2);
    double delta_phi = toRadians(lat2 - lat1);
    double delta_lambda = toRadians(lon2 - lon1);

    double a = sin(delta_phi / 2.0) * sin(delta_phi / 2.0) +
               cos(phi1) * cos(phi2) * sin(delta_lambda / 2.0) * sin(delta_lambda / 2.0);
    double c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a));

    return EARTH_RADIUS * c;
}

double calculateSpeed(double lat1, double lon1, unsigned long time1, 
                     double lat2, double lon2, unsigned long time2) {
    if (lat1 == 0.0 || lon1 == 0.0) return 0.0;
    
    double distance = haversine(lat1, lon1, lat2, lon2);
    double time_diff = (time2 - time1) / 1000.0; // Convert to seconds
    
    if (time_diff < 0.1) return currentSpeed; // Use previous speed if time difference is too small
    
    // Calculate new speed and apply simple moving average filter
    double newSpeed = distance / time_diff;
    currentSpeed = (currentSpeed * 0.7) + (newSpeed * 0.3); // Smooth the speed
    
    return currentSpeed;
}

void setup() {
    Serial.begin(9600);
    GPS_SoftSerial.begin(9600);
    
    Serial.println("GPS Module Initializing...");
    Serial.println("Please wait for satellite connection...");
    
    startupTime = millis();
}

void printGPSInfo() {
    Serial.println("\n-------- GPS DATA --------");
    
    if (gps.satellites.isValid()) {
        Serial.print("Satellites: ");
        Serial.println(gps.satellites.value());
    }

    if (gps.location.isValid()) {
        Serial.print("Latitude : ");
        Serial.println(gps.location.lat(), 6);
        Serial.print("Longitude: ");
        Serial.println(gps.location.lng(), 6);
        
        if (gps.speed.isValid()) {
            Serial.print("GPS Speed (km/h): ");
            Serial.println(gps.speed.kmph());
        }
        
        // Calculate our own speed using Haversine formula
        double currentLat = gps.location.lat();
        double currentLon = gps.location.lng();
        unsigned long currentTime = millis();

        if (prevLat != 0.0 && prevLon != 0.0) {
            double calculatedSpeed = calculateSpeed(prevLat, prevLon, prevTime,
                                                 currentLat, currentLon, currentTime);
            Serial.print("Calculated Speed (km/h): ");
            Serial.println(calculatedSpeed * 3.6, 1);  // Convert m/s to km/h
        }

        // Update previous values
        prevLat = currentLat;
        prevLon = currentLon;
        prevTime = currentTime;
    } else {
        unsigned long waitTime = (millis() - startupTime) / 1000;
        Serial.println("Location: Not Available");
        Serial.print("Waiting for fix: ");
        Serial.print(waitTime);
        Serial.println(" seconds");
    }

    if (gps.time.isValid()) {
        Serial.print("Time: ");
        if (gps.time.hour() < 10) Serial.print("0");
        Serial.print(gps.time.hour());
        Serial.print(":");
        if (gps.time.minute() < 10) Serial.print("0");
        Serial.print(gps.time.minute());
        Serial.print(":");
        if (gps.time.second() < 10) Serial.print("0");
        Serial.println(gps.time.second());
    }
    
    Serial.println("--------------------------");
}

void loop() {
    static unsigned long lastPrint = 0;
    
    // Read GPS data
    while (GPS_SoftSerial.available()) {
        gps.encode(GPS_SoftSerial.read());
    }

    // Update display every 2 seconds
    if (millis() - lastPrint >= 2000) {
        lastPrint = millis();
        printGPSInfo();
    }
}