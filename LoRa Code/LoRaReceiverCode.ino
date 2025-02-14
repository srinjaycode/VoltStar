#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3); // RX, TX

void setup() {
    Serial.begin(115200);     // Serial Monitor
    LoRa.begin(115200);       // LoRa Module at 115200 baud
    delay(5000);              // Allow module to stabilize
    Serial.println("Receiver - RYLR998");

    // Set up LoRa Module to receive mode
    LoRa.println("AT+ADDRESS=2");
    LoRa.println("AT+BAND=868500000");  // Set frequency to 433 MHz
    LoRa.println("AT+MODE=0");          // Set LoRa module to "receive" mode
    delay(5000);  // Allow some time for commands to take effect
}

void loop() {
    if (LoRa.available()) {
        // Read received data from LoRa and send it to the Serial Monitor
        String message = "";
        while (LoRa.available()) {
            message += (char)LoRa.read();
        }
        Serial.print("Received: ");
        Serial.println(message);  // Print received message
    }
}
