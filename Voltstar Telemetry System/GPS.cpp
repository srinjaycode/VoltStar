#include "GPS_Module.h"

TinyGPSPlus gps;

#define GPS_BAUD 9600

void initGPS() {
    Serial.println("Initializing GPS Module...");
    Serial1.begin(GPS_BAUD);
}

void getGPS() {
    while (Serial1.available() > 0) {
        gps.encode(Serial1.read());
    }

    if (gps.location.isValid()) {
        Serial.print("Latitude: ");
        Serial.println(gps.location.lat(), 6);
        Serial.print("Longitude: ");
        Serial.println(gps.location.lng(), 6);
    } else {
        Serial.println("GPS: No Fix");
    }
}
