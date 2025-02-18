#include "IMU.h"
#include "Temperature.h"
#include "RTC_Module.h"
#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3);  // RX, TX for LoRa

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

    // Set up LoRa Module before sending data
    LoRa.begin(115200);       // LoRa Module at 115200 baud
    delay(5000);              // Allow module to stabilize
    Serial.println("LoRa Transmitter Initialized");

    // Set up LoRa Module commands
    LoRa.println("AT+ADDRESS=1");
    LoRa.println("AT+PARAMETER=8,7,1,12");
    LoRa.println("AT+BAND=868500000");  // Set frequency to 433 MHz
    LoRa.println("AT+MODE=0");          // Set LoRa module to "send" mode
    delay(5000);  // Allow some time for commands to take effect

    Serial.println("========== Setup Complete ==========\n");
}

void loop() {
    // Get timestamp
    String timestamp = getTimeStamp();

    // Get sensor data
    float controllerTemp = getControllerTemperature();
    float batteryTemp = getBatteryTemperature();
    float speed = getIMU();  

    // Create packet headers and send data via LoRa
    sendLoRaData("CT", controllerTemp, timestamp);
    sendLoRaData("BT", batteryTemp, timestamp);
    sendLoRaData("TS", timestamp, "");
    sendLoRaData("V", speed, timestamp);

    delay(3000);  
}

void sendLoRaData(String header, float data, String timestamp) {
    String packet = header + ":" + String(data) + "," + "TS:" + timestamp;
    LoRa.println("AT+SEND=2,15," + packet);  
    Serial.println("Sent: " + packet);
}

void sendLoRaData(String header, String data, String timestamp) {
    String packet = header + ":" + data + "," + "TS:" + timestamp;
    LoRa.println("AT+SEND=2,15," + packet);  
    Serial.println("Sent: " + packet);
}

