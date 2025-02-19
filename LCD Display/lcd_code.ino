#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

float controllerTemp = 0.0, batteryTemp = 0.0;  // Variables to hold temperature values

void setup() {
    Serial.begin(115200);  // Serial Monitor Debugging
    uint16_t ID = tft.readID();
    tft.begin(ID);
    tft.setRotation(3);
    tft.fillScreen(0x0000);

    Serial.println("\n========== UNO SYSTEM READY ==========");
    Serial.println("[INFO] Waiting for UART data from Mega...");
}

void loop() {
    if (Serial.available() > 0) {  
        String data = Serial.readStringUntil('\n');  
        Serial.print("[DEBUG] Received Data: ");
        Serial.println(data);

        if (data.length() > 0) {
            parseData(data);  // Parse the received data
        } else {
            Serial.println("[ERROR] Empty data received!");
        }
    }
}

void parseData(String data) {
    if (!data.startsWith("CT:") && !data.startsWith("BT:") && !data.startsWith("V:")) {
        Serial.println("[ERROR] Invalid packet format: " + data);
        return;
    }

    int colonPos = data.indexOf(':');  
    int commaPos = data.indexOf(',');  

    if (colonPos == -1 || commaPos == -1) {
        Serial.println("[ERROR] Malformed data packet: " + data);
        return;
    }

    String type = data.substring(0, colonPos);
    String value = data.substring(colonPos + 1, commaPos);
    float floatValue = value.toFloat();

    if (type == "CT") {
        controllerTemp = floatValue;
    } else if (type == "BT") {
        batteryTemp = floatValue;
    } else {
        Serial.println("[ERROR] Unrecognized type: " + type);
        return;
    }

    Serial.print("[INFO] Parsed: ");
    Serial.print(type);
    Serial.print(" = ");
    Serial.println(floatValue, 2);

    updateDisplay();
}

void updateDisplay() {
    tft.fillScreen(0x0000);

    tft.setTextSize(7);
    tft.setTextColor(0xFFDF00);
    tft.setCursor(120, 100);
    tft.print("CT: " + String(controllerTemp, 1) + "C");

    tft.setTextSize(5);
    tft.setTextColor(0xFFFF);
    tft.setCursor(120, 220);
    tft.print("BT: " + String(batteryTemp, 1) + "C");

    Serial.println("[INFO] Display Updated");
}
