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
    int velocity;

    // Parse the data (assuming it is in the format "velocity")
    velocity = data.toInt();

    // Update the display with the new data
    updateDisplay(velocity);
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
  String velocity = "0 km/h";
  int16_t vx, vy, vw, vh;
  tft.getTextBounds(velocity.c_str(), 0, 0, &vx, &vy, &vw, &vh);
  int vxStart = (SCREEN_WIDTH - vw) / 2 + 80;  // Increased rightward offset (+80)
  int vyStart = 100; // Move the velocity a bit down
  tft.setCursor(vxStart, vyStart);  // Place velocity text at the adjusted position
  drawBoldText(vxStart, vyStart, velocity, 3);  // More bold by increasing offset

  // Display Battery Level (Smaller, White, Slightly Bold, Shifted Right)
  tft.setTextSize(4); // Smaller text size
  tft.setTextColor(0xFFFF);  // White color
  String batteryLevel = "B. Level: 100%";
  int16_t tx, ty, tw, th;
  tft.getTextBounds(batteryLevel.c_str(), 0, 0, &tx, &ty, &tw, &th);
  int txStart = (SCREEN_WIDTH - tw) / 2 + 100;  // Shifted more to the right (+100)
  int tyStart = 220;  // Place text lower
  tft.setCursor(txStart, tyStart);  // Adjusted cursor position
  drawBoldText(txStart, tyStart, batteryLevel, 1);  // Slightly bold and centered
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

void updateDisplay(int velocity) {
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

  // Display Battery Level (Smaller, White, Slightly Bold, Shifted Right)
  tft.setTextSize(4); // Smaller text size
  tft.setTextColor(0xFFFF);  // White color
  String batteryLevel = "B. Level: 100%";
  int16_t tx, ty, tw, th;
  tft.getTextBounds(batteryLevel.c_str(), 0, 0, &tx, &ty, &tw, &th);
  int txStart = (SCREEN_WIDTH - tw) / 2 + 100;  // Shifted more to the right (+100)
  int tyStart = 220;  // Place text lower
  tft.setCursor(txStart, tyStart);  // Adjusted cursor position
  drawBoldText(txStart, tyStart, batteryLevel, 1);  // Slightly bold and centered
}
