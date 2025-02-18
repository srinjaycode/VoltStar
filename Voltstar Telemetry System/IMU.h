#ifndef IMU_H
#define IMU_H

#include <Arduino_LSM6DS3.h>

// IMU Sensor Variables
extern float axFiltered, ayFiltered, azFiltered;
extern bool imuConnected;

void initializeIMU();
void getIMU();

#endif
