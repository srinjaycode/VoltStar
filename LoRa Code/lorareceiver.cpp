#include "LoraReceiver.h"

LoraReceiver::LoraReceiver(int rxPin, int txPin) 
    : loraSerial(rxPin, txPin) {}

void LoraReceiver::begin(long baudRate) {
    loraSerial.begin(baudRate);
    delay(100);  // Small delay to ensure serial is ready
}

bool LoraReceiver::available() {
    return loraSerial.available();
}

String LoraReceiver::receiveData() {
    String receivedMessage = "";
    
    while (loraSerial.available()) {
        char inChar = (char)loraSerial.read();
        receivedMessage += inChar;
        delay(10);  // Small delay to ensure complete message
    }
    
    // Optional: Add debug print
    if (receivedMessage.length() > 0) {
        Serial.print("Received via LoRa: ");
        Serial.println(receivedMessage);
    }
    
    return receivedMessage;
}
