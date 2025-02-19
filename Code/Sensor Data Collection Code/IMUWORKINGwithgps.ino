#include <TinyGPS++.h>
#include <Wire.h>
#include <MPU6050.h>
#include <SoftwareSerial.h>

// GPS Setup
TinyGPSPlus gps;      
SoftwareSerial gpsSerial(10, 11); // RX, TX

volatile float minutes, seconds;
volatile int degree, secs, mins;

// Define Low-Pass Filter buffer and parameters
const int LPF_WINDOW = 10;  // Number of samples for moving average
float accelBuffer[LPF_WINDOW] = {0};  // Circular buffer for acceleration values
int accelIndex = 0;  // Index to keep track of buffer position

// Original GPS variables
const int WINDOW_SIZE = 5;  
double prev_lats[WINDOW_SIZE] = {0};
double prev_lngs[WINDOW_SIZE] = {0};
unsigned long prev_times[WINDOW_SIZE] = {0};
int window_index = 0;

const double MIN_SPEED_THRESHOLD = 0.5;  
const double MIN_DISTANCE_THRESHOLD = 2.0;  
bool lastConnectionStatus = false;

// MPU6050 Variables
MPU6050 mpu;
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
    float F[3][3];  // Jacobian matrix for state transition
    
    void stateTransition(float dt) {
        float x_new = state.x[0] + state.x[1]*dt + 0.5*state.x[2]*dt*dt;
        float v_new = state.x[1] + state.x[2]*dt;
        float a_new = state.x[2];
        
        state.x[0] = x_new;
        state.x[1] = v_new;
        state.x[2] = a_new;
        
        F[0][0] = 1;  F[0][1] = dt;   F[0][2] = 0.5*dt*dt;
        F[1][0] = 0;  F[1][1] = 1;    F[1][2] = dt;
        F[2][0] = 0;  F[2][1] = 0;    F[2][2] = 1;
    }
    
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
        R = 0.1;
    }
    
    void predict(float dt) {
        stateTransition(dt);
        
        float temp[3][3];
        float F_transpose[3][3];
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                F_transpose[i][j] = F[j][i];
            }
        }
        
        multiplyMatrix(F, state.P, temp);
        multiplyMatrix(temp, F_transpose, state.P);
        
        for(int i = 0; i < 3; i++) {
            for(int j = 0; j < 3; j++) {
                state.P[i][j] += Q[i][j];
            }
        }
    }
    
    void update(float measurement, int measurement_type) {
        float H[3] = {0, 0, 0};
        H[measurement_type] = 1;
        
        float PHt[3] = {0, 0, 0};
        for(int i = 0; i < 3; i++) {
            PHt[i] = state.P[i][measurement_type];
        }
        
        float S = state.P[measurement_type][measurement_type] + R;
        float K[3];
        for(int i = 0; i < 3; i++) {
            K[i] = PHt[i] / S;
        }
        
        float innovation = measurement - state.x[measurement_type];
        for(int i = 0; i < 3; i++) {
            state.x[i] += K[i] * innovation;
        }
        
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

double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    const double R = 6371000;
    double phi1 = lat1 * PI / 180;
    double phi2 = lat2 * PI / 180;
    double deltaPhi = (lat2 - lat1) * PI / 180;
    double deltaLambda = (lon2 - lon1) * PI / 180;

    double a = sin(deltaPhi/2) * sin(deltaPhi/2) +
               cos(phi1) * cos(phi2) *
               sin(deltaLambda/2) * sin(deltaLambda/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    return R * c;
}

void getAveragePosition(double &avg_lat, double &avg_lng) {
    avg_lat = 0;
    avg_lng = 0;
    int valid_count = 0;
    
    for(int i = 0; i < WINDOW_SIZE; i++) {
        if(prev_lats[i] != 0 && prev_lngs[i] != 0) {
            avg_lat += prev_lats[i];
            avg_lng += prev_lngs[i];
            valid_count++;
        }
    }
    
    if(valid_count > 0) {
        avg_lat /= valid_count;
        avg_lng /= valid_count;
    }
}

double calculateFusedSpeed(double curr_lat, double curr_lng, unsigned long curr_time, float imu_accel) {
    float dt = (curr_time - lastUpdate) / 1000.0;
    lastUpdate = curr_time;
    
    ekf.predict(dt);
    ekf.update(imu_accel, 2);  // Update with acceleration
    
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
                    ekf.update(gps_speed, 1);  // Update with GPS velocity
                }
            }
        }
        window_index = (window_index + 1) % WINDOW_SIZE;
    }
    
    return ekf.getVelocity();
}

