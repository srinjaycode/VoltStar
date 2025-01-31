#ifndef IMU_H
#define IMU_H

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>

// IMU Sensor
extern Adafruit_MPU6050 mpu;

// IMU Calibration and Filtering Variables
extern float axOffset, ayOffset, azOffset;
extern float axFiltered, ayFiltered, azFiltered;
extern bool mpuConnected;

void calibrateSensor();
void getIMU();

#endif
