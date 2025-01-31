import tkinter as tk
import serial
import threading
import time
import matplotlib.pyplot as plt
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from PIL import Image, ImageTk

# Serial Port Configuration
SERIAL_PORT = "COM8"  # Change based on your Arduino port
BAUD_RATE = 115200

# Try to connect to Serial
try:
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
except:
    ser = None

# Define Colors & Font
BG_COLOR = "#FFFFFF"  # White Background
TEXT_COLOR = "#000000"  # Black Text
TITLE_COLOR = "#333333"  # Darker Title Text
ACCENT_COLOR = "#FFD700"  # Yellow Theme
BUTTON_COLOR = "#FFD700"  # Yellow Buttons
BUTTON_HOVER = "#E6C200"  # Darker Yellow on Hover
FONT = ("Ubuntu", 14, "normal")
TITLE_FONT = ("Ubuntu", 26, "bold")  # Bigger, bolder title
STATS_TITLE_FONT = ("Ubuntu", 16, "bold")  # Bold Metric Titles
STATS_DATA_FONT = ("Ubuntu", 16, "normal")  # Light Metric Data
BUTTON_FONT = ("Ubuntu", 14, "bold")

# GUI Window (Slightly Smaller)
root = tk.Tk()
root.title("Voltstar Telemetry System")
root.geometry("900x500")  # Reduced window size
root.configure(bg=BG_COLOR)

# Load Bolt Image (Resized to Fix Stretching)
bolt_img = Image.open("bolt.png").resize((80, 80))  # Increased size & fixed aspect ratio
bolt_icon = ImageTk.PhotoImage(bolt_img)

# Title with Bolt Icon
title_frame = tk.Frame(root, bg=BG_COLOR)
title_frame.pack(fill="x", pady=10)

bolt_label_left = tk.Label(title_frame, image=bolt_icon, bg=BG_COLOR)
bolt_label_left.pack(side=tk.LEFT, padx=10)

title_label = tk.Label(title_frame, text="Voltstar Telemetry System", font=TITLE_FONT, fg=TITLE_COLOR, bg=BG_COLOR)
title_label.pack(side=tk.LEFT, expand=True)

bolt_label_right = tk.Label(title_frame, image=bolt_icon, bg=BG_COLOR)
bolt_label_right.pack(side=tk.RIGHT, padx=10)

# **Yellow Horizontal Line (HR)**
hr_line = tk.Canvas(root, height=3, bg=ACCENT_COLOR, highlightthickness=0)
hr_line.pack(fill="x")

# Stats Grid (Organized in a Full Layout)
stats_frame = tk.Frame(root, bg=BG_COLOR)
stats_frame.pack(fill="both", expand=True, padx=40, pady=10)

def create_stat_row(label_text, row):
    label = tk.Label(stats_frame, text=label_text, font=STATS_TITLE_FONT, fg=TITLE_COLOR, bg=BG_COLOR, anchor="w")
    label.grid(row=row, column=0, sticky="w", padx=10, pady=5)

    value_label = tk.Label(stats_frame, text="Not Connected", font=STATS_DATA_FONT, fg=TEXT_COLOR, bg=BG_COLOR, anchor="w")
    value_label.grid(row=row, column=1, sticky="w", padx=10, pady=5)

    return value_label

rtc_label = create_stat_row("RTC:", 0)
temp_label = create_stat_row("Temperature:", 1)
imu_label = create_stat_row("IMU:", 2)
speed_label = create_stat_row("Speed:", 3)
vibration_label = create_stat_row("Vibration:", 4)

# Graph Buttons (IMU & Temperature)
graph_buttons_frame = tk.Frame(root, bg=BG_COLOR)
graph_buttons_frame.pack(fill="x", pady=10)

# Function to Style Buttons
def create_graph_button(parent, text, command):
    btn = tk.Button(
        parent, text=text, font=BUTTON_FONT, bg=BUTTON_COLOR, fg=TEXT_COLOR,
        activebackground=BUTTON_HOVER, activeforeground=TEXT_COLOR,
        bd=0, padx=20, pady=10, relief="flat", cursor="hand2"
    )
    btn.configure(highlightbackground=BUTTON_COLOR, highlightthickness=3)
    btn.bind("<Enter>", lambda e: btn.config(bg=BUTTON_HOVER))
    btn.bind("<Leave>", lambda e: btn.config(bg=BUTTON_COLOR))
    btn.config(command=command)
    return btn

def open_imu_graph():
    create_graph_window("IMU Acceleration (X, Y, Z)", [-10, 10])

def open_temp_graph():
    create_graph_window("Temperature (Controller & Battery)", [0, 100])

def create_graph_window(title, y_range):
    graph_window = tk.Toplevel(root)
    graph_window.title(title)
    graph_window.configure(bg=BG_COLOR)

    fig, ax = plt.subplots()
    fig.patch.set_facecolor(BG_COLOR)
    ax.set_facecolor("#F0F0F0")
    ax.spines["bottom"].set_color(TEXT_COLOR)
    ax.spines["left"].set_color(TEXT_COLOR)
    ax.xaxis.label.set_color(TEXT_COLOR)
    ax.yaxis.label.set_color(TEXT_COLOR)
    ax.title.set_color(ACCENT_COLOR)
    ax.tick_params(colors=TEXT_COLOR)

    ax.set_title(title, fontsize=14, color=ACCENT_COLOR, fontweight="bold")
    ax.set_xlabel("Time", fontsize=12, color=TEXT_COLOR)
    ax.set_ylabel(title.split()[0], fontsize=12, color=TEXT_COLOR)
    ax.set_ylim(y_range)
    ax.grid(color="gray", linestyle="dashed")

    canvas = FigureCanvasTkAgg(fig, master=graph_window)
    canvas.get_tk_widget().pack()

# Buttons
imu_button = create_graph_button(graph_buttons_frame, "IMU Graph", open_imu_graph)
imu_button.pack(side=tk.LEFT, expand=True, fill="x", padx=20)

temp_button = create_graph_button(graph_buttons_frame, "Temperature Graph", open_temp_graph)
temp_button.pack(side=tk.LEFT, expand=True, fill="x", padx=20)

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
    parts = line.split(",")

    if parts[0] == "RTC":
        rtc_label.config(text=parts[1], fg=ACCENT_COLOR)
    
    elif parts[0] == "TEMP":
        temp_label.config(text=f"{parts[1]}°C | {parts[2]}°C", fg=ACCENT_COLOR)
    
    elif parts[0] == "IMU":
        if parts[1] == "NC":
            imu_label.config(text="Not Connected", fg="red")
            speed_label.config(text="Not Connected", fg="red")
            vibration_label.config(text="Not Connected", fg="red")
            return
        
        speed_label.config(text=f"{float(parts[7]):.2f} km/h", fg=ACCENT_COLOR)
        vibration_label.config(text=parts[8], fg=("red" if parts[8] == "High" else ACCENT_COLOR))

# Start Serial Reading Thread
threading.Thread(target=read_serial, daemon=True).start()

# Run GUI
root.mainloop()
