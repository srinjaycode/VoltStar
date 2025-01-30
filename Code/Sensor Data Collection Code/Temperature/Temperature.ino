#include <OneWire.h>
#include <DallasTemperature.h>

// Data wire is connected to Arduino Nano pins
#define ONE_WIRE_BUS_CONTROLLER    6
#define ONE_WIRE_BUS_BATTERY       3

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

void loop(void)
{ 
  // Request temperatures from both sensors
  Serial.println("Requesting temperatures...");
  controllerSensor.requestTemperatures();
  batterySensor.requestTemperatures();
  
  // Get and print temperatures
  float tempC_controller = controllerSensor.getTempC(controllerThermometer);
  float tempC_battery = batterySensor.getTempC(batteryThermometer);
  
  // Check if reading was successful
  if(tempC_controller != DEVICE_DISCONNECTED_C) {
    Serial.print("Controller Temperature: ");
    Serial.print(tempC_controller);
    Serial.println("°C");
  } else {
    Serial.println("Error reading controller temperature");
  }
  
  if(tempC_battery != DEVICE_DISCONNECTED_C) {
    Serial.print("Battery Temperature: ");
    Serial.print(tempC_battery);
    Serial.println("°C");
  } else {
    Serial.println("Error reading battery temperature");
  }
  
  // Wait a bit between readings
  delay(2000);
}
