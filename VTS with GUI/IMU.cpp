#include "IMU.h"
#include "KalmanFilter.h"

Adafruit_MPU6050 mpu;
float axOffset = 0, ayOffset = 0, azOffset = 0;
bool mpuConnected = false;
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;
float velocityX = 0, velocityY = 0, velocityZ = 0;
unsigned long previousTime = 0;
const float smallAccelThreshold = 0.02;
const float vibrationLowThreshold = 1.5;
const float vibrationHighThreshold = 3.0;

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
        Serial.println("IMU,NC,NC,NC,NC,NC,NC,NC");
        return;
    }

    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);

    // Apply Kalman filter and offset correction
    float ax = kalmanFilter(a.acceleration.x - axOffset);
    float ay = kalmanFilter(a.acceleration.y - ayOffset);
    float az = kalmanFilter(a.acceleration.z - azOffset);

    // Apply low-pass filter
    const float alpha = 0.05;
    axFiltered = alpha * ax + (1 - alpha) * axFiltered;
    ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;
    azFiltered = alpha * az + (1 - alpha) * azFiltered;

    // Update timing
    unsigned long currentTime = millis();
    float deltaTime = (currentTime - previousTime) / 1000.0;
    previousTime = currentTime;

    // Zero small accelerations
    if (fabs(axFiltered) < smallAccelThreshold) axFiltered = 0;
    if (fabs(ayFiltered) < smallAccelThreshold) ayFiltered = 0;
    if (fabs(azFiltered) < smallAccelThreshold) azFiltered = 0;

    // Update velocities
    velocityX += axFiltered * deltaTime;
    velocityY += ayFiltered * deltaTime;
    velocityZ += azFiltered * deltaTime;

    // Calculate total speed (magnitude of velocity vector)
    float totalSpeed = sqrt(velocityX * velocityX + 
                            velocityY * velocityY + 
                            velocityZ * velocityZ);

    // Determine vibration level
    float accelerationMagnitude = sqrt(axFiltered * axFiltered + 
                                       ayFiltered * ayFiltered + 
                                       azFiltered * azFiltered);

    String vibrationLevel = "Low";
    if (accelerationMagnitude >= vibrationLowThreshold && accelerationMagnitude < vibrationHighThreshold) {
        vibrationLevel = "Moderate";
    } else if (accelerationMagnitude >= vibrationHighThreshold) {
        vibrationLevel = "High";
    }

    // Send data in CSV format
    Serial.print("IMU,");
    Serial.print(axFiltered, 2); Serial.print(",");
    Serial.print(ayFiltered, 2); Serial.print(",");
    Serial.print(azFiltered, 2); Serial.print(",");
    Serial.print(velocityX, 2); Serial.print(",");
    Serial.print(velocityY, 2); Serial.print(",");
    Serial.print(velocityZ, 2); Serial.print(",");
    Serial.print(totalSpeed * 3.6, 2); Serial.print(",");  // Convert to km/h
    Serial.println(vibrationLevel);
}
