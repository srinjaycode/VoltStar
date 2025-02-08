import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

# Constants
OPTIMAL_MIN = 37
OPTIMAL_MAX = 39
OPTIMAL_TEMP = (OPTIMAL_MIN + OPTIMAL_MAX) / 2

# Simulated Data: Time (minutes) & Temperature (Celsius)
time = np.arange(4, 302, 2)  # 149 time steps
temperature = np.array([22.62, 22.62, 22.62, 22.56, 22.56, 22.56, 22.56, 22.56, 22.5, 22.56, 22.5,
    22.5, 22.5, 22.56, 22.5, 22.56, 22.56, 22.56, 22.56, 22.56, 22.56, 22.56,
    22.56, 22.56, 22.56, 22.56, 22.81, 24.06, 24.94, 25.31, 25.44, 25.69, 25.81,
    26.25, 27.25, 28.19, 28.94, 29.56, 30.12, 30.5, 30.94, 31.25, 31.5, 31.62,
    31.81, 31.94, 32.06, 32, 31.94, 31.81, 31.75, 31.87, 31.87, 32, 32.19, 32.25,
    32.31, 32.44, 32.63, 32.88, 33.06, 33.19, 33.13, 33, 32.88, 32.75, 32.5, 32.31,
    32.19, 31.94, 31.75, 31.62, 31.44, 31.25, 31.37, 31.69, 31.81, 31.81, 31.81,
    31.75, 31.62, 31.5, 31.37, 31.25, 31.19, 31, 30.81, 30.69, 30.56, 30.44, 30.31,
    30.25, 30.12, 30.06, 30, 29.87, 29.81, 29.75, 29.62, 29.5, 29.44, 29.31, 29.25,
    29.19, 29.12, 29.06, 28.94, 28.94, 28.81, 28.75, 28.69, 28.62, 28.56, 28.5,
    28.37, 28.25, 28.19, 28.12, 28, 27.94, 27.87, 27.75, 27.75, 27.62, 27.62, 27.56,
    27.44, 27.44, 27.37, 27.25, 27.25, 27.12, 27.06, 27.06, 26.94, 26.87, 26.81,
    26.75, 26.75, 26.69, 26.62, 26.56, 26.44, 26.44, 26.37, 26.31, 26.25, 26.19, 26.19])

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

    # Condition: If temperature is within optimal range and slope is between -0.5 and 0.5
    if OPTIMAL_MIN <= current_temp <= OPTIMAL_MAX and -0.5 < slope < 0.5:
        fan_speeds.append(fan_speed)  # Keep fan speed as is
    else:
        # AI Decision Making for Fan Speed Change
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
plt.xlabel("Time (seconds)")
plt.ylabel("Temperature (°C) & Fan Speed (%)")
plt.legend()
plt.title("AI Fan Control System")
plt.show()

# Plot Graph: Stability Score Over Time (Bar Graph)
plt.figure(figsize=(10, 5))
plt.bar(time, scores, color='purple', label="Stability Score")
plt.xlabel("Time (seconds)")
plt.ylabel("Score (Higher is Better)")
plt.legend()
plt.title("AI Learning Stability Score Over Time")
plt.show()

# EXTRA Graph: Score with Time (Line Graph)
plt.figure(figsize=(10, 5))
plt.plot(time, scores, 'm-o', label="Stability Score Over Time")  # Stability score over time
plt.xlabel("Time (seconds)")
plt.ylabel("Score (Higher is Better)")
plt.legend()
plt.title("AI Stability Score Over Time (Line Graph)")
plt.show()
