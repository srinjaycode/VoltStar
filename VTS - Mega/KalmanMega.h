#ifndef KALMAN_FILTER_H
#define KALMAN_FILTER_H

// Kalman Filter Variables
extern float kfP;
extern float kfQ;
extern float kfR;
extern float kfX;
extern float kfPNow;

float kalmanFilter(float measurement);

#endif
