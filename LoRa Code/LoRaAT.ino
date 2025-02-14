#include <VoltLora.h>

VoltLora LoRa(2, 3);  // RX, TX

void setup() {
    Serial.begin(115200);   // Serial Monitor
    LoRa.begin(115200);     // Initialize LoRa module
    delay(5000);            // Allow module to stabilize

    Serial.println("Testing RYLR998...");

    LoRa.sendCommand("AT"); // Send AT command
}

void loop() {
    if (LoRa.available()) {
        Serial.write(LoRa.read());  // Print LoRa response
    }

    if (Serial.available()) {
        LoRa.write(Serial.read());  // Send Serial Monitor input to LoRa
    }
}
