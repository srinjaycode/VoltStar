import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

# Set optimal temperature limits
OPTIMAL_MIN = 25
OPTIMAL_MAX = 30
OPTIMAL_TEMP = (OPTIMAL_MIN + OPTIMAL_MAX) / 2
MIN_FAN_SPEED = 10  # Minimum fan speed

# Time and temperature data
time = np.arange(4, 302, 2)  # Time from 4 to 300 minutes
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

# Normalize data
min_temp = min(temperature)
max_temp = max(temperature)
temperature_norm = (temperature - min_temp) / (max_temp - min_temp)
time_norm = time / max(time)

# Build neural network model
model = tf.keras.Sequential([
    tf.keras.layers.Dense(10, activation='relu', input_shape=[1]),
    tf.keras.layers.Dense(10, activation='relu'),
    tf.keras.layers.Dense(1)
])

# Compile and train model
model.compile(optimizer='adam', loss='mse')
model.fit(time_norm, temperature_norm, epochs=500, verbose=0)

# Make predictions
predicted_temp_norm = model.predict(time_norm).flatten()
predicted_temp = predicted_temp_norm * (max_temp - min_temp) + min_temp

# Fan speed control logic
fan_speeds = [0]  # Start fan speed with 0
fan_speed = 0  # Initial fan speed

# Adjust fan speed based on temperature
for i in range(1, len(predicted_temp)):
    current_temp = predicted_temp[i]
    previous_temp = predicted_temp[i - 1]

    # Difference from optimal temperature
    diff = current_temp - OPTIMAL_TEMP
    prev_diff = previous_temp - OPTIMAL_TEMP

    # Calculate slope
    slope = current_temp - previous_temp

    # Adjust fan speed
    if OPTIMAL_MIN <= current_temp <= OPTIMAL_MAX:
        if abs(slope) < 0.1:
            fan_speed = max(MIN_FAN_SPEED, fan_speed * (1 - 0.2))  # Gradually reduce fan speed
        else:
            fan_speed = max(MIN_FAN_SPEED, min(100, fan_speed + slope * 50 * 0.2))
    elif current_temp > OPTIMAL_MAX:
        fan_speed = min(100, fan_speed + 0.2 * 100)  # Increase fan speed if too hot
    else:
        fan_speed = max(MIN_FAN_SPEED, fan_speed - 0.2 * 100)  # Decrease fan speed if too cold

    fan_speeds.append(fan_speed)

# --- Calculate the percentages ---
# Percentage of time spent within the optimal temperature range
optimal_range_count = sum(1 for temp in predicted_temp if OPTIMAL_MIN <= temp <= OPTIMAL_MAX)
total_time = len(predicted_temp)
time_in_optimal_range = (optimal_range_count / total_time) * 100

# Percentage based on the slopes
slopes_in_optimal_range = [predicted_temp[i] - predicted_temp[i - 1] for i in range(1, len(predicted_temp))]
optimal_slopes = [slope for i, slope in enumerate(slopes_in_optimal_range) if OPTIMAL_MIN <= predicted_temp[i + 1] <= OPTIMAL_MAX]
average_slope = sum(optimal_slopes) / len(optimal_slopes) if optimal_slopes else 0
slope_percentage = (1 - (abs(average_slope) / max(abs(min(slopes_in_optimal_range)), abs(max(slopes_in_optimal_range))))) * 100

# Plot combined graph (temperature and fan speed)
fig, ax1 = plt.subplots(figsize=(10, 5))

# Plot Temperature on first y-axis
ax1.set_xlabel("Time (minutes)")
ax1.set_ylabel("Temperature (°C)", color='tab:blue')
ax1.plot(time, temperature, 'bo-', label="Actual Temperature")
ax1.plot(time, predicted_temp, 'r-', label="AI Predicted Temperature")
ax1.axhline(y=OPTIMAL_MIN, color='gray', linestyle='dashed', label="Optimal Min (25°C)")
ax1.axhline(y=OPTIMAL_MAX, color='gray', linestyle='dashed', label="Optimal Max (30°C)")
ax1.tick_params(axis='y', labelcolor='tab:blue')

# Create second y-axis for Fan Speed
ax2 = ax1.twinx()
ax2.set_ylabel("Fan Speed (%)", color='tab:green')
ax2.plot(time, fan_speeds, 'g--', label="Fan Speed (%)")
ax2.tick_params(axis='y', labelcolor='tab:green')

# Legends for both axes
fig.tight_layout()  # To ensure everything fits without overlap
fig.legend(loc="upper left", bbox_to_anchor=(0.1, 1), bbox_transform=ax1.transAxes)

plt.title("AI Temperature Prediction and Fan Speed Control")
plt.show()

# --- Plot the Pie Charts ---
# Pie chart for time in optimal range
plt.figure(figsize=(6, 6))
time_labels = ['Time in Optimal Range', f'Time Outside Optimal Range']
time_sizes = [time_in_optimal_range, 100 - time_in_optimal_range]
plt.pie(time_sizes, labels=time_labels, autopct='%1.1f%%', startangle=90, colors=['#66b3ff', '#ff6666'])
plt.title("Time in Optimal Temperature Range")
plt.show()

# Pie chart for slope percentage
plt.figure(figsize=(6, 6))
slope_labels = ['Stability', f'Instability']
slope_sizes = [slope_percentage, 100 - slope_percentage]
plt.pie(slope_sizes, labels=slope_labels, autopct='%1.1f%%', startangle=90, colors=['#66ff66', '#ffcc66'])
plt.title("Slope Stability Percentage")
plt.show()
