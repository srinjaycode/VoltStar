#define FAN_PWM 3

// Temperature thresholds in Celsius
#define TEMP_HIGH 30.0
#define TEMP_LOW 25.0

void setup() {
    Serial.begin(9600);
    pinMode(FAN_PWM, OUTPUT);
    analogWrite(FAN_PWM, 0);  // Start with fan off
    
    initTemperatureSensors();  // Initialize the temperature sensors
    Serial.println("Temperature Controlled Fan Ready!");
}

void loop() {
    // Read controller temperature
    float controllerTemp = getControllerTemperature();
    
    // Check if temperature reading is valid
    if (controllerTemp == -1000.0) {
        Serial.println("Failed to read controller temperature!");
        return;
    }

    // Print current temperature
    Serial.print("Controller Temperature: ");
    Serial.print(controllerTemp);
    Serial.println("°C");

    // Automatic temperature control
    if (controllerTemp > TEMP_HIGH) {
        // Temperature too high, run fan at full speed
        analogWrite(FAN_PWM, 255);
        Serial.println("Temperature above threshold - Fan ON (100%)");
    } 
    else if (controllerTemp < TEMP_LOW) {
        // Temperature below threshold, turn off fan
        analogWrite(FAN_PWM, 0);
        Serial.println("Temperature normal - Fan OFF");
    }
    else {
        // Temperature in optimal range (25-30°C)
        // Calculate proportional fan speed
        float range = TEMP_HIGH - TEMP_LOW;
        float excess = controllerTemp - TEMP_LOW;
        int fanSpeed = map(excess * 100 / range, 0, 100, 0, 255);
        analogWrite(FAN_PWM, fanSpeed);
        Serial.print("Temperature in range - Fan at ");
        Serial.print(map(fanSpeed, 0, 255, 0, 100));
        Serial.println("%");
    }

    // Manual control through serial commands
    if (Serial.available()) {
        String command = Serial.readStringUntil('\n');
        command.trim();
        
        if (command == "ON") {
            analogWrite(FAN_PWM, 255);
            Serial.println("Manual Override - Fan ON (100%)");
        } 
        else if (command == "OFF") {
            analogWrite(FAN_PWM, 0);
            Serial.println("Manual Override - Fan OFF");
        } 
        else if (command.endsWith("%")) {
            int pwmValue = command.substring(0, command.length() - 1).toInt();
            if (pwmValue >= 0 && pwmValue <= 100) {
                int dutyCycle = map(pwmValue, 0, 100, 0, 255);
                analogWrite(FAN_PWM, dutyCycle);
                Serial.print("Manual Override - Fan Speed Set to ");
                Serial.print(pwmValue);
                Serial.println("%");
            } else {
                Serial.println("Invalid percentage!");
            }
        } 
        else {
            int pwmValue = command.toInt();
            if (pwmValue >= 0 && pwmValue <= 255) {
                analogWrite(FAN_PWM, pwmValue);
                Serial.print("Manual Override - Fan PWM Set to ");
                Serial.println(pwmValue);
            } else {
                Serial.println("Invalid PWM Value!");
            }
        }
    }

    delay(1000);  // Check temperature every second
}