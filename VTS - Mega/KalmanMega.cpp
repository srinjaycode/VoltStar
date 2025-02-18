#include "KalmanFilter.h"

// Kalman Filter Variables
float kfP = 1, kfQ = 0.1, kfR = 0.5;
float kfX = 0, kfPNow = 1;

float kalmanFilter(float measurement) {
    kfPNow += kfQ;
    float kfK = kfPNow / (kfPNow + kfR);
    kfX += kfK * (measurement - kfX);
    kfPNow *= (1 - kfK);
    return kfX;
}
