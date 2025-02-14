#include <VoltLora.h>

VoltLora LoRa(2, 3); // RX, TX

void setup() {
    Serial.begin(115200);   
    LoRa.begin(115200);     
    delay(5000);            // Delay for stabilization
    Serial.println("Receiver - RYLR998");

    // Configure LoRa settings
    LoRa.setAddress(2); // Address of LoRa
    LoRa.setBand(868500000); // Band - 868.5 MHz
    LoRa.setMode(0); // Mode 0 - Receive/Transmit Mode

    delay(5000);  // Allow time for settings to take effect
}

void loop() {
    if (LoRa.available()) {
        String message = LoRa.receive();
        Serial.print("Received: ");
        Serial.println(message);
    }
}
