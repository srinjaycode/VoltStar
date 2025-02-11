#include <OneWire.h>
#include <DallasTemperature.h>
#include <SPI.h>            
#include <SD.h>  
#include <Wire.h>     

// Data wire is connected to Arduino Nano pins
#define ONE_WIRE_BUS_CONTROLLER    6
#define ONE_WIRE_BUS_BATTERY       3
#define CHIP_SELECT               10     // Use pin 10 for SD card Chip Select

// Setup a oneWire instance for each bus
OneWire oneWireController(ONE_WIRE_BUS_CONTROLLER);
OneWire oneWireBattery(ONE_WIRE_BUS_BATTERY);

// Pass our oneWire reference to Dallas Temperature sensor objects
DallasTemperature controllerSensor(&oneWireController);
DallasTemperature batterySensor(&oneWireBattery);

// Arrays to hold device addresses
DeviceAddress controllerThermometer, batteryThermometer;

void setup(void)
{
  // Start serial port
  Serial.begin(115200);
  Serial.println("Controller and Battery Temperature Sensors");
  SPI.begin();  

  Serial.println("SPI initialized");

  Serial.println("Initializing SD card...");
  if (!SD.begin(CHIP_SELECT)) {
    Serial.println("SD card initialization failed!");
    
    
     
  }

  // Start up the library on both buses
  controllerSensor.begin();
  batterySensor.begin();
  
  // Locate devices on the bus
  Serial.println("Locating devices...");
  Serial.print("Found ");
  Serial.print(controllerSensor.getDeviceCount(), DEC);
  Serial.println(" devices on controller bus.");
  Serial.print("Found ");
  Serial.print(batterySensor.getDeviceCount(), DEC);
  Serial.println(" devices on battery bus.");

  // Search for devices on the bus and assign addresses
  if (!controllerSensor.getAddress(controllerThermometer, 0)) {
    Serial.println("Unable to find address for controller sensor");
  }
  if (!batterySensor.getAddress(batteryThermometer, 0)) {
    Serial.println("Unable to find address for battery sensor");
  }

  // Set the resolution to 12 bit (good enough for most applications)
  controllerSensor.setResolution(controllerThermometer, 12);
  batterySensor.setResolution(batteryThermometer, 12);
}

void loop(void){ 
  // Request temperatures from both sensors
  Serial.println("Requesting temperatures...");
  controllerSensor.requestTemperatures();
  batterySensor.requestTemperatures();
  
  // Get and print temperatures
  float tempC_controller = controllerSensor.getTempC(controllerThermometer);
  float tempC_battery = batterySensor.getTempC(batteryThermometer);
  

    Serial.print("Controller Temperature: ");
    Serial.print(tempC_controller);
    Serial.println("C");

  
 
    Serial.print("Battery Temperature: ");
    Serial.print(tempC_battery);
    Serial.println("C");

  
  // Wait a bit between readings
  // Get timestamp
  String timestamp = getTimestamp();

  // Prepare data string
  String dataString = timestamp + ",";

  // Add controller temperature
  if(tempC_controller != DEVICE_DISCONNECTED_C) {
    dataString += String(tempC_controller, 2);
  } else {
    dataString += "ERROR";
  }
  dataString += ",";

  // Add battery temperature
  if(tempC_battery != DEVICE_DISCONNECTED_C) {
    dataString += String(tempC_battery, 2);
  } else {
    dataString += "ERROR";
  }

  // Open file and write data
  File dataFile = SD.open("templog.csv", FILE_WRITE);
  if (dataFile) {
    dataFile.println(dataString);
    dataFile.close();
    Serial.println("Data written to SD card");
  } else {
    Serial.println("Error opening templog.csv");
  }

  delay(2000); // This line should be inside the loop()
}

String getTimestamp() {
  // Get current timestamp
  unsigned long currentTime = millis() / 1000;  // Convert to seconds
  int hours = (currentTime / 3600) % 24;
  int minutes = (currentTime / 60) % 60;
  int seconds = currentTime % 60;

  // Format timestamp as HH:MM:SS
  String timestamp = String(hours) + ":" +
                     (minutes < 10 ? "0" : "") + String(minutes) + ":" +
                     (seconds < 10 ? "0" : "") + String(seconds);
  return timestamp;
}
