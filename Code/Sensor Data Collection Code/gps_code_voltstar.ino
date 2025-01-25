#include <TinyGPS++.h>
#include <SoftwareSerial.h>
/* Create object named bt of the class SoftwareSerial */
SoftwareSerial GPS_SoftSerial(4, 3);/* (Rx, Tx) */
/* Create an object named gps of the class TinyGPSPlus */
TinyGPSPlus gps;			
// Earth's radius in meters
const double EARTH_RADIUS = 6371000;

// Previous GPS data for speed calculation
float prevLat = 0.0, prevLon = 0.0;
unsigned long prevTime = 0;

// Function to convert degrees to radians
double toRadians(double degrees) {
    return degrees * 3.14159265358979323846 / 180.0;
}

// Haversine formula to calculate the distance between two GPS points
double haversine(double lat1, double lon1, double lat2, double lon2) {
    double phi1 = toRadians(lat1);
    double phi2 = toRadians(lat2);
    double delta_phi = toRadians(lat2 - lat1);
    double delta_lambda = toRadians(lon2 - lon1);

    double a = sin(delta_phi / 2) * sin(delta_phi / 2) +
               cos(phi1) * cos(phi2) * sin(delta_lambda / 2) * sin(delta_lambda / 2);
    double c = 2 * atan2(sqrt(a), sqrt(1 - a));

    return EARTH_RADIUS * c; // Distance in meters
}

// Function to calculate speed
double calculateSpeed(double lat1, double lon1, unsigned long time1, double lat2, double lon2, unsigned long time2) {
  
    double distance = haversine(lat1, lon1, lat2, lon2); 
    Serial.print("Distance: ");
    Serial.println(distance);  // Distance in meters
    Serial.print("Time Change: ");
    Serial.println((time2-time1)/1000);
    
    double time_diff = (time2 - time1) / 1000.0;         // Time difference in seconds

    if (time_diff == 0) {
        return 0.0; // Avoid division by zero
    }
    return distance / time_diff; // Speed in meters per second
}

volatile float minutes, seconds;
volatile int degree, secs, mins;

void setup() {
  Serial.begin(9600);	/* Define baud rate for serial communication */
  GPS_SoftSerial.begin(9600);	/* Define baud rate for software serial communication */
}

void loop() {
        smartDelay(1000);	/* Generate precise delay of 1ms */
        unsigned long start;
        double lat_val, lng_val;
        uint8_t hr_val, min_val, sec_val;
        bool loc_valid, time_valid;
        lat_val = gps.location.lat();	/* Get latitude data */
        loc_valid = gps.location.isValid();	/* Check if valid location data is available */
        lng_val = gps.location.lng();	/* Get longtitude data */
       
        hr_val = gps.time.hour();	/* Get hour */
        min_val = gps.time.minute(); 	/* Get minutes */
        sec_val = gps.time.second();	/* Get seconds */
        time_valid = gps.time.isValid();	/* Check if valid time data is available */
        if (!loc_valid)
        {          
          Serial.print("Latitude : ");
          Serial.println("*****");
          Serial.print("Longitude : ");
          Serial.println("*****");
        }
        else
        {
          DegMinSec(lat_val);
          Serial.print("Latitude in Decimal Degrees : ");
          Serial.println(lat_val, 6);
          Serial.print("Latitude in Degrees Minutes Seconds : ");
          Serial.print(degree);
          Serial.print("\t");
          Serial.print(mins);
          Serial.print("\t");
          Serial.println(secs);
          DegMinSec(lng_val);	/* Convert the decimal degree value into degrees minutes seconds form */
          Serial.print("Longitude in Decimal Degrees : ");
          Serial.println(lng_val, 6);
          Serial.print("Longitude in Degrees Minutes Seconds : ");
          Serial.print(degree);
          Serial.print("\t");
          Serial.print(mins);
          Serial.print("\t");
          Serial.println(secs);
        }
        if (!time_valid)
        {
          // Serial.print("Time : ");
          // Serial.println("*****");
        }
        else
        {
          char time_string[32];
          // sprintf(time_string, "Time : %02d/%02d/%02d \n", hr_val, min_val, sec_val);
          // Serial.print(time_string);    
        }
          if (gps.location.isUpdated()) {
    double currentLat = gps.location.lat();
    double currentLon = gps.location.lng();
    unsigned long currentTime = millis();

    prevLat = currentLat;
    prevLon = currentLon;
    prevTime = currentTime;

    // Only calculate speed if previous data exists
    if (prevLat != 0.0 && prevLon != 0.0 && prevTime != 0) {
        double speed = calculateSpeed(prevLat, prevLon, prevTime, currentLat, currentLon, currentTime);
        Serial.print("Instantaneous Speed: ");
        Serial.print(speed);
        Serial.println(" m/s");
    }

    // Update previous data
    prevLat = currentLat;
    prevLon = currentLon;
    prevTime = currentTime;
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