import tkinter as tk
import serial
import threading
import time
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# Serial Port Configuration
SERIAL_PORT = "COM8"  # Change this to match your Arduino port 
BAUD_RATE = 115200

# Try to connect to Serial
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
except:
    ser = None

# GUI Window
root = tk.Tk()
root.title("VTS Dashboard")
root.geometry("700x500")

# Labels for displaying data
rtc_label = tk.Label(root, text="RTC: Not Connected", font=("Arial", 14))
rtc_label.pack()

temp_label = tk.Label(root, text="Temperature: Not Connected", font=("Arial", 14))
temp_label.pack()

imu_label = tk.Label(root, text="IMU: Not Connected", font=("Arial", 14))
imu_label.pack()

speed_label = tk.Label(root, text="Speed: Not Connected", font=("Arial", 14))
speed_label.pack()

vibration_label = tk.Label(root, text="Vibration: Not Connected", font=("Arial", 14))
vibration_label.pack()

# Graph Setup
fig, ax = plt.subplots()
ax.set_title("IMU Acceleration (X, Y, Z)")
ax.set_xlabel("Time")
ax.set_ylabel("Acceleration (m/s²)")
ax.set_ylim(-10, 10)
canvas = FigureCanvasTkAgg(fig, master=root)
canvas.get_tk_widget().pack()

# Data Buffers
time_data = []
ax_data = []
ay_data = []
az_data = []

# Read Serial Data in a Background Thread
def read_serial():
    while True:
        if ser:
            line = ser.readline().decode("utf-8").strip()
            if line:
                process_serial(line)
        time.sleep(0.1)

# Process Incoming Serial Data
def process_serial(line):
    global time_data, ax_data, ay_data, az_data

    parts = line.split(",")
    
    if parts[0] == "RTC":
        rtc_label.config(text="RTC: " + parts[1])
    
    elif parts[0] == "TEMP":
        temp_label.config(text=f"Controller: {parts[1]}°C | Battery: {parts[2]}°C")
    
    elif parts[0] == "IMU":
        if parts[1] == "NC":
            imu_label.config(text="IMU: Not Connected")
            speed_label.config(text="Speed: Not Connected")
            vibration_label.config(text="Vibration: Not Connected")
            return
        
        ax, ay, az = float(parts[1]), float(parts[2]), float(parts[3])
        vx, vy, vz = float(parts[4]), float(parts[5]), float(parts[6])
        speed = float(parts[7])
        vibration = parts[8]

        imu_label.config(text=f"IMU - X: {ax:.2f}, Y: {ay:.2f}, Z: {az:.2f}")
        speed_label.config(text=f"Speed: {speed:.2f} km/h")
        vibration_label.config(text=f"Vibration: {vibration}")

        # Update Graph
        time_data.append(len(time_data))
        ax_data.append(ax)
        ay_data.append(ay)
        az_data.append(az)

        if len(time_data) > 50:  # Limit to last 50 points
            time_data.pop(0)
            ax_data.pop(0)
            ay_data.pop(0)
            az_data.pop(0)

        ax.clear()
        ax.plot(time_data, ax_data, label="Ax", color="r")
        ax.plot(time_data, ay_data, label="Ay", color="g")
        ax.plot(time_data, az_data, label="Az", color="b")
        ax.legend()
        canvas.draw()

# Start Serial Reading Thread
threading.Thread(target=read_serial, daemon=True).start()

# Run GUI
root.mainloop()
