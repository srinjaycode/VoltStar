#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

float controllerTemp = 0.0, batteryTemp = 0.0;  // Variables to hold the temperature values

void setup() {
    Serial.begin(115200);       // Initialize Serial monitor for debugging
    uint16_t ID = tft.readID();
    tft.begin(ID);              // Initialize TFT display
    tft.setRotation(3);         // Set rotation of TFT screen
    tft.fillScreen(0x0000);     // Clear the screen
}

void loop() {
    if (Serial.available() > 0) {  // Check if data is available from Mega
        String data = Serial.readStringUntil('\n');   // Read data until newline
        Serial.println("Received: " + data);          // Debugging print
        
        parseData(data);  // Parse the data for temperature values
        updateDisplay();   // Update the display with the new values
    }
}

void parseData(String data) {
    // Format expected: "TYPE:VALUE" (e.g., "CT:24.63" or "BT:22.10")
    int colonPos = data.indexOf(':');  // Find the position of the colon
    if (colonPos != -1) {  // If a colon exists, parse the data
        String type = data.substring(0, colonPos);  // Extract type (e.g., "CT" or "BT")
        String value = data.substring(colonPos + 1); // Extract value (e.g., "24.63")
        float floatValue = value.toFloat();           // Convert to float

        if (type == "CT") {
            controllerTemp = floatValue;  // Store the controller temperature
        } else if (type == "BT") {
            batteryTemp = floatValue;    // Store the battery temperature
        }
    }
}

void updateDisplay() {
    tft.fillScreen(0x0000);  // Clear screen
    
    // Display controller temperature (with 1 decimal place)
    tft.setTextSize(7);
    tft.setTextColor(0xFFDF00);
    tft.setCursor(120, 100);
    tft.print("CT: " + String(controllerTemp, 1) + "C");

    // Display battery temperature (with 1 decimal place)
    tft.setTextSize(5);
    tft.setTextColor(0xFFFF);
    tft.setCursor(120, 220);
    tft.print("BT: " + String(batteryTemp, 1) + "C");
}