void setup() {
    Serial.begin(9600);     // For debug output
    gpsSerial.begin(9600);  // For GPS module using Software Serial
    
    // Initialize I2C communication on A4 (SDA) and A5 (SCL)
    Wire.begin();           
    
    // Initialize MPU6050
    Serial.println("Initializing MPU6050...");
    while(!mpu.begin(MPU6050_SCALE_2000DPS, MPU6050_RANGE_2G)) {
        Serial.println("Could not find a valid MPU6050 sensor, check wiring!");
        delay(500);
    }

    // Calibrate MPU6050
    Serial.println("Calibrating MPU6050...");
    mpu.calibrateAccel();
    mpu.setThreshold(3);  // Set threshold for motion detection

    // Get initial offsets
    Vector normAccel = mpu.readNormalizeAccel();
    axOffset = normAccel.XAxis;
    ayOffset = normAccel.YAxis;
    azOffset = normAccel.ZAxis;
    
    lastUpdate = millis();
    Serial.println("Setup complete!");
}

void loop() {
    smartDelay(250);
    bool loc_valid = gps.location.isValid();

    if (loc_valid != lastConnectionStatus) {
        if (loc_valid) {
            Serial.println("GPS Connection Established");
        } else {
            Serial.println("GPS Connection Lost - Searching for satellites...");
        }
        lastConnectionStatus = loc_valid;
    }

    // Read normalized accelerometer data
    Vector normAccel = mpu.readNormalizeAccel();
    float net_accel = 0;
    
    // Constants for filtering
    const float LPF_ALPHA = 0.05; // Low-pass filter smoothing factor
    const float ACCEL_BIAS_THRESHOLD = 0.02; // Threshold to reset acceleration drift

    // Process accelerometer data
    float ax = normAccel.XAxis - axOffset;
    float ay = normAccel.YAxis - ayOffset;
    float az = normAccel.ZAxis - azOffset;

    // Apply low-pass filter to reduce sensor noise
    axFiltered = LPF_ALPHA * ax + (1 - LPF_ALPHA) * axFiltered;
    ayFiltered = LPF_ALPHA * ay + (1 - LPF_ALPHA) * ayFiltered;
    azFiltered = LPF_ALPHA * az + (1 - LPF_ALPHA) * azFiltered;

    // Compute net acceleration
    net_accel = sqrt(axFiltered * axFiltered + ayFiltered * ayFiltered + azFiltered * azFiltered) * gravity;

    // If the acceleration is below the small threshold, assume the car is at rest
    if (fabs(net_accel) < ACCEL_BIAS_THRESHOLD) {
        ekf.update(0, 1); // Set velocity to zero immediately
    }

    // Call the EKF update function with filtered acceleration
    ekf.update(net_accel, 2);

    if (loc_valid) {
        double lat_val = gps.location.lat();
        double lng_val = gps.location.lng();
        
        double fused_speed = calculateFusedSpeed(lat_val, lng_val, millis(), net_accel);
        double speed_kmh = fused_speed * 3.6;

        Serial.print("EKF Fused Speed (km/h): ");
        Serial.println(speed_kmh, 2);
        
        DegMinSec(lat_val);
        Serial.print("Latitude in Decimal Degrees : ");
        Serial.println(lat_val, 6);
        Serial.print("Latitude in Degrees Minutes Seconds : ");
        Serial.print(degree);
        Serial.print("\t");
        Serial.print(mins);
        Serial.print("\t");
        Serial.println(secs);

        DegMinSec(lng_val);
        Serial.print("Longitude in Decimal Degrees : ");
        Serial.println(lng_val, 6);
        Serial.print("Longitude in Degrees Minutes Seconds : ");
        Serial.print(degree);
        Serial.print("\t");
        Serial.print(mins);
        Serial.print("\t");
        Serial.println(secs);
    } else {
        double fused_speed = calculateFusedSpeed(0, 0, millis(), net_accel);
        Serial.print("EKF IMU-only Speed (km/h): ");
        Serial.println(fused_speed * 3.6, 2);
    }
}

static void smartDelay(unsigned long ms) {
    unsigned long start = millis();
    do {
        while (gpsSerial.available())
            gps.encode(gpsSerial.read());
    } while (millis() - start < ms);
}

void DegMinSec(double tot_val) {
    degree = (int)tot_val;
    minutes = tot_val - degree;
    seconds = 60 * minutes;
    minutes = (int)seconds;
    mins = (int)minutes;
    seconds = seconds - minutes;
    seconds = 60 * seconds;
    secs = (int)seconds;
}