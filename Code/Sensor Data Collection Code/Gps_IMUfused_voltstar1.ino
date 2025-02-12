#include <TinyGPS++.h>
#include <SoftwareSerial.h>
#include <Arduino_LSM6DS3.h>

// GPS Setup (keeping original configuration)
SoftwareSerial GPS_SoftSerial(11, 10);/* (Rx, Tx) */
TinyGPSPlus gps;      

// Keeping all original GPS and IMU variables...
volatile float minutes, seconds;
volatile int degree, secs, mins;
const int WINDOW_SIZE = 5;  
double prev_lats[WINDOW_SIZE] = {0};
double prev_lngs[WINDOW_SIZE] = {0};
unsigned long prev_times[WINDOW_SIZE] = {0};
int window_index = 0;
const double MIN_SPEED_THRESHOLD = 0.5;  
const double MIN_DISTANCE_THRESHOLD = 2.0;  
bool lastConnectionStatus = false;
float axOffset = 0, ayOffset = 0, azOffset = 0;
const float gravity = 9.81;
float alpha = 0.05;
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;
const float smallAccelThreshold = 0.02;

// Extended Kalman Filter State Vector [position, velocity, acceleration]
struct State {
    float x[3];     // State vector [position, velocity, acceleration]
    float P[3][3];  // State covariance matrix
};

class ExtendedKalmanFilter {
private:
    State state;
    float Q[3][3];  // Process noise covariance
    float R;        // Measurement noise covariance
    
    // Jacobian matrix for state transition
    float F[3][3];
    
    // Nonlinear state transition function
    void stateTransition(float dt) {
        // x = x + v*dt + 0.5*a*dt^2
        // v = v + a*dt
        // a = a
        float x_new = state.x[0] + state.x[1]*dt + 0.5*state.x[2]*dt*dt;
        float v_new = state.x[1] + state.x[2]*dt;
        float a_new = state.x[2];
        
        state.x[0] = x_new;
        state.x[1] = v_new;
        state.x[2] = a_new;
        
        // Update Jacobian F
        F[0][0] = 1;  F[0][1] = dt;   F[0][2] = 0.5*dt*dt;
        F[1][0] = 0;  F[1][1] = 1;    F[1][2] = dt;
        F[2][0] = 0;  F[2][1] = 0;    F[2][2] = 1;
    }
    
    // Matrix multiplication helper
    void multiplyMatrix(float A[3][3], float B[3][3], float C[3][3]) {
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                C[i][j] = 0;
                for(int k = 0; k < 3; k++) {
                    C[i][j] += A[i][k] * B[k][j];
                }
            }
        }
    }
    
public:
    ExtendedKalmanFilter() {
        // Initialize state
        for(int i = 0; i < 3; i++) {
            state.x[i] = 0;
            for(int j = 0; j < 3; j++) {
                state.P[i][j] = (i == j) ? 1.0 : 0.0;
                Q[i][j] = (i == j) ? 0.1 : 0.0;
                F[i][j] = (i == j) ? 1.0 : 0.0;
            }
        }
        
        // Initialize measurement noise
        R = 0.1;
    }
    
    void predict(float dt) {
        // Predict state using nonlinear state transition
        stateTransition(dt);
        
        // Predict covariance: P = F*P*F' + Q
        float temp[3][3];
        float F_transpose[3][3];
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                F_transpose[i][j] = F[j][i];
            }
        }
        
        multiplyMatrix(F, state.P, temp);
        multiplyMatrix(temp, F_transpose, state.P);
        
        // Add process noise
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                state.P[i][j] += Q[i][j];
            }
        }
    }
    
    void update(float measurement, int measurement_type) {
        // Measurement types: 0 = position, 1 = velocity, 2 = acceleration
        float H[3] = {0, 0, 0};
        H[measurement_type] = 1;
        
        // Calculate Kalman gain
        float PHt[3] = {0, 0, 0};
        for(int i = 0; i < 3; i++) {
            PHt[i] = state.P[i][measurement_type];
        }
        
        float S = state.P[measurement_type][measurement_type] + R;
        float K[3];
        for(int i = 0; i < 3; i++) {
            K[i] = PHt[i] / S;
        }
        
        // Update state
        float innovation = measurement - state.x[measurement_type];
        for(int i = 0; i < 3; i++) {
            state.x[i] += K[i] * innovation;
        }
        
        // Update covariance
        float temp[3][3];
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                temp[i][j] = -K[i] * H[j];
                if(i == j) temp[i][j] += 1;
            }
        }
        
        float new_P[3][3];
        multiplyMatrix(temp, state.P, new_P);
        memcpy(state.P, new_P, sizeof(new_P));
    }
    
    float getVelocity() { return state.x[1]; }
    float getAcceleration() { return state.x[2]; }
};

