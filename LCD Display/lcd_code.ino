// new
#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

// Global variables for display values
bool showMetrics = false;
int velocity = 0;
int batteryTemp = 0;
int controllerTemp = 0;

void setup() {
    // Initialize serial communication with Mega
    Serial.begin(9600);
    
    // Initialize display
    uint16_t ID = tft.readID();
    tft.begin(ID);
    tft.setRotation(3);
    tft.fillScreen(0x0000);  // Black background
    
    // Show startup screen
    drawHomeScreen();
    delay(3000);
    
    // Switch to metrics display
    showMetrics = true;
    drawMetricsScreen();
}

void loop() {
    // Check for incoming data from Mega
    if (Serial.available() > 0) {
        String data = Serial.readStringUntil('\n');
        parseData(data);
        updateDisplay();
    }
}

void parseData(String data) {
    // Find the position of the colon separator
    int colonIndex = data.indexOf(':');
    
    if (colonIndex != -1) {
        // Split the data into header and value
        String header = data.substring(0, colonIndex);
        String value = data.substring(colonIndex + 1);
        
        // Update the appropriate variable
        if (header == "V") {
            velocity = value.toInt();
        } else if (header == "BT") {
            batteryTemp = value.toInt();
        } else if (header == "CT") {
            controllerTemp = value.toInt();
        }
        
        // Debug output
        Serial.println("Received: " + data);
    }
}

void drawHomeScreen() {
    tft.fillScreen(0x0000);  // Black background
    
    // Draw VoltStar logo
    String text1 = "Volt";
    String text2 = "Star";
    
    tft.setTextSize(7);
    
    // Draw "Volt" in white
    tft.setTextColor(0xFFFF);
    drawBoldText(60, 120, text1, 2);
    
    // Draw "Star" in yellow
    tft.setTextColor(0xFFDF00);
    drawBoldText(160, 120, text2, 2);
}

void drawMetricsScreen() {
    tft.fillScreen(0x0000);
    updateDisplay();
}

void drawBoldText(int x, int y, String text, int offset) {
    // Draw text multiple times with slight offsets for bold effect
    for (int i = -offset; i <= offset; i++) {
        for (int j = -offset; j <= offset; j++) {
            tft.setCursor(x + i, y + j);
            tft.print(text);
        }
    }
}

void updateDisplay() {
    tft.fillScreen(0x0000);  // Clear screen
    
    // Draw speed in large yellow text
    tft.setTextSize(7);
    tft.setTextColor(0xFFDF00);
    drawBoldText(120, 100, String(velocity) + " km/h", 3);
    
    // Draw temperatures in white text
    tft.setTextSize(5);
    tft.setTextColor(0xFFFF);
    drawBoldText(120, 220, "B:" + String(batteryTemp) + "C", 1);
    drawBoldText(120, 270, "C:" + String(controllerTemp) + "C", 1);
}
