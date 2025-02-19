/////// MEGA CODE (Sender) ///////
void setup() {
    Serial.begin(115200);   // USB Debugging
    Serial1.begin(115200);  // UART to Uno
    
    Serial.println("Mega: Initialized");
}

void loop() {
    String data = "CT:25.3\nBT:30.1";
    Serial.println("Mega: Sending -> " + data);
    Serial1.println(data);  // Send to Uno
    
    delay(3000);  // Wait before sending again
}
