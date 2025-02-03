#ifndef LORA_RECEIVER_H
#define LORA_RECEIVER_H

#include <SoftwareSerial.h>

class LoraReceiver {
private:
    SoftwareSerial loraSerial;

public:
    LoraReceiver(int rxPin, int txPin);
    
    void begin(long baudRate = 9600);
    bool available();
    String receiveData();
};

#endif // LORA_RECEIVER_H
