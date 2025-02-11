#include <TinyGPS++.h>
#include <SoftwareSerial.h>
/* Create object named bt of the class SoftwareSerial */
SoftwareSerial GPS_SoftSerial(11, 10);/* (Rx, Tx) */
/* Create an object named gps of the class TinyGPSPlus */
TinyGPSPlus gps;			

volatile float minutes, seconds;
volatile int degree, secs, mins;

// Variables for speed calculation
const int WINDOW_SIZE = 5;  // Size of moving average window
double prev_lats[WINDOW_SIZE] = {0};
double prev_lngs[WINDOW_SIZE] = {0};
unsigned long prev_times[WINDOW_SIZE] = {0};
int window_index = 0;

const double MIN_SPEED_THRESHOLD = 0.5;  // Minimum speed in m/s to be considered moving
const double MIN_DISTANCE_THRESHOLD = 2.0;  // Minimum distance in meters to be considered real movement

// Add GPS connection tracking
bool lastConnectionStatus = false;

// Function to calculate Haversine distance between two points
double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
    const double R = 6371000; // Earth's radius in meters
    
    // Convert degrees to radians
    double phi1 = lat1 * PI / 180;
    double phi2 = lat2 * PI / 180;
    double deltaPhi = (lat2 - lat1) * PI / 180;
    double deltaLambda = (lon2 - lon1) * PI / 180;

    double a = sin(deltaPhi/2) * sin(deltaPhi/2) +
               cos(phi1) * cos(phi2) *
               sin(deltaLambda/2) * sin(deltaLambda/2);
    double c = 2 * atan2(sqrt(a), sqrt(1-a));
    double distance = R * c;
    
    return distance; // Returns distance in meters
}

// Function to get average position from window
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

// Function to calculate speed with noise filtering
double calculateFilteredSpeed(double curr_lat, double curr_lng, unsigned long curr_time) {
    double speed = 0.0;
    
    // Store current values in circular buffer
    prev_lats[window_index] = curr_lat;
    prev_lngs[window_index] = curr_lng;
    prev_times[window_index] = curr_time;
    
    // Only calculate speed if we have enough samples
    if(prev_lats[0] != 0) {
        double avg_lat_prev, avg_lng_prev;
        getAveragePosition(avg_lat_prev, avg_lng_prev);
        
        // Calculate distance using averaged positions
        double distance = calculateDistance(avg_lat_prev, avg_lng_prev, curr_lat, curr_lng);
        
        // Only consider movement if distance is above threshold
        if(distance > MIN_DISTANCE_THRESHOLD) {
            // Find oldest valid time in our window
            unsigned long time_diff = 0;
            for(int i = 0; i < WINDOW_SIZE; i++) {
                if(prev_times[i] != 0) {
                    time_diff = (curr_time - prev_times[i]) / 1000.0; // Convert to seconds
                    break;
                }
            }
            
            if(time_diff > 0) {
                speed = distance / time_diff;
                
                // Apply minimum speed threshold
                if(speed < MIN_SPEED_THRESHOLD) {
                    speed = 0;
                }
            }
        }
    }
    
    // Update window index
    window_index = (window_index + 1) % WINDOW_SIZE;
    
    return speed;
}

void setup() {
  Serial.begin(9600);	/* Define baud rate for serial communication */
  GPS_SoftSerial.begin(9600);	/* Define baud rate for software serial communication */
}

void loop() {
        smartDelay(250);
        bool loc_valid = gps.location.isValid();

        // Check for connection status change
        if (loc_valid != lastConnectionStatus) {
            if (loc_valid) {
                Serial.println("GPS Connection Established");
            } else {
                Serial.println("GPS Connection Lost - Searching for satellites...");
            }
            lastConnectionStatus = loc_valid;
        }

        // Only proceed with data output if we have a valid location
        if (loc_valid) {
            double lat_val = gps.location.lat();
            double lng_val = gps.location.lng();
            double alt_m_val = gps.altitude.meters();
            uint8_t hr_val = gps.time.hour();
            uint8_t min_val = gps.time.minute();
            uint8_t sec_val = gps.time.second();
            bool alt_valid = gps.altitude.isValid();
            bool time_valid = gps.time.isValid();

            // Calculate filtered speed
            double speed_mps = calculateFilteredSpeed(lat_val, lng_val, millis());
            double speed_kmh = speed_mps * 3.6;
            Serial.print("Speed (km/h): ");
            Serial.println(speed_kmh, 2);

            // Output location data
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

            // Output altitude if valid
            if (alt_valid) {
                Serial.print("Altitude : ");
                Serial.println(alt_m_val, 6);
            }

            // Output time if valid
            if (time_valid) {
                char time_string[32];
                sprintf(time_string, "Time : %02d/%02d/%02d \n", hr_val, min_val, sec_val);
                Serial.print(time_string);
            }
        } else {
            Serial.println("Searching for GPS signal...");
        }
}
static void smartDelay(unsigned long ms)
{
  unsigned long start = millis();
  do 
  {
    while (GPS_SoftSerial.available())	/* Encode data read from GPS while data is available on serial port */
      gps.encode(GPS_SoftSerial.read());
/* Encode basically is used to parse the string received by the GPS and to store it in a buffer so that information can be extracted from it */
  } while (millis() - start < ms);
}

void DegMinSec( double tot_val)		/* Convert data in decimal degrees into degrees minutes seconds form */
{  
  degree = (int)tot_val;
  minutes = tot_val - degree;
  seconds = 60 * minutes;
  minutes = (int)seconds;
  mins = (int)minutes;
  seconds = seconds - minutes;
  seconds = 60 * seconds;
  secs = (int)seconds;
}