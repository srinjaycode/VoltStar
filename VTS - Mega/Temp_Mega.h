#ifndef TEMPERATURE_H
#define TEMPERATURE_H

#include <OneWire.h>
#include <DallasTemperature.h>

// Temperature Sensor Pins
#define ONE_WIRE_BUS_CONTROLLER 6
#define ONE_WIRE_BUS_BATTERY 3

// Global Objects
extern OneWire oneWireController;
extern OneWire oneWireBattery;
extern DallasTemperature controllerSensor;
extern DallasTemperature batterySensor;
extern DeviceAddress controllerThermometer, batteryThermometer;

// Sensor Connection Flags
extern bool controllerTempConnected;
extern bool batteryTempConnected;

void initTemperatureSensors();
void getTemperature();

#endif
