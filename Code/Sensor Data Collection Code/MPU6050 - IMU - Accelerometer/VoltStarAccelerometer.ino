#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

Adafruit_MPU6050 mpu;

// Calibration offsets
float axOffset = 0, ayOffset = 0, azOffset = 0;

// Gravity (in m/s^2)
const float gravity = 9.81;

// Low-pass filter alpha value
float alpha = 0.05;  // Slightly increased for faster responsiveness

// Filtered accelerations
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;

// Velocity and Distance
float velocityX = 0, velocityY = 0, velocityZ = 0;
float distanceX = 0, distanceY = 0, distanceZ = 0;

// Previous time (for deltaTime calculation)
unsigned long previousTime = 0;

// Small acceleration threshold to treat as zero
const float smallAccelThreshold = 0.02;  // m/s^2, below which acceleration is considered as zero

// Vibration thresholds
float vibrationLowThreshold = 1.5;  // Low vibration threshold
float vibrationHighThreshold = 3.0;  // High vibration threshold

// Variables for motion detection and reset
unsigned long motionDetectionTimeout = 3000;  // 3 seconds of no motion to reset distance
unsigned long lastMotionTime = 0;
bool isMoving = false;

// Kalman filter variables
float kfP = 1, kfQ = 0.1, kfR = 0.5; // Process noise, measurement noise, covariance
float kfX = 0, kfPNow = 1;          // Estimated value and covariance

// Kalman filter function
float kalmanFilter(float measurement) {
  kfPNow += kfQ;                                // Predict covariance
  float kfK = kfPNow / (kfPNow + kfR);          // Kalman gain
  kfX += kfK * (measurement - kfX);             // Update estimate
  kfPNow *= (1 - kfK);                          // Update covariance
  return kfX;
}

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

    delay(10);  // Small delay for consistent readings
  }

  // Average values for offsets
  axOffset = axSum / numSamples;
  ayOffset = aySum / numSamples;
  azOffset = azSum / numSamples;  // Includes gravity

  Serial.println("Calibration Complete!");
  Serial.print("Offsets - ax: "); Serial.print(axOffset);
  Serial.print(", ay: "); Serial.print(ayOffset);
  Serial.print(", az (gravity-included): "); Serial.println(azOffset);
}

void setup() {
  Serial.begin(115200);
  while (!Serial)
    delay(10);

  if (!mpu.begin()) {
    Serial.println("Could not find a valid MPU6050 sensor, check wiring!");
    while (1);
  }

  Serial.println("MPU6050 Found!");
  mpu.setAccelerometerRange(MPU6050_RANGE_4_G);  // Increased sensitivity to detect smaller changes
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);

  calibrateSensor();
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Subtract offsets to get real acceleration
  float ax = kalmanFilter(a.acceleration.x - axOffset);
  float ay = kalmanFilter(a.acceleration.y - ayOffset);
  float az = kalmanFilter(a.acceleration.z - azOffset);  // Removes gravity component

  // Apply low-pass filter (exponential smoothing) for noise reduction
  axFiltered = alpha * ax + (1 - alpha) * axFiltered;
  ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;
  azFiltered = alpha * az + (1 - alpha) * azFiltered;

  // Net acceleration magnitude (gravity-free)
  float accelerationMagnitude = sqrt(axFiltered * axFiltered + ayFiltered * ayFiltered + azFiltered * azFiltered);

  // Calculate deltaTime (in seconds)
  unsigned long currentTime = millis();
  float deltaTime = (currentTime - previousTime) / 1000.0;  // seconds

  // Update previous time
  previousTime = currentTime;

  // Small acceleration check to prevent drift
  if (fabs(axFiltered) < smallAccelThreshold) axFiltered = 0;
  if (fabs(ayFiltered) < smallAccelThreshold) ayFiltered = 0;
  if (fabs(azFiltered) < smallAccelThreshold) azFiltered = 0;

  // Integrate acceleration to calculate velocity (in m/s)
  velocityX += axFiltered * deltaTime;
  velocityY += ayFiltered * deltaTime;
  velocityZ += azFiltered * deltaTime;

  // Integrate velocity to calculate distance (in meters)
  distanceX += velocityX * deltaTime;
  distanceY += velocityY * deltaTime;
  distanceZ += velocityZ * deltaTime;

  // Motion detection - if there's no significant movement, reset distance
  if (accelerationMagnitude < smallAccelThreshold) {
    lastMotionTime = currentTime;
    isMoving = false;
  } else {
    if (!isMoving) {
      isMoving = true;
    }
  }

  // Reset velocity and distance if no motion for a defined period
  if (currentTime - lastMotionTime > motionDetectionTimeout) {
    velocityX = 0;
    velocityY = 0;
    velocityZ = 0;
    distanceX = 0;
    distanceY = 0;
    distanceZ = 0;
    Serial.println("Motion detected, reset distance.");
  }

  // Apply Zero Velocity Update (ZUPT) when acceleration is very low
  if (accelerationMagnitude < smallAccelThreshold) {
    velocityX = 0;
    velocityY = 0;
    velocityZ = 0;
  }

  // Categorize vibration level
  String vibrationLevel;
  if (accelerationMagnitude > vibrationHighThreshold) {
    vibrationLevel = "Crash";
  } else if (accelerationMagnitude > vibrationLowThreshold) {
    vibrationLevel = "Moderate Impact";
  } else {
    vibrationLevel = "Low (Turbulence)";
  }

  // Tilt calculation (using atan2 for better accuracy)
  float pitch = atan2(ayFiltered, azFiltered) * 180.0 / PI;  // In degrees
  float roll = atan2(axFiltered, azFiltered) * 180.0 / PI;   // In degrees

  // Calculate magnitudes for velocity, distance, pitch, and roll
  float velocityMagnitude = sqrt(velocityX * velocityX + velocityY * velocityY + velocityZ * velocityZ);
  float distanceMagnitude = sqrt(distanceX * distanceX + distanceY * distanceY + distanceZ * distanceZ);

  // Print results
  Serial.print("Filtered Acceleration (X, Y, Z): ");
  Serial.print(axFiltered); Serial.print(", ");
  Serial.print(ayFiltered); Serial.print(", ");
  Serial.println(azFiltered);

  Serial.print("Net Acceleration Magnitude (no gravity): ");
  Serial.println(accelerationMagnitude);

  Serial.print("Velocity Magnitude: ");
  Serial.println(velocityMagnitude);

  Serial.print("Distance Magnitude: ");
  Serial.println(distanceMagnitude);

  Serial.print("Vibration Level: ");
  Serial.println(vibrationLevel);

  Serial.print("Tilt (Pitch, Roll): ");
  Serial.print(pitch); Serial.print(", ");
  Serial.println(roll);

  // Fast update rate
  delay(20);  // 50 Hz update rate
}
