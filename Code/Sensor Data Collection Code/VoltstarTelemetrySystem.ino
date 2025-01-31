#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ThreeWire.h>  
#include <RtcDS1302.h>
#include <math.h>

// Pin Definitions
#define ONE_WIRE_BUS_CONTROLLER    6  
#define ONE_WIRE_BUS_BATTERY       3  
#define RTC_DAT                    4  
#define RTC_CLK                    5  
#define RTC_RST                    2  
// For Arduino Mega:
// SDA pin: 20 (dedicated)
// SCL pin: 21 (dedicated)

// Function Prototypes
void calibrateSensor();
void getTemperature();
void getIMU();
void getRTC();
float kalmanFilter(float measurement);

// Global Objects
Adafruit_MPU6050 mpu;
OneWire oneWireController(ONE_WIRE_BUS_CONTROLLER);
OneWire oneWireBattery(ONE_WIRE_BUS_BATTERY);
DallasTemperature controllerSensor(&oneWireController);
DallasTemperature batterySensor(&oneWireBattery);
DeviceAddress controllerThermometer, batteryThermometer;
ThreeWire myWire(RTC_DAT, RTC_CLK, RTC_RST);
RtcDS1302<ThreeWire> Rtc(myWire);

// Sensor Status Flags
bool mpuConnected = false;
bool controllerTempConnected = false;
bool batteryTempConnected = false;

// IMU Calibration and Filtering Variables
float axOffset = 0, ayOffset = 0, azOffset = 0;
const float gravity = 9.81;
float alpha = 0.05;  // Low-pass filter value
float axFiltered = 0, ayFiltered = 0, azFiltered = 0;

// Motion Variables
float velocityX = 0, velocityY = 0, velocityZ = 0;
float distanceX = 0, distanceY = 0, distanceZ = 0;
unsigned long previousTime = 0;
const float smallAccelThreshold = 0.02;
float vibrationLowThreshold = 1.5;
float vibrationHighThreshold = 3.0;

// Motion Detection Variables
unsigned long motionDetectionTimeout = 3000;
unsigned long lastMotionTime = 0;
bool isMoving = false;

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

void calibrateSensor() {
  Serial.println("----------------------------------------");
  Serial.println("Calibrating MPU6050...");
  
  float axSum = 0, aySum = 0, azSum = 0;
  int numSamples = 500;
  
  for (int i = 0; i < numSamples; i++) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    
    axSum += a.acceleration.x;
    aySum += a.acceleration.y;
    azSum += a.acceleration.z;
    
    delay(10);
  }
  
  axOffset = axSum / numSamples;
  ayOffset = aySum / numSamples;
  azOffset = azSum / numSamples;
  
  Serial.println("Calibration complete!");
  Serial.println("----------------------------------------");
}

