#ifndef GPS_MODULE_H
#define GPS_MODULE_H

#include <TinyGPS++.h>

extern TinyGPSPlus gps;

void initGPS();
void getGPS();

#endif
