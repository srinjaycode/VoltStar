#include <SPI.h>  // Include SPI for TFT display
#include <Adafruit_GFX.h>  // Include graphics library for TFT display
#include <Adafruit_ILI9341.h>  // Include ILI9341 TFT library

// Pins for TFT (adjust for your setup)
#define TFT_CS     10
#define TFT_RST    9
#define TFT_DC     8

Adafruit_ILI9341 TFTscreen = Adafruit_ILI9341(TFT_CS, TFT_DC, TFT_RST);

void setup() {
  Serial.begin(9600);  // Start serial communication with Mega
  TFTscreen.begin();  // Initialize the TFT display
  TFTscreen.setRotation(3);  // Adjust orientation (you may change this)
  TFTscreen.fillScreen(ILI9341_BLACK);  // Clear the screen

  // Set up text properties for display
  TFTscreen.setTextColor(ILI9341_WHITE);
  TFTscreen.setTextSize(2);
  TFTscreen.setCursor(30, 30);
  TFTscreen.print("Temperature 1: ");
  TFTscreen.setCursor(30, 60);
  TFTscreen.print("Temperature 2: ");
}

void loop() {
  if (Serial.available()) {
    // Read the incoming temperature data from the Mega
    String received = Serial.readStringUntil('\n'); // Read data until new line

    // Split the received string (e.g., "Temp1: 25.3\nTemp2: 27.1")
    int separatorIndex = received.indexOf(":");
    String sensor1TempStr = received.substring(separatorIndex + 1, received.indexOf("\n", separatorIndex));
    
    // Get temperature from the first sensor
    float temp1 = sensor1TempStr.toFloat();

    // Display the temperature from sensor 1 on the TFT screen
    TFTscreen.setCursor(30, 30);
    TFTscreen.fillRect(30, 30, 200, 30, ILI9341_BLACK);  // Clear old value
    TFTscreen.print("Temp1: ");
    TFTscreen.print(temp1);

    // Check for second temperature
    received = Serial.readStringUntil('\n'); // Read the second line
    separatorIndex = received.indexOf(":");
    String sensor2TempStr = received.substring(separatorIndex + 1);

    // Get temperature from the second sensor
    float temp2 = sensor2TempStr.toFloat();

    // Display the temperature from sensor 2 on the TFT screen
    TFTscreen.setCursor(30, 60);
    TFTscreen.fillRect(30, 60, 200, 30, ILI9341_BLACK);  // Clear old value
    TFTscreen.print("Temp2: ");
    TFTscreen.print(temp2);
  }
}
