#include "IMU.h"
#include "KalmanFilter.h" // Use the existing Kalman filter

float axFiltered = 0, ayFiltered = 0, azFiltered = 0;
bool imuConnected = false;
const float alpha = 0.05;  // Low-pass filter

void initializeIMU() {
    Serial.println("Initializing built-in IMU...");

    if (!IMU.begin()) {
        Serial.println("Failed to initialize IMU!");
        imuConnected = false;
    } else {
        Serial.println("IMU initialized successfully.");
        imuConnected = true;
    }
}

void getIMU() {
    if (!imuConnected) {
        Serial.println("IMU not connected!");
        return;
    }

    float ax, ay, az;

    if (IMU.accelerationAvailable()) {
        IMU.readAcceleration(ax, ay, az);

        // Apply Kalman filter
        ax = kalmanFilter(ax);
        ay = kalmanFilter(ay);
        az = kalmanFilter(az);

        // Apply low-pass filter
        axFiltered = alpha * ax + (1 - alpha) * axFiltered;
        ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;
        azFiltered = alpha * az + (1 - alpha) * azFiltered;

        Serial.print("IMU Data - Ax: ");
        Serial.print(axFiltered);
        Serial.print(" Ay: ");
        Serial.print(ayFiltered);
        Serial.print(" Az: ");
        Serial.println(azFiltered);
    }
}
