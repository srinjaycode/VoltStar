#include "LoraSender.h"

LoraSender::LoraSender(int rxPin, int txPin) 
    : loraSerial(rxPin, txPin) {}

void LoraSender::begin(long baudRate) {
    loraSerial.begin(baudRate);
    delay(100);  // Small delay to ensure serial is ready
}

void LoraSender::sendData(const String& message) {
    loraSerial.println(message);
    
    // Optional: Add debug print
    Serial.print("Sending via LoRa: ");
    Serial.println(message);
}
