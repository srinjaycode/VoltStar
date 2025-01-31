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
