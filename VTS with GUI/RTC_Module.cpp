#include "RTC_Module.h"

ThreeWire myWire(RTC_DAT, RTC_CLK, RTC_RST);
RtcDS1302<ThreeWire> Rtc(myWire);

void initRTC() {
    Rtc.Begin();
    if (!Rtc.IsDateTimeValid()) {
        Serial.println("ERROR: RTC not configured!");
        Rtc.SetDateTime(RtcDateTime(__DATE__, __TIME__));
    } else {
        Serial.println("RTC initialized successfully");
    }
}

void getRTC() {
    RtcDateTime now = Rtc.GetDateTime();
    char datestring[20];
    snprintf_P(datestring, 20, PSTR("%02u/%02u/%04u %02u:%02u:%02u"),
               now.Month(), now.Day(), now.Year(),
               now.Hour(), now.Minute(), now.Second());
    Serial.print("RTC,");
    Serial.println(datestring);
}
