/* ------------- VoltStar -------------- */

#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

// Screen dimensions
#define SCREEN_WIDTH 320
#define SCREEN_HEIGHT 480

MCUFRIEND_kbv tft;

bool showMetrics = false; // To toggle between screens

void setup() {
  Serial.begin(9600);  // Start serial communication at 9600 baud
  uint16_t ID = tft.readID();
  tft.begin(ID);
  tft.setRotation(3);
  tft.fillScreen(0x0000);  // Black background
  
  drawHomeScreen(); // Draw the initial screen
  delay(10000);  // Stay on home screen for 10 seconds

  showMetrics = true;
  drawMetricsScreen(); // Transition to the metrics screen without any transition effect
}

void loop() {
  if (Serial.available() > 0) {
    // Read the incoming serial data
    String data = Serial.readStringUntil('\n');
    int velocity, batteryTemp, controllerTemp;

    // Parse the data (assuming it is in the format "velocity,batteryTemp,controllerTemp")
    int comma1 = data.indexOf(',');
    int comma2 = data.indexOf(',', comma1 + 1);

    velocity = data.substring(0, comma1).toInt();
    batteryTemp = data.substring(comma1 + 1, comma2).toInt();
    controllerTemp = data.substring(comma2 + 1).toInt();

    // Update the display with the new data
    updateDisplay(velocity, batteryTemp, controllerTemp);
  }
}

void drawHomeScreen() {
  tft.fillScreen(0x0000);  // Black background
  
  // Text setup for "Volt" and "Star"
  String text1 = "Volt";
  String text2 = "Star";
  int16_t x1, y1, x2, y2;
  uint16_t w1, h1, w2, h2;

  tft.setTextSize(7);
  tft.getTextBounds(text1.c_str(), 0, 0, &x1, &y1, &w1, &h1);
  tft.getTextBounds(text2.c_str(), 0, 0, &x2, &y2, &w2, &h2);

  int totalWidth = w1 + w2 + 10; // Add spacing between "Volt" and "Star"
  int xstart = (tft.width() - totalWidth) / 2;
  int ypos = (tft.height() - h1) / 2;

  // Draw "Volt" in white and bold
  tft.setTextColor(0xFFFF);  // White
  drawBoldText(xstart, ypos, text1, 2);  // More bold by increasing offset

  // Draw "Star" in bright yellow and bold
  tft.setTextColor(0xFFDF00);  // Bright Yellow
  drawBoldText(xstart + w1 + 10, ypos, text2, 2);  // More bold by increasing offset
}

void drawMetricsScreen() {
  tft.fillScreen(0x0000); // Black background

  // Display Velocity (Yellow, Bold)
  tft.setTextSize(7);
  tft.setTextColor(0xFFDF00);  // Yellow color
  String velocity = "30 km/h";
  int16_t vx, vy, vw, vh;
  tft.getTextBounds(velocity.c_str(), 0, 0, &vx, &vy, &vw, &vh);
  int vxStart = (SCREEN_WIDTH - vw) / 2 + 80;  // Increased rightward offset (+80)
  int vyStart = 100; // Move the velocity a bit down
  tft.setCursor(vxStart, vyStart);  // Place velocity text at the adjusted position
  drawBoldText(vxStart, vyStart, velocity, 3);  // More bold by increasing offset

  // Display Battery and Controller Temperatures (Larger, White, Slightly Bold)
  tft.setTextSize(5); // Larger text size for temperature
  tft.setTextColor(0xFFFF);  // White color

  String batteryTemp = "B:20C";
  String controllerTemp = "C:23C";

  int16_t tx, ty, tw, th;
  tft.getTextBounds(batteryTemp.c_str(), 0, 0, &tx, &ty, &tw, &th);
  int txStart = (SCREEN_WIDTH - tw) / 2 + 80;  // Increased rightward offset (+80)
  int tyStart = 220;  // Place temperature a bit down
  tft.setCursor(txStart, tyStart);  // Place battery temp text at the adjusted position
  drawBoldText(txStart, tyStart, batteryTemp, 1);  // Slightly bold and centered temperature

  // Controller temperature
  int controllerStartY = tyStart + th + 10;  // Slightly below the battery temperature
  tft.setCursor(txStart, controllerStartY);  // Place controller temp text at the adjusted position
  drawBoldText(txStart, controllerStartY, controllerTemp, 1);  // Slightly bold and centered temperature
}

// Function to draw bold text by using multiple offsets
void drawBoldText(int x, int y, String text, int offset) {
  // Draw text multiple times with slight offsets for bold effect
  for (int i = -offset; i <= offset; i++) {
    for (int j = -offset; j <= offset; j++) {
      tft.setCursor(x + i, y + j);
      tft.print(text);
    }
  }
}

void updateDisplay(int velocity, int batteryTemp, int controllerTemp) {
  tft.fillScreen(0x0000); // Clear the screen

  // Display Velocity (Yellow, Bold)
  tft.setTextSize(7);
  tft.setTextColor(0xFFDF00);  // Yellow color
  String velocityStr = String(velocity) + " km/h";
  int16_t vx, vy, vw, vh;
  tft.getTextBounds(velocityStr.c_str(), 0, 0, &vx, &vy, &vw, &vh);
  int vxStart = (SCREEN_WIDTH - vw) / 2 + 80;  // Increased rightward offset (+80)
  int vyStart = 100; // Move the velocity a bit down
  tft.setCursor(vxStart, vyStart);  // Place velocity text at the adjusted position
  drawBoldText(vxStart, vyStart, velocityStr, 3);  // More bold by increasing offset

  // Display Battery and Controller Temperatures (Larger, White, Slightly Bold)
  tft.setTextSize(5); // Larger text size for temperature
  tft.setTextColor(0xFFFF);  // White color

  String batteryTempStr = "B:" + String(batteryTemp) + "C";
  String controllerTempStr = "C:" + String(controllerTemp) + "C";

  int16_t tx, ty, tw, th;
  tft.getTextBounds(batteryTempStr.c_str(), 0, 0, &tx, &ty, &tw, &th);
  int txStart = (SCREEN_WIDTH - tw) / 2 + 80;  // Increased rightward offset (+80)
  int tyStart = 220;  // Place temperature a bit down
  tft.setCursor(txStart, tyStart);  // Place battery temp text at the adjusted position
  drawBoldText(txStart, tyStart, batteryTempStr, 1);  // Slightly bold and centered temperature

  // Controller temperature
  int controllerStartY = tyStart + th + 10;  // Slightly below the battery temperature
  tft.setCursor(txStart, controllerStartY);  // Place controller temp text at the adjusted position
  drawBoldText(txStart, controllerStartY, controllerTempStr, 1);  // Slightly bold and centered temperature
}
