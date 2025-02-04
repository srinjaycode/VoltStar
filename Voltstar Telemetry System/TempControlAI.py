import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

# Step 1: Generate Sample Data (Simulated Temperature Readings)
np.random.seed(0)
time = np.array(range(1, 11))  # Time in minutes
temperature = np.array([30, 32, 34, 33, 36, 37, 40, 42, 41, 45])  # Battery temperature in Celsius

# Step 2: Normalize the Data (for better AI training)
min_time, max_time = time.min(), time.max()
min_temp, max_temp = temperature.min(), temperature.max()

time_norm = (time - min_time) / (max_time - min_time)  # Normalize time
temperature_norm = (temperature - min_temp) / (max_temp - min_temp)  # Normalize temperature

# Ensure time_norm is reshaped to (N,1)
time_norm = time_norm.reshape(-1, 1)

# Step 3: Build the Regression Model
model = tf.keras.Sequential([
    tf.keras.layers.Dense(units=16, activation='relu', input_shape=[1]),  # Hidden layer with ReLU
    tf.keras.layers.Dense(units=8, activation='relu'),  # Another hidden layer
    tf.keras.layers.Dense(units=1)  # Output layer predicting normalized temperature
])

model.compile(optimizer='adam', loss='mse')  # Using Adam optimizer and Mean Squared Error loss

# Step 4: Train the Model
model.fit(time_norm, temperature_norm, epochs=500, verbose=0)  # Train for 500 epochs

# Step 5: Predict Future Temperature at t=12 Minutes
future_time = 12  # Time at which we want the prediction
future_time_norm = (future_time - min_time) / (max_time - min_time)  # Normalize input
future_time_norm = np.array([[future_time_norm]])  # Ensure it's 2D

predicted_temp_norm = model.predict(future_time_norm)[0][0]  # Predict normalized temperature
predicted_temp = predicted_temp_norm * (max_temp - min_temp) + min_temp  # Convert back to Celsius

# Step 6: Calculate Difference from Optimum Temperature
optimum_temp = 38
diff = abs(predicted_temp - optimum_temp)

# Reward function: the smaller the diff, the better the prediction
reward = max(0, 10 - diff)  # Example: reward decreases as diff increases

print(f"Predicted Temperature at t=12 minutes: {predicted_temp:.2f}°C")
print(f"Difference from Optimum: {diff:.2f}°C")
print(f"Reward Score: {reward:.2f}")

# Step 7: Plot the Graph
plt.scatter(time, temperature, color='blue', label="Actual Data")  # Plot actual data points

# Ensure time_norm is used properly and output is flattened
predicted_values = model.predict(time_norm).flatten() * (max_temp - min_temp) + min_temp
plt.plot(time, predicted_values, color='red', label="AI Prediction")  # Line of best fit

# Plot the predicted point at t=12
plt.scatter([future_time], [predicted_temp], color='green', marker='x', s=100, label="Predicted Point")

plt.xlabel("Time (minutes)")
plt.ylabel("Battery Temperature (°C)")
plt.title("Battery Temperature Prediction")
plt.legend()
plt.grid()
plt.show()
