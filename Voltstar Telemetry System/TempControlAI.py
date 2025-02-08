import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import pandas as pd  # Add pandas for CSV handling

# Function to load temperature data from CSV
def load_temperature_data(csv_file):
    # Read CSV file - expecting a column named 'temperature'
    df = pd.read_csv(csv_file)
    
    # Convert temperature column to numpy array
    temperature = df['temperature'].to_numpy()
    
    # Create time array with same length as temperature data
    time = np.arange(0, len(temperature), 1)
    
    return time, temperature

# Constants
OPTIMAL_MIN = 37
OPTIMAL_MAX = 39
OPTIMAL_TEMP = (OPTIMAL_MIN + OPTIMAL_MAX) / 2

# Load data from CSV instead of using static array
# Replace 'your_data.csv' with your actual CSV file name
time, temperature = load_temperature_data('your_data.csv')

# Normalize Data (0 to 1 for TensorFlow)
min_temp = min(temperature)
max_temp = max(temperature)
temperature_norm = (temperature - min_temp) / (max_temp - min_temp)
time_norm = time / max(time)

# Create a Neural Network Model
model = tf.keras.Sequential([
    tf.keras.layers.Dense(10, activation='relu', input_shape=[1]),  # 1 input (time)
    tf.keras.layers.Dense(10, activation='relu'),
    tf.keras.layers.Dense(1)  # 1 output (predicted temperature)
])

# Rest of your original code remains exactly the same
# Compile Model
model.compile(optimizer='adam', loss='mse')

# Train Model
model.fit(time_norm, temperature_norm, epochs=500, verbose=0)

# Predict Future Temperatures
predicted_temp_norm = model.predict(time_norm).flatten()
predicted_temp = predicted_temp_norm * (max_temp - min_temp) + min_temp  # Convert back to actual scale

# Fan Speed Control Logic
fan_speeds = []  # Store fan speed over time
fan_speed = 50  # Initial fan speed
n = 1  # AI-decided multiplier for fan speed changes

# Scoring System
scores = []  # Store scores for each time step

for i in range(1, len(predicted_temp)):
    current_temp = predicted_temp[i]
    previous_temp = predicted_temp[i - 1]
    
    # Compute Difference from Optimal Temp
    diff = current_temp - OPTIMAL_TEMP
    prev_diff = previous_temp - OPTIMAL_TEMP

    # Compute Slope of Temperature Change
    slope = abs(current_temp - previous_temp)

    # AI Decision Making for Fan Speed
    if abs(diff) < abs(prev_diff):
        fan_speeds.append(fan_speed)  # No change
    else:
        # AI Decides n Based on Slope
        n = min(5, max(1, int(slope * 5)))  # n ranges from 1 to 5, based on slope
        
        if diff > 0:
            fan_speed += 10 * n  # Increase fan speed if temp is too high
        else:
            fan_speed -= 10 * n  # Decrease fan speed if temp is too low

        fan_speed = max(0, min(100, fan_speed))  # Ensure fan speed stays 0-100%
        fan_speeds.append(fan_speed)

    # Assign a Score: Lower slope = More stability = Higher score
    if OPTIMAL_MIN <= current_temp <= OPTIMAL_MAX:
        score = max(0, 10 - (slope * 10))  # High score for small slope
    else:
        score = 0  # No score if outside optimal range
    
    scores.append(score)

# Add initial fan speed and score for plotting
fan_speeds.insert(0, 50)
scores.insert(0, 0)

# Plot Graph: AI Predicted Temperature and Fan Speed
plt.figure(figsize=(10, 5))
plt.plot(time, temperature, 'bo-', label="Actual Temperature")  # Actual temp data
plt.plot(time, predicted_temp, 'r-', label="AI Predicted Temperature")  # Predicted temp
plt.plot(time, fan_speeds, 'g--', label="Fan Speed (%)")  # Fan speed over time
plt.axhline(y=OPTIMAL_MIN, color='gray', linestyle='dashed', label="Optimal Min (37°C)")
plt.axhline(y=OPTIMAL_MAX, color='gray', linestyle='dashed', label="Optimal Max (39°C)")
plt.xlabel("Time (minutes)")
plt.ylabel("Temperature (°C) & Fan Speed (%)")
plt.legend()
plt.title("AI Fan Control System")
plt.show()

# Plot Graph: Stability Score Over Time (Bar Graph)
plt.figure(figsize=(10, 5))
plt.bar(time, scores, color='purple', label="Stability Score")
plt.xlabel("Time (minutes)")
plt.ylabel("Score (Higher is Better)")
plt.legend()
plt.title("AI Learning Stability Score Over Time")
plt.show()

# EXTRA Graph: Score with Time (Line Graph)
plt.figure(figsize=(10, 5))
plt.plot(time, scores, 'm-o', label="Stability Score Over Time")  # Stability score over time
plt.xlabel("Time (minutes)")
plt.ylabel("Score (Higher is Better)")
plt.legend()
plt.title("AI Stability Score Over Time (Line Graph)")
plt.show()
