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

String getTimeStamp() {
    RtcDateTime now = Rtc.GetDateTime();
    char timeString[9];  // "HH:MM:SS" is 8 characters + null terminator
    snprintf_P(timeString, 9, PSTR("%02u:%02u:%02u"),
               now.Hour(), now.Minute(), now.Second());
    return String(timeString);
}
