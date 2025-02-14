#include <SoftwareSerial.h>

SoftwareSerial LoRa(2, 3);  // RX, TX

void setup() {
  Serial.begin(115200);  // Serial Monitor
  LoRa.begin(115200);    // LoRa Module
   delay(5000); 
  // Allow module to stabilize

  Serial.println("Testing RYLR998...");

  LoRa.println("AT");
}

void loop() {
  if (LoRa.available()) {
    Serial.write(LoRa.read());  // Print LoRa Response
  }

  if (Serial.available()) {
    LoRa.write(Serial.read());  // Send Serial Monitor Input to LoRa
  }
}
