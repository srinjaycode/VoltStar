#include "RTC_Module.h"

RTCZero rtc;

void initRTC() {
    Serial.println("Initializing built-in RTC...");

    rtc.begin(); // Start RTC

    // SEt to current time of upload
    rtc.setHours(15);
    rtc.setMinutes(42);
    rtc.setSeconds(0);
    rtc.setDay(18);
    rtc.setMonth(2);
    rtc.setYear(25); 

    Serial.println("RTC initialized successfully.");
}

void getRTC() {
    char datestring[20];
    snprintf(datestring, sizeof(datestring), "%02u/%02u/20%02u %02u:%02u:%02u",
             rtc.getMonth(), rtc.getDay(), rtc.getYear(),
             rtc.getHours(), rtc.getMinutes(), rtc.getSeconds());

    Serial.print("RTC,");
    Serial.println(datestring);
}
