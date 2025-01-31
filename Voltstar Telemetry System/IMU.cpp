#include "IMU.h"
#include "KalmanFilter.h"

Adafruit_MPU6050 mpu;
float axOffset = 0, ayOffset = 0, azOffset = 0;
bool mpuConnected = false;
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;
const float gravity = 9.81;
const float alpha = 0.05;  // Low-pass filter

void calibrateSensor() {
    Serial.println("Calibrating MPU6050...");
    float axSum = 0, aySum = 0, azSum = 0;
    int numSamples = 500;

    for (int i = 0; i < numSamples; i++) {
        sensors_event_t a, g, temp;
        mpu.getEvent(&a, &g, &temp);
        axSum += a.acceleration.x;
        aySum += a.acceleration.y;
        azSum += a.acceleration.z;
        delay(10);
    }

    axOffset = axSum / numSamples;
    ayOffset = aySum / numSamples;
    azOffset = azSum / numSamples;
    Serial.println("Calibration complete!");
}

void getIMU() {
    if (!mpuConnected) {
        Serial.println("MPU6050 not connected!");
        return;
    }

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Apply Kalman filter and offset correction
    float ax = kalmanFilter(a.acceleration.x - axOffset);
    float ay = kalmanFilter(a.acceleration.y - ayOffset);
    float az = kalmanFilter(a.acceleration.z - azOffset);

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
