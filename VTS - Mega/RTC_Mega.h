#ifndef RTC_MODULE_H
#define RTC_MODULE_H

#include <ThreeWire.h>
#include <RtcDS1302.h>

// RTC Module Pins
#define RTC_DAT 4
#define RTC_CLK 5
#define RTC_RST 2

// Global Objects
extern ThreeWire myWire;
extern RtcDS1302<ThreeWire> Rtc;

void initRTC();
String getTimeStamp();

#endif
