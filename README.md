# VoltStar Telemetry System

**VTS** is a real-time telemetry system designed to monitor vehicle performance using sensors like IMU (Inertial Measurement Unit), GPS, and temperature sensors. Data is wirelessly transmitted via LoRa modules to a Raspberry Pi, where it is processed and presented in real-time.

## Features

- **IMU Sensor (MPU6050)**: Tracks vehicle orientation (pitch, roll, yaw).
- **GPS Module**: Tracks location and calculates speed using the Haversine formula.
- **Temperature Sensors (DS18B20)**: Monitors temperature in the controller and batteries.
- **LoRa Modules**: Facilitates wireless data transmission to a Raspberry Pi for real-time analytics.
- **TFT Display**: Shows critical data like speed and warnings for the driver (e.g., speed alerts).

## Code Overview

The project is built using **Arduino IDE** and is split into two primary components:

1. **Arduino Code**: 
   - Reads data from the IMU, GPS, and temperature sensors.
   - Calculates orientation (pitch, roll, yaw) and speed.
   - Transmits the data via LoRa to the Raspberry Pi.

2. **Raspberry Pi Setup**: 
   - Receives the telemetry data via LoRa.
   - Processes and displays the data for analytics and monitoring (dashboard still under development).

### Libraries Used:
- **Wire**: For communication with the IMU.
- **Adafruit_GPS**: For handling GPS data.
- **LoRa**: For LoRa communication.
- **OneWire & DallasTemperature**: For reading from the temperature sensors.

## Project Structure

The project is organized into several folders and files for ease of navigation:

### `/Circuits/` folder
Contains the circuit diagrams for all components.

### `/Excel Sheets/` folder
Contains the sheet for all required components & costs.

### `/Measurements/` folder
Contains the measurements for all 3D models used/printed.

### `/Code/` folder
Contains the source code:
### `/Sensor Data Collection Code/` folder: Contains the code for data collection for all sensor devices.
- **RTC.ino**: Basic arduino program for the Real-Time-Clock.
- **gps_code_voltstar.ino**: Arduino code using the haversine formula to calculate the instantaneous speed of the car with GPS module.
- **VoltStarAccelerometer.ino**: Core code for IMU, tracking distance, vibration, tilt, and velocity using various filters (Kalman, LPF) and algorithms.
- **VoltStarTFTDisplay.ino**: Code for showing metrics on the TFT display (velocity, temp).
- **Temperature.ino**: Code for retrieving temperature in DS18B20 sensors.


## Installation & Setup

### Hardware Setup:
1. **Arduino**:
   - Connect the **MPU6050** (IMU) to the Arduino via I2C.
   - Connect the **GPS Module** to the Arduino via serial communication.
   - Attach the **DS18B20** temperature sensors to the Arduino.
   - Connect the **LoRa Module** for wireless data transmission.
   - Set up the **TFT Display** for showing speed and alerts.

2. **Raspberry Pi**:
   - Set up a LoRa receiver on the Raspberry Pi to receive data.
   - Prepare for the future dashboard setup (currently under development).

### Arduino Code:
1. Clone or download the repository.
2. Open the Arduino IDE and load the appropriate code for your Arduino model.
3. Upload the code to your Arduino board.
4. Ensure the sensors are correctly connected to the corresponding pins.

### Raspberry Pi Setup:
1. Install necessary libraries to handle LoRa communication and data reception.
2. Set up the Raspberry Pi to receive telemetry data from the Arduino via LoRa (use a LoRa receiver module).
3. Display the telemetry data on a dashboard (still in progress).

## How to Use
- **For the Driver**: The **TFT Display** will show essential real-time data, like the current speed and alerts if the speed exceeds a predefined limit.
- **For Monitoring**: The telemetry data is sent to the **Raspberry Pi**, which can be used for further analysis or displayed on a dashboard.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributors

- **Srinjay Shrinivas Shankar** - Project Lead, Arduino Developer
- **Ahmed Rizwan** - Raspberry Pi Developer, Backend Engineer

---

Explore the project and contribute here: [VoltStar GitHub Repository](https://github.com/srinjaycode/VoltStar)
