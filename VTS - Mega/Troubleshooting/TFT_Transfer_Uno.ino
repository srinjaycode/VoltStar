/////// UNO CODE (Receiver) ///////
#include <SoftwareSerial.h>
SoftwareSerial MegaSerial(10, 11);  // RX, TX

void setup() {
    Serial.begin(115200);   // USB Debugging
    MegaSerial.begin(115200);  // Communication with Mega
    
    Serial.println("Uno: Initialized");
}

void loop() {
    if (MegaSerial.available()) {
        Serial.println("Uno: Data available on UART");
        String data = MegaSerial.readStringUntil('\n');
        Serial.println("Uno: Received -> " + data);
        
        if (data.length() > 0) {
            Serial.println("Uno: Parsing received data...");
            parseData(data);
            updateDisplay();
        } else {
            Serial.println("Uno: Received empty data, possible communication issue!");
        }
    } else {
        Serial.println("Uno: No data available yet");
    }
    delay(500);
}
