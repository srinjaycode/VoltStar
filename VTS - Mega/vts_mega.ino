#include "IMU.h"
#include "Temperature.h"
#include "RTC_Module.h"

void setup() {
    Serial.begin(115200);
    Wire.begin();

    Serial.println("\n========== System Initialization ==========");

    initRTC();

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

    initTemperatureSensors();

    Serial.println("========== Setup Complete ==========\n");
}

void loop() {
    getRTC();
    getTemperature();
    getIMU();
    delay(1000);
}
