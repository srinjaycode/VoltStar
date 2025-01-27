#include <MCUFRIEND_kbv.h>
#include <Adafruit_GFX.h>

// Define your display's pins and initialize the display object
MCUFRIEND_kbv tft; 

void setup() {
  // Start the Serial communication for debugging
  Serial.begin(9600);

  // Initialize the screen
  uint16_t ID = tft.readID();
  tft.begin(ID);
  tft.setRotation(3);  // Rotate the display if needed
  tft.fillScreen(0x0000);  // Fill the screen with black color

  // Set up text properties
  tft.setTextColor(0xFFFF);  // Set text color (white)
  tft.setTextSize(2);        // Set text size
  tft.setCursor(10, 10);     // Set cursor position
  tft.println("Hello, Arduino!");  // Display text
}

void loop() {
  // Add anything else you want to display or update here
}
