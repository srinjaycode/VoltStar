import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

# Constants
OPTIMAL_MIN = 37
OPTIMAL_MAX = 39
OPTIMAL_TEMP = (OPTIMAL_MIN + OPTIMAL_MAX) / 2

# Simulated Data: Time (minutes) & Temperature (Celsius)
time = np.arange(0, 20, 1)  # 20 time steps
temperature = np.array([33, 34, 36, 38, 40, 42, 37, 38, 35, 34, 32, 36, 39, 41, 42, 38, 37, 36, 35, 34])

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

for i in range(1, len(predicted_temp)):
    current_temp = predicted_temp[i]
    previous_temp = predicted_temp[i - 1]

    # Compute Difference from Optimal Temp
    diff = current_temp - OPTIMAL_TEMP
    prev_diff = previous_temp - OPTIMAL_TEMP

    # AI Decision Making
    if abs(diff) < abs(prev_diff):
        fan_speeds.append(fan_speed)  # No change
    else:
        if diff > 0:
            fan_speed += 10  # Increase fan speed if temp is too high
        else:
            fan_speed -= 10  # Decrease fan speed if temp is too low

        fan_speed = max(0, min(100, fan_speed))  # Ensure fan speed stays 0-100%
        fan_speeds.append(fan_speed)

# Add initial fan speed for plotting
fan_speeds.insert(0, 50)

# Plot Graph
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
