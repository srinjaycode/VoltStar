#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

// Pin Definitions
#define ONE_WIRE_BUS_CONTROLLER    3  // Temperature sensor for controller
#define ONE_WIRE_BUS_BATTERY       6  // Temperature sensor for battery
#define MPU_SDA                    A4 // Default SDA pin for MPU6050
#define MPU_SCL                    A5 // Default SCL pin for MPU6050

// Function Prototypes - Added these at the top
void calibrateSensor();
void getTemperature();
void getIMU();
float kalmanFilter(float measurement);

// Global Objects
Adafruit_MPU6050 mpu;
OneWire oneWireController(ONE_WIRE_BUS_CONTROLLER);
OneWire oneWireBattery(ONE_WIRE_BUS_BATTERY);
DallasTemperature controllerSensor(&oneWireController);
DallasTemperature batterySensor(&oneWireBattery);
DeviceAddress controllerThermometer, batteryThermometer;

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

// Kalman Filter Implementation
float kalmanFilter(float measurement) {
  kfPNow += kfQ;
  float kfK = kfPNow / (kfPNow + kfR);
  kfX += kfK * (measurement - kfX);
  kfPNow *= (1 - kfK);
  return kfX;
}

// Calibration Implementation
void calibrateSensor() {
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
  
  Serial.println("Calibration Complete!");
  Serial.print("Offsets - ax: "); Serial.print(axOffset);
  Serial.print(", ay: "); Serial.print(ayOffset);
  Serial.print(", az: "); Serial.println(azOffset);
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Sensor Initialization Starting ===");
  
  // Initialize I2C for MPU6050
  Wire.begin();
  Serial.println("\nChecking MPU6050 connection...");
  Serial.println("MPU6050 should be connected to:");
  Serial.println("- SDA: Pin A4");
  Serial.println("- SCL: Pin A5");
  Serial.println("- VCC: 3.3V (preferred) or 5V");
  Serial.println("- GND: GND");
  
  if (!mpu.begin()) {
    Serial.println("❌ Failed to find MPU6050 chip - Please check connections!");
    mpuConnected = false;
  } else {
    Serial.println("✓ MPU6050 connected successfully!");
    mpuConnected = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  }
  
  // Initialize Temperature Sensors
  Serial.println("\nChecking temperature sensors...");
  Serial.println("Temperature sensors should be connected to:");
  Serial.println("Controller Sensor:");
  Serial.println("- Data: Pin D6");
  Serial.println("- VCC: 5V");
  Serial.println("- GND: GND");
  Serial.println("Battery Sensor:");
  Serial.println("- Data: Pin D3");
  Serial.println("- VCC: 5V");
  Serial.println("- GND: GND");
  Serial.println("Don't forget the 4.7k pull-up resistor between Data and VCC!");
  
  controllerSensor.begin();
  batterySensor.begin();
  
  // Check for temperature sensors presence
  delay(1000); // Give sensors time to initialize
  
  Serial.println("\nSearching for temperature sensors...");
  
  if (!controllerSensor.getAddress(controllerThermometer, 0)) {
    Serial.println("❌ Controller temperature sensor not found on pin D6");
    Serial.println("   Check connections and pull-up resistor");
    controllerTempConnected = false;
  } else {
    Serial.println("✓ Controller temperature sensor found!");
    controllerSensor.setResolution(controllerThermometer, 12);
    controllerTempConnected = true;
    // Print the address for debugging
    Serial.print("   Address: ");
    for (uint8_t i = 0; i < 8; i++) {
      Serial.print(controllerThermometer[i], HEX);
      Serial.print(" ");
    }
    Serial.println();
  }
  
  if (!batterySensor.getAddress(batteryThermometer, 0)) {
    Serial.println("❌ Battery temperature sensor not found on pin D3");
    Serial.println("   Check connections and pull-up resistor");
    batteryTempConnected = false;
  } else {
    Serial.println("✓ Battery temperature sensor found!");
    batterySensor.setResolution(batteryThermometer, 12);
    batteryTempConnected = true;
    // Print the address for debugging
    Serial.print("   Address: ");
    for (uint8_t i = 0; i < 8; i++) {
      Serial.print(batteryThermometer[i], HEX);
      Serial.print(" ");
    }
    Serial.println();
  }
  
  if (mpuConnected) {
    calibrateSensor();
  }
  
  Serial.println("\n=== Initialization Complete ===");
  Serial.println("Status Summary:");
  Serial.println(mpuConnected ? "✓ MPU6050: Connected" : "❌ MPU6050: Not Connected");
  Serial.println(controllerTempConnected ? "✓ Controller Temp: Connected" : "❌ Controller Temp: Not Connected");
  Serial.println(batteryTempConnected ? "✓ Battery Temp: Connected" : "❌ Battery Temp: Not Connected");
  Serial.println("=============================\n");
}