ExtendedKalmanFilter ekf;
unsigned long lastUpdate = 0;

// The rest of the original GPS functions remain unchanged
// [Previous calculateDistance and getAveragePosition functions remain the same]

double calculateFusedSpeed(double curr_lat, double curr_lng, unsigned long curr_time, float imu_accel) {
    // Calculate time delta
    float dt = (curr_time - lastUpdate) / 1000.0;
    lastUpdate = curr_time;
    
    // Predict step
    ekf.predict(dt);
    
    // Update with IMU acceleration
    ekf.update(imu_accel, 2);  // 2 = acceleration measurement
    
    // Calculate GPS speed if available
    if(curr_lat != 0 && curr_lng != 0) {
        double gps_speed = 0.0;
        prev_lats[window_index] = curr_lat;
        prev_lngs[window_index] = curr_lng;
        prev_times[window_index] = curr_time;
        
        if(prev_lats[0] != 0) {
            double avg_lat_prev, avg_lng_prev;
            getAveragePosition(avg_lat_prev, avg_lng_prev);
            double distance = calculateDistance(avg_lat_prev, avg_lng_prev, curr_lat, curr_lng);
            
            if(distance > MIN_DISTANCE_THRESHOLD) {
                unsigned long time_diff = 0;
                for(int i = 0; i < WINDOW_SIZE; i++) {
                    if(prev_times[i] != 0) {
                        time_diff = (curr_time - prev_times[i]) / 1000.0;
                        break;
                    }
                }
                
                if(time_diff > 0) {
                    gps_speed = distance / time_diff;
                    if(gps_speed < MIN_SPEED_THRESHOLD) {
                        gps_speed = 0;
                    }
                    // Update EKF with GPS velocity measurement
                    ekf.update(gps_speed, 1);  // 1 = velocity measurement
                }
            }
        }
        window_index = (window_index + 1) % WINDOW_SIZE;
    }
    
    return ekf.getVelocity();
}

// Setup and loop functions remain mostly the same, just updating the fusion call
void setup() {
    // [Previous setup code remains the same]
    lastUpdate = millis();
}

void loop() {
    smartDelay(250);
    bool loc_valid = gps.location.isValid();
    
    // [Previous connection status check remains the same]
    
    // Get IMU data
    float x, y, z;
    float net_accel = 0;
    
    if (IMU.accelerationAvailable() && IMU.readAcceleration(x, y, z)) {
        float ax = x - axOffset;
        float ay = y - ayOffset;
        float az = z - azOffset;

        axFiltered = alpha * ax + (1 - alpha) * axFiltered;
        ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;
        azFiltered = alpha * az + (1 - alpha) * azFiltered;

        net_accel = sqrt(axFiltered*axFiltered + ayFiltered*ayFiltered + azFiltered*azFiltered) * gravity;
    }

    if (loc_valid) {
        double lat_val = gps.location.lat();
        double lng_val = gps.location.lng();
        
        double fused_speed = calculateFusedSpeed(lat_val, lng_val, millis(), net_accel);
        double speed_kmh = fused_speed * 3.6;

        Serial.print("EKF Fused Speed (km/h): ");
        Serial.println(speed_kmh, 2);
        
        // [Rest of original GPS output remains the same]
    } else {
        double fused_speed = calculateFusedSpeed(0, 0, millis(), net_accel);
        Serial.print("EKF IMU-only Speed (km/h): ");
        Serial.println(fused_speed * 3.6, 2);
    }
}

// [Original helper functions remain unchanged]