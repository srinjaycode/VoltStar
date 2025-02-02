# VoltStar Telemetry System (VTS)

The **VoltStar Telemetry System** (VTS) is a real-time vehicle performance monitoring solution designed to collect and transmit data from various sensors, including an Inertial Measurement Unit (IMU), GPS, and temperature sensors. The data is wirelessly transmitted using LoRa modules to a Raspberry Pi, where it is processed and displayed in real-time for analytical purposes.

## Features
- **IMU Sensor (MPU6050)**: Monitors vehicle orientation (pitch, roll, yaw).
- **GPS Module**: Tracks the vehicle's location and calculates speed using the Haversine formula.
- **Temperature Sensors (DS18B20)**: Monitors the temperature in the vehicle's controller and batteries.
- **LoRa Modules**: Enables wireless transmission of telemetry data to a Raspberry Pi.
- **TFT Display**: Displays real-time metrics, including speed and warnings (e.g., speed alerts) for the driver.

## Code Overview
This project is divided into two main components: the Arduino code (for sensor data collection and transmission) and the Raspberry Pi setup (for data reception and analytics).

### Arduino Code:
- Collects data from the IMU, GPS, and temperature sensors.
- Calculates orientation (pitch, roll, yaw) and speed.
- Transmits the data via LoRa to the Raspberry Pi.

### Raspberry Pi Setup:
- Receives telemetry data from the Arduino via LoRa.
- Processes and displays data for real-time analytics and monitoring (dashboard development in progress).

## Libraries Used:
- **Wire**: For communication with the IMU.
- **Adafruit_GPS**: For processing GPS data.
- **LoRa**: For LoRa communication.
- **OneWire & DallasTemperature**: For reading temperature sensor data.
- **MCUFRIEND_kbv**: For managing TFT display communication.
- **Adafruit_GFX**: For handling graphic drawing on TFT displays.

## Project Structure
The project is organized for easy navigation and access:

- `/Circuits/`: Circuit diagrams for all components.
- `/Excel Sheets/`: Component list and cost estimation.
- `/Measurements/`: 3D model measurements for parts and components.
- `/Code/`: Source code for all components.

  - `/Sensor Data Collection Code/`: Code for collecting sensor data.
    - **RTC.ino**: Basic Arduino program for Real-Time Clock (RTC).
    - **gps_code_voltstar.ino**: Arduino code that calculates vehicle speed using GPS data and the Haversine formula.
    - **VoltStarAccelerometer.ino**: Core code for IMU sensor; tracks distance, vibration, tilt, and velocity using filters (Kalman, LPF).
    - **VoltStarTFTDisplay.ino**: Code to display metrics (e.g., speed, temperature) on a TFT display.
    - **Temperature.ino**: Code to read data from the DS18B20 temperature sensors.

## Installation & Setup

### Hardware Setup

#### Arduino:
1. Connect the **MPU6050 (IMU)** to the Arduino using I2C communication.
2. Connect the **GPS Module** to the Arduino via serial communication.
3. Attach **DS18B20 temperature sensors** to the Arduino.
4. Set up the **LoRa Module** for wireless data transmission.
5. Connect the **TFT Display** to show speed and alerts.

#### Raspberry Pi:
1. Set up a **LoRa receiver** on the Raspberry Pi to receive data.
2. Prepare for dashboard integration (currently under development).

### Arduino Code:
1. Clone or download the repository.
2. Open the Arduino IDE and load the appropriate code for your Arduino model.
3. Upload the code to the Arduino board.
4. Ensure that all sensors are correctly connected to the respective pins.

### Raspberry Pi Setup:
1. Install the necessary libraries for LoRa communication and data reception.
2. Set up the Raspberry Pi to receive telemetry data from the Arduino via LoRa.
3. Display telemetry data on a dashboard (under development).

## How to Use

- **For the Driver**: The TFT display will provide essential real-time data such as current speed and warnings if the speed exceeds a predefined limit.
- **For Monitoring**: Telemetry data will be transmitted to the Raspberry Pi for further analysis and can be displayed on a dashboard in future updates.

## License
This project is licensed under the [MIT License](LICENSE).

## Contributors
- **Srinjay Shrinivas Shankar**: Electronics Engineer, Arduino Developer (C++) and 3D Modeling
- **Ahmed Rizwan**:  Electronics Engineer, Coder.
- **Yahia Ezzat**: C++ Develper, Arduino Coder.
- **Abdulhayee Yamin**: Ex Game Dev, C# Developer 
