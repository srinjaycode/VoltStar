#define FAN_PWM 3  

void setup() {
    Serial.begin(9600);
    pinMode(FAN_PWM, OUTPUT);

    analogWrite(FAN_PWM, 0);  // Default to 50% speed
    Serial.println("Fan Controller Ready!");
}

void loop() {
    if (Serial.available()) {
        String command = Serial.readStringUntil('\n');
        command.trim();  

        if (command == "ON") {
            analogWrite(FAN_PWM, 255);
            Serial.println("Fan ON (100%)");
        } 
        else if (command == "OFF") {
            analogWrite(FAN_PWM, 0);
            Serial.println("Fan OFF");
        } 
        else if (command.endsWith("%")) {
            int pwmValue = command.substring(0, command.length() - 1).toInt();
            if (pwmValue >= 0 && pwmValue <= 100) {
                int dutyCycle = map(pwmValue, 0, 100, 0, 255);
                analogWrite(FAN_PWM, dutyCycle);
                Serial.print("Fan Speed Set to ");
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
                Serial.print("Fan PWM Set to ");
                Serial.println(pwmValue);
            } else {
                Serial.println("Invalid PWM Value!");
            }
        }
    }

    delay(1000);  
}
