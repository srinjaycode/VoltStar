#include "Temperature.h"

OneWire oneWireController(ONE_WIRE_BUS_CONTROLLER);
OneWire oneWireBattery(ONE_WIRE_BUS_BATTERY);
DallasTemperature controllerSensor(&oneWireController);
DallasTemperature batterySensor(&oneWireBattery);
DeviceAddress controllerThermometer, batteryThermometer;
bool controllerTempConnected = false;
bool batteryTempConnected = false;

void initTemperatureSensors() {
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
}

float getControllerTemperature() {
    if (!controllerTempConnected) {
        return -1000.0;  // Return a clearly invalid temperature
    }
    controllerSensor.requestTemperatures();
    return controllerSensor.getTempC(controllerThermometer);
}

float getBatteryTemperature() {
    if (!batteryTempConnected) {
        return -1000.0;  // Return a clearly invalid temperature
    }
    batterySensor.requestTemperatures();
    return batterySensor.getTempC(batteryThermometer);
}
