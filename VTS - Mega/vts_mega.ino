#include "IMU.h"
#include "Temperature.h"
#include "RTC_Module.h"
#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3);  // LoRa communication on pins 2 (RX) and 3 (TX)

void setup() {
    Serial.begin(115200);   // USB Serial (Monitor)
    Serial1.begin(115200);  // UART1 for communication with Uno
    Wire.begin();

    Serial.println("\n========== SYSTEM INITIALIZATION ==========");

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

    Serial.println("UART1 Initialized for communication with Uno");
    Serial.println("========== SETUP COMPLETE ==========\n");
}

void loop() {
    String timestamp = getTimeStamp();

    float controllerTemp = getControllerTemperature();
    float batteryTemp = getBatteryTemperature();
    float speed = getSpeed();

    // Send UART Data to Uno
    sendUARTData("CT", controllerTemp, timestamp);
    sendUARTData("BT", batteryTemp, timestamp);
    sendUARTData("V", speed, timestamp);

    delay(3000);
}

void sendUARTData(String header, float data, String timestamp) {
    String packet = header + ":" + String(data) + "," + "TS:" + timestamp;
    Serial1.println(packet);  // Send via UART1
    Serial.print("[DEBUG] Sent via UART1: ");
    Serial.println(packet);
}

void sendUARTData(String header, String data, String timestamp) {
    String packet = header + ":" + data + "," + "TS:" + timestamp;
    Serial1.println(packet);
    Serial.print("[DEBUG] Sent via UART1: ");
    Serial.println(packet);
}
