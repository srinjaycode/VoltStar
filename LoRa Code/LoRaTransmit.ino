#include <VoltLora.h>

VoltLora LoRa(2, 3); // RX, TX

void setup() {
    Serial.begin(115200);   
    delay(5000);            // Delay for stabilization
    Serial.println("Transmitter - RYLR998");

    // Configure LoRa settings
    LoRa.setAddress(1); // LoRa Address
    LoRa.setParameter(8, 7, 1, 12); // AT Parameter 
    LoRa.setBand(868500000); // Frequency Band - 868.5 MHz
    LoRa.setMode(0); // Mode 0 - Receive/Transmit Mode

    delay(5000);  // Allow time for settings to take effect
}

void loop() {
    LoRa.send(2, "Hello");  
    Serial.println("Sent: Hello");

    delay(1000);  

    if (LoRa.available()) {
        String response = LoRa.receive();
        Serial.print("LoRa Response: ");
        Serial.println(response);
    }

    delay(3000);  // Send every 3 seconds
}