void setup() {
  Serial.begin(115200);
  Wire.begin();  // Using default Mega pins: SDA(20) and SCL(21)
  
  Serial.println("\n========== System Initialization ==========");
  
  // Initialize RTC
  Rtc.Begin();
  if (!Rtc.IsDateTimeValid()) {
    Serial.println("ERROR: RTC not configured!");
    Rtc.SetDateTime(RtcDateTime(__DATE__, __TIME__));
  } else {
    Serial.println("RTC initialized successfully");
  }
  
  // Initialize MPU6050
  if (!mpu.begin()) {
    Serial.println("ERROR: MPU6050 not found!");
    mpuConnected = false;
  } else {
    mpuConnected = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
    Serial.println("MPU6050 initialized successfully");
  }
  
  // Initialize Temperature Sensors
  controllerSensor.begin();
  batterySensor.begin();
  
  if (!controllerSensor.getAddress(controllerThermometer, 0)) {
    Serial.println("ERROR: Controller temp sensor not found!");
    controllerTempConnected = false;
  } else {
    controllerSensor.setResolution(controllerThermometer, 12);
    controllerTempConnected = true;
    Serial.println("Controller temperature sensor initialized");
  }
  
  if (!batterySensor.getAddress(batteryThermometer, 0)) {
    Serial.println("ERROR: Battery temp sensor not found!");
    batteryTempConnected = false;
  } else {
    batterySensor.setResolution(batteryThermometer, 12);
    batteryTempConnected = true;
    Serial.println("Battery temperature sensor initialized");
  }
  
  if (mpuConnected) {
    calibrateSensor();
  }
  
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

void getRTC() {
  RtcDateTime now = Rtc.GetDateTime();
  
  char datestring[20];
  snprintf_P(datestring, 
          20,
          PSTR("%02u/%02u/%04u %02u:%02u:%02u"),
          now.Month(),
          now.Day(),
          now.Year(),
          now.Hour(),
          now.Minute(),
          now.Second() );
  Serial.println("\n[TIME]");
  Serial.println(datestring);
}

void getTemperature() {
  Serial.println("\n[TEMPERATURE READINGS]");
  
  if (controllerTempConnected) {
    controllerSensor.requestTemperatures();
    float tempC_controller = controllerSensor.getTempC(controllerThermometer);
    
    if (tempC_controller != DEVICE_DISCONNECTED_C) {
      Serial.print("Controller: ");
      Serial.print(tempC_controller, 1);
      Serial.println(" °C");
    }
  }
  
  if (batteryTempConnected) {
    batterySensor.requestTemperatures();
    float tempC_battery = batterySensor.getTempC(batteryThermometer);
    
    if (tempC_battery != DEVICE_DISCONNECTED_C) {
      Serial.print("Battery:    ");
      Serial.print(tempC_battery, 1);
      Serial.println(" °C");
    }
  }
}

void getIMU() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  
  // Apply Kalman filter and offset correction
  float ax = kalmanFilter(a.acceleration.x - axOffset);
  float ay = kalmanFilter(a.acceleration.y - ayOffset);
  float az = kalmanFilter(a.acceleration.z - azOffset);
  
  // Apply low-pass filter
  axFiltered = alpha * ax + (1 - alpha) * axFiltered;
  ayFiltered = alpha * ay + (1 - alpha) * ayFiltered;
  azFiltered = alpha * az + (1 - alpha) * azFiltered;
  
  // Calculate acceleration magnitude
  float accelerationMagnitude = sqrt(axFiltered * axFiltered + 
                                   ayFiltered * ayFiltered + 
                                   azFiltered * azFiltered);
  
  // Update timing
  unsigned long currentTime = millis();
  float deltaTime = (currentTime - previousTime) / 1000.0;
  previousTime = currentTime;
  
  // Zero small accelerations
  if (fabs(axFiltered) < smallAccelThreshold) axFiltered = 0;
  if (fabs(ayFiltered) < smallAccelThreshold) ayFiltered = 0;
  if (fabs(azFiltered) < smallAccelThreshold) azFiltered = 0;
  
  // Update velocities and calculate speed
  velocityX += axFiltered * deltaTime;
  velocityY += ayFiltered * deltaTime;
  velocityZ += azFiltered * deltaTime;
  
  // Calculate total speed (magnitude of velocity vector)
  float totalSpeed = sqrt(velocityX * velocityX + 
                         velocityY * velocityY + 
                         velocityZ * velocityZ);
  
  // Determine vibration level
  String vibrationLevel;
  if (accelerationMagnitude < vibrationLowThreshold) {
    vibrationLevel = "Low to None";
  } else if (accelerationMagnitude < vibrationHighThreshold) {
    vibrationLevel = "Moderate Turbulence";
  } else {
    vibrationLevel = "CRASH DETECTED";
  }
  
  // Print results
  Serial.println("\n[MPU6050 READINGS]");
  Serial.print("Speed:        ");
  Serial.print(totalSpeed * 3.6, 1);  // Convert m/s to km/h
  Serial.println(" km/h");
  
  Serial.print("Acceleration: ");
  Serial.print(accelerationMagnitude, 2);
  Serial.println(" m/s²");
  
  Serial.print("Vibration:    ");
  Serial.println(vibrationLevel);
}