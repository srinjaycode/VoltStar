#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

bool showMetrics = false;
float velocity = 0, batteryTemp = 0, controllerTemp = 0;  // Changed to float for decimal precision

void setup() {
    Serial.begin(115200);
    uint16_t ID = tft.readID();
    tft.begin(ID);
    tft.setRotation(3);
    tft.fillScreen(0x0000);
    
    drawHomeScreen();
    delay(3000);
    showMetrics = true;
    drawMetricsScreen();
}

void loop() {
    if (Serial.available() > 0) {
        String data = Serial.readStringUntil('\n');
        // Debug print received data
        Serial.println("Received: " + data);
        parseData(data);
        updateDisplay();
    }
}

void parseData(String data) {
    // Format expected: "TYPE:VALUE" (e.g., "CT:24.63")
    int colonPos = data.indexOf(':');
    if (colonPos != -1) {
        String type = data.substring(0, colonPos);
        String value = data.substring(colonPos + 1);
        float floatValue = value.toFloat();

        // Debug print parsed values
        Serial.println("Type: " + type + " Value: " + String(floatValue));

        if (type == "V") {
            velocity = floatValue;
        } else if (type == "BT") {
            batteryTemp = floatValue;
        } else if (type == "CT") {
            controllerTemp = floatValue;
        }
    }
}

void drawHomeScreen() {
    tft.fillScreen(0x0000);
    String text1 = "Volt", text2 = "Star";
    tft.setTextSize(7);
    tft.setTextColor(0xFFFF);
    drawBoldText(60, 120, text1, 2);
    tft.setTextColor(0xFFDF00);
    drawBoldText(160, 120, text2, 2);
}

void drawMetricsScreen() {
    tft.fillScreen(0x0000);
    updateDisplay();
}

void drawBoldText(int x, int y, String text, int offset) {
    for (int i = -offset; i <= offset; i++) {
        for (int j = -offset; j <= offset; j++) {
            tft.setCursor(x + i, y + j);
            tft.print(text);
        }
    }
}

void updateDisplay() {
    tft.fillScreen(0x0000);
    
    // Display speed with 1 decimal place
    tft.setTextSize(7);
    tft.setTextColor(0xFFDF00);
    drawBoldText(120, 100, String(velocity, 1) + " km/h", 3);

    // Display temperatures with 1 decimal place
    tft.setTextSize(5);
    tft.setTextColor(0xFFFF);
    drawBoldText(120, 220, "B:" + String(batteryTemp, 1) + "C", 1);
    drawBoldText(120, 270, "C:" + String(controllerTemp, 1) + "C", 1);
}
