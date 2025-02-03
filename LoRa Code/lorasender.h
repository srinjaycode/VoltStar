#ifndef LORA_SENDER_H
#define LORA_SENDER_H

#include <SoftwareSerial.h>

class LoraSender {
private:
    SoftwareSerial loraSerial;

public:
    LoraSender(int rxPin, int txPin);
    
    void begin(long baudRate = 9600);
    void sendData(const String& message);
};

#endif // LORA_SENDER_H
