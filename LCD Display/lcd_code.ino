/* Updated Code with
 refreshing temperature and speed data
  from the nano */
  
#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

bool showMetrics = false;
int velocity = 0, batteryTemp = 0, controllerTemp = 0;

void setup() {
  Serial.begin(9600);
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
    parseData(data);
    updateDisplay();
  }
}

void parseData(String data) {
  if (data.startsWith("S")) {
    velocity = data.substring(1).toInt();
  } else if (data.startsWith("TB")) {
    batteryTemp = data.substring(2).toInt();
  } else if (data.startsWith("TC")) {
    controllerTemp = data.substring(2).toInt();
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
  
  tft.setTextSize(7);
  tft.setTextColor(0xFFDF00);
  drawBoldText(120, 100, String(velocity) + " km/h", 3);

  tft.setTextSize(5);
  tft.setTextColor(0xFFFF);
  drawBoldText(120, 220, "B:" + String(batteryTemp) + "C", 1);
  drawBoldText(120, 270, "C:" + String(controllerTemp) + "C", 1);
}