void loop() {
  // Only read temperatures if sensors are connected
  if (controllerTempConnected || batteryTempConnected) {
    getTemperature();
  }
  
  // Only read IMU if connected
  if (mpuConnected) {
    getIMU();
  }
  
  delay(1000); // Increased delay for readability
}

void getTemperature() {
  Serial.println("\n--- Temperature Readings ---");
  
  if (controllerTempConnected) {
    controllerSensor.requestTemperatures();
    float tempC_controller = controllerSensor.getTempC(controllerThermometer);
    
    if (tempC_controller != DEVICE_DISCONNECTED_C) {
      Serial.print("Controller: ");
      Serial.print(tempC_controller);
      Serial.println("°C");
    } else {
      Serial.println("❌ Error reading controller temperature");
      controllerTempConnected = false; // Mark as disconnected if reading fails
    }
  }
  
  if (batteryTempConnected) {
    batterySensor.requestTemperatures();
    float tempC_battery = batterySensor.getTempC(batteryThermometer);
    
    if (tempC_battery != DEVICE_DISCONNECTED_C) {
      Serial.print("Battery: ");
      Serial.print(tempC_battery);
      Serial.println("°C");
    } else {
      Serial.println("❌ Error reading battery temperature");
      batteryTempConnected = false; // Mark as disconnected if reading fails
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
  
  // Time calculations
  unsigned long currentTime = millis();
  float deltaTime = (currentTime - previousTime) / 1000.0;
  previousTime = currentTime;
  
  // Zero small accelerations
  if (fabs(axFiltered) < smallAccelThreshold) axFiltered = 0;
  if (fabs(ayFiltered) < smallAccelThreshold) ayFiltered = 0;
  if (fabs(azFiltered) < smallAccelThreshold) azFiltered = 0;
  
  // Update velocities and distances
  velocityX += axFiltered * deltaTime;
  velocityY += ayFiltered * deltaTime;
  velocityZ += azFiltered * deltaTime;
  
  distanceX += velocityX * deltaTime;
  distanceY += velocityY * deltaTime;
  distanceZ += velocityZ * deltaTime;
  
  // Motion detection and reset
  if (accelerationMagnitude < smallAccelThreshold) {
    lastMotionTime = currentTime;
    isMoving = false;
  } else {
    isMoving = true;
  }
  
  // Reset after timeout
  if (currentTime - lastMotionTime > motionDetectionTimeout) {
    velocityX = velocityY = velocityZ = 0;
    distanceX = distanceY = distanceZ = 0;
    Serial.println("Reset due to timeout");
  }
  
  // Zero Velocity Update
  if (accelerationMagnitude < smallAccelThreshold) {
    velocityX = velocityY = velocityZ = 0;
  }
  
  // Determine vibration level
  String vibrationLevel;
  if (accelerationMagnitude > vibrationHighThreshold) {
    vibrationLevel = "Crash";
  } else if (accelerationMagnitude > vibrationLowThreshold) {
    vibrationLevel = "Moderate Impact";
  } else {
    vibrationLevel = "Low (Turbulence)";
  }
  
  // Calculate tilt angles
  float pitch = atan2(ayFiltered, azFiltered) * 180.0 / PI;
  float roll = atan2(axFiltered, azFiltered) * 180.0 / PI;
  
  // Print results
  Serial.println("\n--- IMU Readings ---");
  Serial.print("Acceleration Magnitude: ");
  Serial.println(accelerationMagnitude);
  Serial.print("Vibration Level: ");
  Serial.println(vibrationLevel);
  Serial.print("Pitch: ");
  Serial.println(pitch);
  Serial.print("Roll: ");
  Serial.println(roll);
}