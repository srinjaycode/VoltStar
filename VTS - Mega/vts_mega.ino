#include "IMU.h"
#include "Temperature.h"
#include "RTC_Module.h"
#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3);

void setup() {
    Serial.begin(115200);
    Wire.begin();

    Serial.println("\n========== System Initialization ==========");

    initRTC();

    if (!mpu.begin()) {
        Serial.println("ERROR: MPU6050 not found!");
        mpuConnected = false;
    } else {
        mpuConnected = true;
        mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
        mpu.setGyroRange(MPU6050_RANGE_250_DEG);
        Serial.println("MPU6050 initialized successfully");
        calibrateSensor();
    }

    initTemperatureSensors();

    LoRa.begin(115200);
    delay(5000);
    Serial.println("LoRa Transmitter Initialized");

    LoRa.println("AT+ADDRESS=1");
    LoRa.println("AT+PARAMETER=8,7,1,12");
    LoRa.println("AT+BAND=868500000");
    LoRa.println("AT+MODE=0");
    delay(5000);

    Serial1.begin(115200);
    delay(5000);
    Serial.println("UART1 Initialized");

    Serial.println("========== Setup Complete ==========\n");
}

void loop() {
    String timestamp = getTimeStamp();

    float controllerTemp = getControllerTemperature();
    float batteryTemp = getBatteryTemperature();
    float speed = getSpeed();

    sendUARTData("CT", controllerTemp, timestamp);
    sendUARTData("BT", batteryTemp, timestamp);
    sendUARTData("V", speed, timestamp);

    sendLoRaData("CT", controllerTemp, timestamp);
    sendLoRaData("BT", batteryTemp, timestamp);
    sendLoRaData("V", speed, timestamp);

    delay(3000);
}

void sendUARTData(String header, float data, String timestamp) {
    String packet = header + ":" + String(data) + "," + "TS:" + timestamp;
    Serial1.println(packet);
    Serial.print("Sent via UART1: ");
    Serial.println(packet);
}

void sendUARTData(String header, String data, String timestamp) {
    String packet = header + ":" + data + "," + "TS:" + timestamp;
    Serial1.println(packet);
    Serial.print("Sent via UART1: ");
    Serial.println(packet);
}

void sendLoRaData(String header, float data, String timestamp) {
    String packet = header + ":" + String(data) + "," + "TS:" + timestamp;
    int length = packet.length();
    LoRa.print("AT+SEND=2," + String(length) + "," + packet);
    Serial.print("Sent via LoRa: ");
    Serial.println(packet);

    delay(1000);

    while (LoRa.available()) {
        String response = LoRa.readStringUntil('\n');
        if (response.indexOf("+OK") != -1) {
            Serial.println("LoRa: Message sent successfully.");
        } else {
            Serial.println("LoRa: Failed to send message.");
        }
    }
}

void sendLoRaData(String header, String data, String timestamp) {
    String packet = header + ":" + data + "," + "TS:" + timestamp;
    int length = packet.length();
    LoRa.print("AT+SEND=2," + String(length) + "," + packet);
    Serial.print("Sent via LoRa: ");
    Serial.println(packet);

    delay(1000);

    while (LoRa.available()) {
        String response = LoRa.readStringUntil('\n');
        if (response.indexOf("+OK") != -1) {
            Serial.println("LoRa: Message sent successfully.");
        } else {
            Serial.println("LoRa: Failed to send message.");
        }
    }
}
