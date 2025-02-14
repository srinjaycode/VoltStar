#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3); // RX, TX

void setup() {
    Serial.begin(115200);     // Serial Monitor
    LoRa.begin(115200);       // LoRa Module at 115200 baud
    delay(5000);              // Allow module to stabilize
    Serial.println("Transmitter - RYLR998");

    // Set up LoRa Module before sending data
    LoRa.println("AT+ADDRESS=1");
    LoRa.println("AT+PARAMETER=8,7,1,12");
    LoRa.println("AT+BAND=868500000");  // Set frequency to 433 MHz
    LoRa.println("AT+MODE=0");          // Set LoRa module to "send" mode
    delay(5000);  // Allow some time for commands to take effect
}

void loop() {
    LoRa.println("AT+SEND=2,15,Hello from LoRa");  // Send data to address 2
    Serial.println("Sent: Hello from LoRa");
    
    delay(1000);  // Wait briefly for response
    
    // Check if there's any response from the LoRa module
    while (LoRa.available()) {
        char c = LoRa.read();
        Serial.print(c);  // Print response from the module to Serial Monitor
    }

    delay(3000);  // Send every 3 seconds
}
