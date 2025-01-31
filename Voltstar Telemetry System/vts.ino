#include "IMU.h"
#include "Temperature.h"
#include "RTC_Module.h"

void setup() {
    Serial.begin(115200);
    Wire.begin();  // Use default Mega SDA (20) and SCL (21)

    Serial.println("\n========== System Initialization ==========");

    // Initialize RTC
    initRTC();

    // Initialize MPU6050
    if (!mpu.begin()) {
        Serial.println("ERROR: MPU6050 not found!");
        mpuConnected = false;
    } else {
        mpuConnected = true;
        mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
        mpu.setGyroRange(MPU6050_RANGE_250_DEG);
        Serial.println("MPU6050 initialized successfully");
        calibrateSensor();
    }

    // Initialize Temperature Sensors
    initTemperatureSensors();

    Serial.println("========== Setup Complete ==========\n");
}

void loop() {
    Serial.println("\n-------------- New Reading --------------");

    getRTC();

    if (controllerTempConnected || batteryTempConnected) {
        getTemperature();
    }

    if (mpuConnected) {
        getIMU();
    }

    Serial.println("----------------------------------------");
    delay(1000);
}
