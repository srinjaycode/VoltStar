#include "IMU.h"
#include "KalmanFilter.h"

Adafruit_MPU6050 mpu;
float axOffset = 0, ayOffset = 0, azOffset = 0;
bool mpuConnected = false;
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;
float velocityX = 0, velocityY = 0;
unsigned long previousTime = 0;
const float smallAccelThreshold = 0.02;

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

float getSpeed() {
    if (!mpuConnected) {
        return -1.0;  // Return -1 if IMU is not connected
    }

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Apply Kalman filter and offset correction
    float ax = kalmanFilter(a.acceleration.x - axOffset);
    float ay = kalmanFilter(a.acceleration.y - ayOffset);

    // Apply low-pass filter
    const float alpha = 0.05;
    axFiltered = alpha * ax + (1 - alpha) * axFiltered;
    ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;

    // Update timing
    unsigned long currentTime = millis();
    float deltaTime = (currentTime - previousTime) / 1000.0;
    previousTime = currentTime;

    // Zero small accelerations
    if (fabs(axFiltered) < smallAccelThreshold) axFiltered = 0;
    if (fabs(ayFiltered) < smallAccelThreshold) ayFiltered = 0;

    // Update velocities
    velocityX += axFiltered * deltaTime;
    velocityY += ayFiltered * deltaTime;

    // Return linear speed magnitude (ignoring Z)
    return sqrt(velocityX * velocityX + velocityY * velocityY);
}
