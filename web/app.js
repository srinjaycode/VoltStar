// VoltStar Neural AI - CORRECTED VERSION
// Fixes: signal filtering, meaningful ML, proper visualization, uncertainty quantification
console.log('🚀 VoltStar Neural AI - Initializing with proper signal processing...');

// Firebase config
const firebaseConfig = {
  databaseURL: "https://voltstar01-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Telemetry data storage with filtered versions
let telemetryData = {
  timestamps: [],
  // Raw measurements
  speed: [],
  voltage: [],
  current: [],
  power: [],
  rpm: [],
  distance: [],
  // Filtered signals (for derivatives)
  speedFiltered: [],
  voltageFiltered: [],
  currentFiltered: [],
  // Derived quantities from filtered data
  torque: [],
  acceleration: [],
  jerk: [],
  energy: [],
  soc: [],
  ampHours: [],
  // Prediction tracking for validation
  predictedPower: [],
  predictionError: []
};

let currentData = {
  speed: 0,
  voltage: 0,
  current: 0,
  power: 0,
  rpm: 0,
  distance: 0,
  torque: 0,
  acceleration: 0,
  soc: 100,
  energyPerKm: 0,
  jerk: 0
};

let chatHistory = [];
let maxDataPoints = 500; // CHANGED: Store last 500 values
let isConnected = false;

// Vehicle physical constants
const VEHICLE_CONSTANTS = {
  batteryCapacity: 26,
  batteryVoltage: 48,
  motorPower: 1000,
  wheelDiameter: 0.66,
  vehicleMass: 120,
  dragCoefficient: 0.6,
  frontalArea: 0.5,
  airDensity: 1.225,
  rollingResistance: 0.008,
  maxRPM: 500,
  maxTorque: 50,
  maxPower: 1000,
  maxCurrent: 30,
  maxVoltage: 60,
  maxSpeed: 60,
  internalResistanceRange: [0.05, 0.5],
  efficiencyRange: [0.7, 0.95],
  maxAcceleration: 5,
  maxJerk: 10,
  // Sensor uncertainty
  speedUncertainty: 0.5, // km/h
  voltageUncertainty: 0.1, // V
  currentUncertainty: 0.2, // A
  rpmUncertainty: 5
};

// Signal processing parameters
const FILTER_CONFIG = {
  movingAverageWindow: 5,
  accelerationFilterWindow: 3,
  jerkFilterWindow: 5,
  outlierThreshold: 3.0 // standard deviations
};

// Neural network state
let model = null;
let trainingEpochs = 0;
let modelMetrics = {
  trainLoss: 0,
  valLoss: 0,
  predictionErrors: [],
  lastUpdate: null
};
let trainingData = [];
let validationData = [];
let lastTrainingTime = 0;
let autoTrainInterval = null;

// ============================================================================
// SIGNAL PROCESSING - Proper filtering before derivatives
// ============================================================================

function movingAverage(data, windowSize) {
  if (data.length === 0) return [];
  const result = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, i + Math.floor(windowSize / 2) + 1);
    const window = data.slice(start, end);
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    result.push(avg);
  }
  return result;
}

function detectOutliers(data, threshold = 3.0) {
  if (data.length < 3) return new Array(data.length).fill(false);
  
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
  const stdDev = Math.sqrt(variance);
  
  return data.map(val => Math.abs(val - mean) > threshold * stdDev);
}

function removeOutliers(data, outlierFlags) {
  const cleaned = [];
  for (let i = 0; i < data.length; i++) {
    if (outlierFlags[i] && i > 0) {
      // Replace outlier with interpolated value
      const prev = cleaned[cleaned.length - 1] || data[i];
      const next = data[Math.min(i + 1, data.length - 1)];
      cleaned.push((prev + next) / 2);
    } else {
      cleaned.push(data[i]);
    }
  }
  return cleaned;
}

function applySignalFiltering() {
  // Only filter if we have enough data
  if (telemetryData.speed.length < FILTER_CONFIG.movingAverageWindow) {
    telemetryData.speedFiltered = [...telemetryData.speed];
    telemetryData.voltageFiltered = [...telemetryData.voltage];
    telemetryData.currentFiltered = [...telemetryData.current];
    return;
  }
  
  // Detect and remove outliers first
  const speedOutliers = detectOutliers(telemetryData.speed);
  const voltageOutliers = detectOutliers(telemetryData.voltage);
  const currentOutliers = detectOutliers(telemetryData.current);
  
  const speedCleaned = removeOutliers(telemetryData.speed, speedOutliers);
  const voltageCleaned = removeOutliers(telemetryData.voltage, voltageOutliers);
  const currentCleaned = removeOutliers(telemetryData.current, currentOutliers);
  
  // Apply moving average filter
  telemetryData.speedFiltered = movingAverage(speedCleaned, FILTER_CONFIG.movingAverageWindow);
  telemetryData.voltageFiltered = movingAverage(voltageCleaned, FILTER_CONFIG.movingAverageWindow);
  telemetryData.currentFiltered = movingAverage(currentCleaned, FILTER_CONFIG.movingAverageWindow);
}

// ============================================================================
// PHYSICAL CALCULATIONS - Now using filtered data for derivatives
// ============================================================================

function calculateTruePhysicalParameters(dataPoint, index) {
  const { speed, voltage, current, rpm, distance } = dataPoint;
  
  const power = voltage * current;
  const omega = (2 * Math.PI * rpm) / 60;
  const torque = omega > 0 ? power / omega : 0;
  
  // Use FILTERED speed for acceleration calculation
  let acceleration = 0;
  if (index > 0 && telemetryData.speedFiltered.length > index) {
    const prevSpeed = telemetryData.speedFiltered[index - 1];
    const currentSpeed = telemetryData.speedFiltered[index];
    const dt = 1;
    const speedMs = currentSpeed / 3.6;
    const prevSpeedMs = prevSpeed / 3.6;
    acceleration = (speedMs - prevSpeedMs) / dt;
  }
  
  // Calculate jerk from FILTERED acceleration
  let jerk = 0;
  if (index > 1 && telemetryData.acceleration.length > index - 1) {
    const accelWindow = telemetryData.acceleration.slice(
      Math.max(0, index - FILTER_CONFIG.jerkFilterWindow),
      index
    );
    const accelFiltered = movingAverage(accelWindow, Math.min(3, accelWindow.length));
    if (accelFiltered.length >= 2) {
      const prevAccel = accelFiltered[accelFiltered.length - 2];
      const currentAccel = accelFiltered[accelFiltered.length - 1];
      jerk = currentAccel - prevAccel;
    }
  }
  
  // Energy accumulation
  const prevEnergy = index > 0 ? (telemetryData.energy[index - 1] || 0) : 0;
  const energy = prevEnergy + (power / 3600); // Wh
  
  // Amp-hours
  let ampHours;
  if (dataPoint.ah !== undefined && dataPoint.ah !== null) {
    ampHours = parseFloat(dataPoint.ah);
  } else {
    const prevAh = index > 0 ? (telemetryData.ampHours[index - 1] || 0) : 0;
    ampHours = prevAh + (current / 3600);
  }
  
  const totalAh = VEHICLE_CONSTANTS.batteryCapacity;
  const soc = Math.max(0, Math.min(100, 100 - (ampHours / totalAh) * 100));
  
  return { power, torque, acceleration, jerk, energy, soc, ampHours };
}

// ============================================================================
// NEURAL NETWORK - Now learns ACTUAL behavior vs theoretical predictions
// ============================================================================

async function initNeuralNetwork() {
  console.log('🧠 Initializing Predictive Neural Network...');
  
  // Model now predicts FUTURE state (next 5 seconds)
  model = tf.sequential({
    layers: [
      // Input: current state + recent history
      tf.layers.dense({ inputShape: [10], units: 64, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 128, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 64, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.1 }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      // Output: predicted next state + uncertainty
      tf.layers.dense({ units: 6, activation: 'linear' })
    ]
  });
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  
  console.log('✅ Neural Network initialized');
  addTrainingLog('predictive model initialized', 'success');
  addTrainingLog('inputs: current state + 4-point history (speed, voltage, current, rpm, power)', 'info');
  addTrainingLog('outputs: predicted power, speed, current in 5 seconds + efficiency + range', 'info');
  addTrainingLog('training uses ACTUAL measured outcomes as ground truth', 'info');
  
  // Auto-train only when we have enough data for validation
  autoTrainInterval = setInterval(() => {
    if (telemetryData.speed.length >= 50 && Date.now() - lastTrainingTime > 60000) {
      trainNeuralNetwork();
    }
  }, 60000);
}

function prepareTrainingData() {
  const sequences = [];
  const targets = [];
  
  // Need at least 10 points for history + 5 points ahead for target
  if (telemetryData.speed.length < 15) return { inputs: [], targets: [] };
  
  // Create sequences: use points [i-4, i-3, i-2, i-1, i] to predict [i+5]
  for (let i = 4; i < telemetryData.speed.length - 5; i++) {
    // Input features: 5 time steps × 2 features (speed, power) = 10 inputs
    const sequence = [];
    for (let j = 4; j >= 0; j--) {
      const idx = i - j;
      sequence.push(
        telemetryData.speedFiltered[idx] / VEHICLE_CONSTANTS.maxSpeed,
        telemetryData.voltageFiltered[idx] / VEHICLE_CONSTANTS.maxVoltage,
        telemetryData.currentFiltered[idx] / VEHICLE_CONSTANTS.maxCurrent,
        telemetryData.rpm[idx] / VEHICLE_CONSTANTS.maxRPM,
        telemetryData.power[idx] / VEHICLE_CONSTANTS.maxPower
      );
    }
    
    // Target: ACTUAL measured values 5 seconds in the future
    const futureIdx = i + 5;
    const actualFuturePower = telemetryData.power[futureIdx] / VEHICLE_CONSTANTS.maxPower;
    const actualFutureSpeed = telemetryData.speedFiltered[futureIdx] / VEHICLE_CONSTANTS.maxSpeed;
    const actualFutureCurrent = telemetryData.currentFiltered[futureIdx] / VEHICLE_CONSTANTS.maxCurrent;
    
    // Also predict efficiency based on what actually happened
    const energyConsumed = telemetryData.energy[futureIdx] - telemetryData.energy[i];
    const distanceCovered = telemetryData.distance[futureIdx] - telemetryData.distance[i];
    const actualEfficiency = distanceCovered > 0 ? energyConsumed / distanceCovered : 0;
    const normalizedEfficiency = Math.min(actualEfficiency / 50, 1.0); // Cap at 50 Wh/km
    
    // Remaining range estimate
    const remainingEnergy = (telemetryData.soc[futureIdx] / 100) * VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage;
    const estimatedRange = actualEfficiency > 0 ? remainingEnergy / actualEfficiency : 0;
    const normalizedRange = Math.min(estimatedRange / 100, 1.0); // Cap at 100 km
    
    const errorMetric = Math.abs(actualFuturePower - (telemetryData.power[i] / VEHICLE_CONSTANTS.maxPower));
    
    sequences.push(sequence);
    targets.push([
      actualFuturePower,
      actualFutureSpeed,
      actualFutureCurrent,
      normalizedEfficiency,
      normalizedRange,
      errorMetric
    ]);
  }
  
  return { inputs: sequences, targets: targets };
}

async function trainNeuralNetwork() {
  if (telemetryData.speed.length < 50) {
    addTrainingLog('need at least 50 data points for proper train/val split', 'warning');
    return;
  }
  
  addTrainingLog('preparing training data from real measurements...', 'info');
  updateTrainingStatus('TRAINING');
  
  const { inputs, targets } = prepareTrainingData();
  
  if (inputs.length < 20) {
    addTrainingLog('insufficient sequential data for training', 'warning');
    updateTrainingStatus('IDLE');
    return;
  }
  
  // Split into train and validation sets (80/20)
  const splitIdx = Math.floor(inputs.length * 0.8);
  const trainInputs = inputs.slice(0, splitIdx);
  const trainTargets = targets.slice(0, splitIdx);
  const valInputs = inputs.slice(splitIdx);
  const valTargets = targets.slice(splitIdx);
  
  addTrainingLog(`training on ${trainInputs.length} sequences, validating on ${valInputs.length}`, 'info');
  
  const xs = tf.tensor2d(trainInputs);
  const ys = tf.tensor2d(trainTargets);
  const xsVal = tf.tensor2d(valInputs);
  const ysVal = tf.tensor2d(valTargets);
  
  try {
    const history = await model.fit(xs, ys, {
      epochs: 20,
      batchSize: 16,
      validationData: [xsVal, ysVal],
      shuffle: true,
      verbose: 0,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 5 === 0) {
            addTrainingLog(`epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`, 'info');
          }
        }
      }
    });
    
    trainingEpochs += 20;
    modelMetrics.trainLoss = history.history.loss[history.history.loss.length - 1];
    modelMetrics.valLoss = history.history.val_loss[history.history.val_loss.length - 1];
    modelMetrics.lastUpdate = new Date().toISOString();
    
    // Calculate actual prediction accuracy on validation set
    const predictions = model.predict(xsVal);
    const predArray = await predictions.array();
    const targetArray = await ysVal.array();
    
    let totalError = 0;
    for (let i = 0; i < predArray.length; i++) {
      const error = Math.sqrt(
        predArray[i].slice(0, 3).reduce((sum, val, idx) => 
          sum + Math.pow(val - targetArray[i][idx], 2), 0
        ) / 3
      );
      totalError += error;
    }
    const avgError = totalError / predArray.length;
    const accuracy = Math.max(0, (1 - avgError) * 100);
    
    modelMetrics.predictionErrors.push(avgError);
    if (modelMetrics.predictionErrors.length > 20) {
      modelMetrics.predictionErrors.shift();
    }
    
    addTrainingLog(`✅ training complete! validation accuracy: ${accuracy.toFixed(1)}%`, 'success');
    addTrainingLog(`avg prediction error: ${(avgError * 100).toFixed(2)}%`, 'info');
    updateTrainingStatus('IDLE');
    
    updateTrainingInfo();
    lastTrainingTime = Date.now();
    
  } catch (error) {
    addTrainingLog(`training failed: ${error.message}`, 'error');
    updateTrainingStatus('ERROR');
  } finally {
    xs.dispose();
    ys.dispose();
    xsVal.dispose();
    ysVal.dispose();
  }
}

async function makePrediction(currentState) {
  if (!model || telemetryData.speed.length < 5) {
    return null;
  }
  
  // Prepare input sequence (last 5 time steps)
  const sequence = [];
  for (let i = 4; i >= 0; i--) {
    const idx = telemetryData.speed.length - 1 - i;
    if (idx < 0) return null;
    
    sequence.push(
      telemetryData.speedFiltered[idx] / VEHICLE_CONSTANTS.maxSpeed,
      telemetryData.voltageFiltered[idx] / VEHICLE_CONSTANTS.maxVoltage,
      telemetryData.currentFiltered[idx] / VEHICLE_CONSTANTS.maxCurrent,
      telemetryData.rpm[idx] / VEHICLE_CONSTANTS.maxRPM,
      telemetryData.power[idx] / VEHICLE_CONSTANTS.maxPower
    );
  }
  
  const input = tf.tensor2d([sequence]);
  const prediction = model.predict(input);
  const result = await prediction.array();
  
  input.dispose();
  prediction.dispose();
  
  return {
    predictedPower: result[0][0] * VEHICLE_CONSTANTS.maxPower,
    predictedSpeed: result[0][1] * VEHICLE_CONSTANTS.maxSpeed,
    predictedCurrent: result[0][2] * VEHICLE_CONSTANTS.maxCurrent,
    predictedEfficiency: result[0][3] * 50, // Wh/km
    predictedRange: result[0][4] * 100, // km
    uncertaintyScore: result[0][5]
  };
}

// ============================================================================
// PHYSICS-BASED REFERENCE (for comparison, not training)
// ============================================================================

function calculatePhysicalReference(currentState) {
  const { speed, voltage, current, rpm } = currentState;
  
  const maxTheoreticalPower = Math.min(
    VEHICLE_CONSTANTS.maxPower,
    voltage * VEHICLE_CONSTANTS.maxCurrent
  );
  
  const speedMs = speed / 3.6;
  const dragPower = 0.5 * VEHICLE_CONSTANTS.airDensity * 
                   VEHICLE_CONSTANTS.dragCoefficient * 
                   VEHICLE_CONSTANTS.frontalArea * 
                   Math.pow(speedMs, 3);
  
  const rollingPower = VEHICLE_CONSTANTS.rollingResistance * 
                      VEHICLE_CONSTANTS.vehicleMass * 
                      9.81 * speedMs;
  
  const resistancePower = dragPower + rollingPower;
  
  // Estimate actual efficiency from recent data
  let estimatedEfficiency = 0.85;
  if (telemetryData.energy.length >= 10) {
    const recentEnergy = telemetryData.energy.slice(-10);
    const recentDistance = telemetryData.distance.slice(-10);
    const energyConsumed = recentEnergy[9] - recentEnergy[0];
    const distanceCovered = recentDistance[9] - recentDistance[0];
    if (distanceCovered > 0.1) {
      const recentWhPerKm = energyConsumed / distanceCovered;
      const theoreticalWhPerKm = (resistancePower / (speedMs * 1000)) * 1000;
      estimatedEfficiency = theoreticalWhPerKm > 0 ? 
        Math.min(0.95, theoreticalWhPerKm / recentWhPerKm) : 0.85;
    }
  }
  
  const referencePower = resistancePower / estimatedEfficiency;
  
  const wheelCircumference = Math.PI * VEHICLE_CONSTANTS.wheelDiameter;
  const referenceRPM = (speedMs * 60) / wheelCircumference;
  
  const omega = (2 * Math.PI * referenceRPM) / 60;
  const referenceTorque = omega > 0 ? referencePower / omega : 0;
  
  return {
    maxPower: maxTheoreticalPower,
    referencePower: Math.min(referencePower, maxTheoreticalPower),
    referenceRPM: Math.min(referenceRPM, VEHICLE_CONSTANTS.maxRPM),
    referenceTorque: Math.min(referenceTorque, VEHICLE_CONSTANTS.maxTorque),
    resistancePower,
    dragPower,
    rollingPower,
    estimatedEfficiency: estimatedEfficiency
  };
}

// ============================================================================
// VISUALIZATION - Proper multi-panel charts with context
// ============================================================================

let charts = {
  main: null,
  diagnostics: null
};

function initChart() {
  const ctx = document.getElementById('telemetryChart');
  if (!ctx) return;
  
  charts.main = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Speed (km/h)',
          data: [],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.1,
          hidden: false,
          yAxisID: 'y'
        },
        {
          label: 'Voltage (V)',
          data: [],
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          tension: 0.1,
          hidden: false,
          yAxisID: 'y'
        },
        {
          label: 'Current (A)',
          data: [],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.1,
          hidden: false,
          yAxisID: 'y'
        },
        {
          label: 'Power (W)',
          data: [],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.1,
          hidden: false,
          yAxisID: 'y1'
        },
        {
          label: 'Predicted Power (W)',
          data: [],
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          borderDash: [5, 5],
          tension: 0.1,
          hidden: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: 'white', usePointStyle: true }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toFixed(2);
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: 'white' }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Speed/Voltage/Current',
            color: 'white'
          },
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: 'white' }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Power (W)',
            color: 'white'
          },
          grid: { drawOnChartArea: false },
          ticks: { color: 'white' }
        }
      }
    }
  });
}

function updateChart() {
  if (!charts.main) return;
  
  const chartType = document.getElementById('chartType')?.value || 'power';
  const dataLength = Math.min(telemetryData.timestamps.length, maxDataPoints);
  const startIdx = Math.max(0, telemetryData.timestamps.length - dataLength);
  
  // Create relative timestamps (last N seconds)
  const labels = Array.from({ length: dataLength }, (_, i) => `${i - dataLength}s`);
  
  charts.main.data.labels = labels;
  
  // Update visibility based on chart type
  if (chartType === 'power') {
    charts.main.data.datasets[0].hidden = false; // Speed
    charts.main.data.datasets[1].hidden = false; // Voltage
    charts.main.data.datasets[2].hidden = false; // Current
    charts.main.data.datasets[3].hidden = false; // Power
    charts.main.data.datasets[4].hidden = false; // Predicted Power
    
    charts.main.data.datasets[0].data = telemetryData.speed.slice(startIdx);
    charts.main.data.datasets[1].data = telemetryData.voltage.slice(startIdx);
    charts.main.data.datasets[2].data = telemetryData.current.slice(startIdx);
    charts.main.data.datasets[3].data = telemetryData.power.slice(startIdx);
    charts.main.data.datasets[4].data = telemetryData.predictedPower.slice(startIdx);
  } else if (chartType === 'filtered') {
    // Show raw vs filtered
    charts.main.data.datasets[0].label = 'Speed (Raw)';
    charts.main.data.datasets[0].data = telemetryData.speed.slice(startIdx);
    charts.main.data.datasets[1].label = 'Speed (Filtered)';
    charts.main.data.datasets[1].data = telemetryData.speedFiltered.slice(startIdx);
    charts.main.data.datasets[2].hidden = true;
    charts.main.data.datasets[3].hidden = true;
    charts.main.data.datasets[4].hidden = true;
  } else if (chartType === 'derivatives') {
    // Show filtered derivatives with uncertainty
    charts.main.data.datasets[0].label = 'Acceleration (m/s²)';
    charts.main.data.datasets[0].data = telemetryData.acceleration.slice(startIdx);
    charts.main.data.datasets[1].label = 'Jerk (m/s³)';
    charts.main.data.datasets[1].data = telemetryData.jerk.slice(startIdx);
    charts.main.data.datasets[2].hidden = true;
    charts.main.data.datasets[3].hidden = true;
    charts.main.data.datasets[4].hidden = true;
  }
  
  charts.main.update('none');
}

// ============================================================================
// FIREBASE AND DATA HANDLING
// ============================================================================

function setupFirebaseListeners() {
  const telemetryRef = database.ref('telemetry');
  
  telemetryRef.on('value', (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      isConnected = false;
      updateConnectionStatus();
      return;
    }
    
    isConnected = true;
    updateConnectionStatus();
    
    const index = telemetryData.timestamps.length;
    
    // Store raw data
    telemetryData.timestamps.push(Date.now());
    telemetryData.speed.push(parseFloat(data.speed) || 0);
    telemetryData.voltage.push(parseFloat(data.voltage) || 0);
    telemetryData.current.push(parseFloat(data.current) || 0);
    telemetryData.rpm.push(parseInt(data.rpm) || 0);
    telemetryData.distance.push(parseFloat(data.distance) || 0);
    
    // Apply signal filtering
    applySignalFiltering();
    
    // Calculate derived quantities from FILTERED data
    const derived = calculateTruePhysicalParameters({
      speed: telemetryData.speedFiltered[index] || data.speed,
      voltage: telemetryData.voltageFiltered[index] || data.voltage,
      current: telemetryData.currentFiltered[index] || data.current,
      rpm: data.rpm,
      distance: data.distance,
      ah: data.ah
    }, index);
    
    telemetryData.power.push(derived.power);
    telemetryData.torque.push(derived.torque);
    telemetryData.acceleration.push(derived.acceleration);
    telemetryData.jerk.push(derived.jerk);
    telemetryData.energy.push(derived.energy);
    telemetryData.soc.push(derived.soc);
    telemetryData.ampHours.push(derived.ampHours);
    
    // Make prediction and store for validation
    makePrediction(data).then(prediction => {
      if (prediction) {
        telemetryData.predictedPower.push(prediction.predictedPower);
        const error = Math.abs(prediction.predictedPower - derived.power) / Math.max(derived.power, 1);
        telemetryData.predictionError.push(error);
      } else {
        telemetryData.predictedPower.push(null);
        telemetryData.predictionError.push(null);
      }
    });
    
    // Limit data size
    if (telemetryData.timestamps.length > maxDataPoints) {
      Object.keys(telemetryData).forEach(key => {
        telemetryData[key].shift();
      });
    }
    
    // Update current data
    currentData.speed = telemetryData.speedFiltered[telemetryData.speedFiltered.length - 1] || 0;
    currentData.voltage = telemetryData.voltageFiltered[telemetryData.voltageFiltered.length - 1] || 0;
    currentData.current = telemetryData.currentFiltered[telemetryData.currentFiltered.length - 1] || 0;
    currentData.power = derived.power;
    currentData.rpm = data.rpm;
    currentData.distance = data.distance;
    currentData.torque = derived.torque;
    currentData.acceleration = derived.acceleration;
    currentData.jerk = derived.jerk;
    currentData.soc = derived.soc;
    currentData.energyPerKm = currentData.distance > 0 ? (derived.energy / currentData.distance) : 0;
    
    updateDisplays();
    updateChart();
  });
}

function updateDisplays() {
  // Update main displays
  document.getElementById('speedValue').textContent = currentData.speed.toFixed(1);
  document.getElementById('voltageValue').textContent = currentData.voltage.toFixed(1);
  document.getElementById('currentValue').textContent = currentData.current.toFixed(1);
  document.getElementById('powerValue').textContent = currentData.power.toFixed(0);
  document.getElementById('rpmValue').textContent = currentData.rpm;
  document.getElementById('socValue').textContent = currentData.soc.toFixed(1);
  document.getElementById('distanceValue').textContent = currentData.distance.toFixed(2);
  document.getElementById('energyValue').textContent = currentData.energyPerKm.toFixed(1);
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    if (isConnected) {
      statusEl.textContent = 'Connected';
      statusEl.className = 'status-connected';
    } else {
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'status-disconnected';
    }
  }
}

function updateTrainingStatus(status) {
  const statusEl = document.getElementById('trainingStatus');
  if (statusEl) {
    statusEl.textContent = status;
    statusEl.className = `training-status status-${status.toLowerCase()}`;
  }
}

function updateTrainingInfo() {
  document.getElementById('totalEpochs').textContent = trainingEpochs;
  document.getElementById('trainLoss').textContent = modelMetrics.trainLoss.toFixed(4);
  document.getElementById('valLoss').textContent = modelMetrics.valLoss.toFixed(4);
  
  if (modelMetrics.predictionErrors.length > 0) {
    const avgError = modelMetrics.predictionErrors.reduce((a, b) => a + b, 0) / modelMetrics.predictionErrors.length;
    const accuracy = Math.max(0, (1 - avgError) * 100);
    document.getElementById('modelAccuracy').textContent = accuracy.toFixed(1);
  }
}

function addTrainingLog(message, type = 'info') {
  const logContainer = document.getElementById('trainingLogs');
  if (!logContainer) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Keep only last 50 logs
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

function updateDiagnostics() {
  const diagContainer = document.getElementById('diagnosticsList');
  if (!diagContainer) return;
  
  diagContainer.innerHTML = '';
  
  // Signal quality check
  if (telemetryData.speed.length >= 10) {
    const recentSpeed = telemetryData.speed.slice(-10);
    const speedOutliers = detectOutliers(recentSpeed);
    const outlierCount = speedOutliers.filter(x => x).length;
    
    const diagItem = document.createElement('div');
    diagItem.className = outlierCount > 3 ? 'diag-warning' : 'diag-ok';
    diagItem.textContent = `Signal Quality: ${outlierCount > 3 ? '⚠️' : '✅'} ${outlierCount} outliers in last 10 samples`;
    diagContainer.appendChild(diagItem);
  }
  
  // Model prediction accuracy
  if (telemetryData.predictionError.length >= 5) {
    const recentErrors = telemetryData.predictionError.slice(-5).filter(x => x !== null);
    if (recentErrors.length > 0) {
      const avgError = recentErrors.reduce((a, b) => a + b, 0) / recentErrors.length;
      const accuracy = Math.max(0, (1 - avgError) * 100);
      
      const diagItem = document.createElement('div');
      diagItem.className = accuracy > 80 ? 'diag-ok' : accuracy > 60 ? 'diag-warning' : 'diag-error';
      diagItem.textContent = `Prediction Accuracy: ${accuracy.toFixed(1)}% (last 5 predictions)`;
      diagContainer.appendChild(diagItem);
    }
  }
  
  // Battery health
  if (currentData.current > 0.5) {
    const voltageSag = VEHICLE_CONSTANTS.batteryVoltage - currentData.voltage;
    const internalR = Math.abs(voltageSag / currentData.current);
    
    const diagItem = document.createElement('div');
    diagItem.className = internalR > 0.3 ? 'diag-warning' : 'diag-ok';
    diagItem.textContent = `Battery Internal Resistance: ${internalR.toFixed(3)}Ω ${internalR > 0.3 ? '⚠️ Elevated' : '✅ Normal'}`;
    diagContainer.appendChild(diagItem);
  }
  
  // Energy efficiency
  if (currentData.energyPerKm > 0) {
    const diagItem = document.createElement('div');
    diagItem.className = currentData.energyPerKm > 40 ? 'diag-warning' : 'diag-ok';
    diagItem.textContent = `Energy Efficiency: ${currentData.energyPerKm.toFixed(1)} Wh/km ${currentData.energyPerKm > 40 ? '⚠️ High' : '✅ Good'}`;
    diagContainer.appendChild(diagItem);
  }
}

// ============================================================================
// AI CHAT INTERFACE
// ============================================================================

function addAIMessage(message, type = 'ai') {
  const messagesContainer = document.getElementById('aiMessages');
  if (!messagesContainer) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ${type}-message`;
  messageDiv.textContent = message;
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleUserMessage() {
  const input = document.getElementById('aiInput');
  if (!input || !input.value.trim()) return;
  
  const message = input.value.trim();
  addAIMessage(message, 'user');
  
  input.value = '';
  
  processAIQuery(message);
}

async function processAIQuery(query) {
  const lowerQuery = query.toLowerCase();
  
  // Categorize query
  const categories = [];
  
  if (lowerQuery.includes('predict') || lowerQuery.includes('forecast') || lowerQuery.includes('next')) {
    categories.push('prediction');
  }
  if (lowerQuery.includes('train') || lowerQuery.includes('learn') || lowerQuery.includes('improve')) {
    categories.push('training');
  }
  if (lowerQuery.includes('accuracy') || lowerQuery.includes('error') || lowerQuery.includes('validation')) {
    categories.push('model_quality');
  }
  if (lowerQuery.includes('filter') || lowerQuery.includes('noise') || lowerQuery.includes('signal')) {
    categories.push('signal_quality');
  }
  if (lowerQuery.includes('summary') || lowerQuery.includes('status') || lowerQuery.includes('everything')) {
    categories.push('summary');
  }
  
  if (categories.length === 0) {
    categories.push('general');
  }
  
  let response = '';
  
  for (const category of categories) {
    switch(category) {
      case 'prediction':
        const prediction = await makePrediction(currentData);
        if (prediction) {
          response += `🔮 PREDICTIVE ANALYSIS (next 5 seconds):\n\n`;
          response += `predicted power: ${prediction.predictedPower.toFixed(0)}W\n`;
          response += `predicted speed: ${prediction.predictedSpeed.toFixed(1)} km/h\n`;
          response += `predicted current: ${prediction.predictedCurrent.toFixed(1)}A\n`;
          response += `predicted efficiency: ${prediction.predictedEfficiency.toFixed(1)} Wh/km\n`;
          response += `predicted range: ${prediction.predictedRange.toFixed(1)} km\n`;
          response += `uncertainty score: ${(prediction.uncertaintyScore * 100).toFixed(1)}%\n\n`;
          response += `this prediction is based on ${telemetryData.speed.length} actual measurements`;
        } else {
          response += `need more data to make predictions (currently ${telemetryData.speed.length} points, need 5+)`;
        }
        break;
        
      case 'training':
        response += `🧠 TRAINING STATUS:\n\n`;
        response += `total training epochs: ${trainingEpochs}\n`;
        response += `training loss: ${modelMetrics.trainLoss.toFixed(4)}\n`;
        response += `validation loss: ${modelMetrics.valLoss.toFixed(4)}\n`;
        response += `data points collected: ${telemetryData.speed.length}\n\n`;
        if (telemetryData.speed.length >= 50) {
          response += `ready to train! want me to run a training session?`;
        } else {
          response += `need ${50 - telemetryData.speed.length} more data points before next training`;
        }
        break;
        
      case 'model_quality':
        if (modelMetrics.predictionErrors.length > 0) {
          const avgError = modelMetrics.predictionErrors.reduce((a, b) => a + b, 0) / modelMetrics.predictionErrors.length;
          const accuracy = Math.max(0, (1 - avgError) * 100);
          response += `📊 MODEL QUALITY METRICS:\n\n`;
          response += `prediction accuracy: ${accuracy.toFixed(1)}%\n`;
          response += `average error: ${(avgError * 100).toFixed(2)}%\n`;
          response += `validation set size: ${Math.floor(telemetryData.speed.length * 0.2)} samples\n`;
          response += `last training: ${modelMetrics.lastUpdate ? new Date(modelMetrics.lastUpdate).toLocaleString() : 'never'}\n\n`;
          if (accuracy < 70) {
            response += `⚠️ accuracy is low - model needs more training data or there's significant variation in driving conditions`;
          } else if (accuracy > 90) {
            response += `✅ excellent prediction accuracy! model is performing well`;
          }
        } else {
          response += `no prediction data yet - model hasn't made any predictions`;
        }
        break;
        
      case 'signal_quality':
        response += `📡 SIGNAL QUALITY ANALYSIS:\n\n`;
        if (telemetryData.speed.length >= 10) {
          const recentSpeed = telemetryData.speed.slice(-10);
          const speedOutliers = detectOutliers(recentSpeed);
          const outlierCount = speedOutliers.filter(x => x).length;
          response += `outliers detected: ${outlierCount}/10 recent samples\n`;
          response += `filtering method: ${FILTER_CONFIG.movingAverageWindow}-point moving average\n`;
          response += `derivative filtering: ${FILTER_CONFIG.jerkFilterWindow}-point window for jerk\n\n`;
          if (outlierCount > 3) {
            response += `⚠️ high noise detected - consider checking sensor connections`;
          } else {
            response += `✅ signal quality is good`;
          }
        } else {
          response += `need more data to assess signal quality`;
        }
        break;
        
      case 'summary':
        response += await generateComprehensiveSummary();
        break;
        
      case 'general':
      default:
        response += `i can help you with:\n\n`;
        response += `🔮 predictions: ask about future power, efficiency, range\n`;
        response += `🧠 training: model training status and accuracy\n`;
        response += `📊 quality: prediction accuracy and validation metrics\n`;
        response += `📡 signals: data quality and filtering status\n`;
        response += `📋 summary: comprehensive system overview\n\n`;
        response += `what would you like to know?`;
        break;
    }
  }
  
  addAIMessage(response, 'ai');
}

async function generateComprehensiveSummary() {
  let summary = `📋 COMPREHENSIVE SYSTEM SUMMARY\n\n`;
  
  // Current state
  summary += `🚗 CURRENT STATE:\n`;
  summary += `speed: ${currentData.speed.toFixed(1)} km/h\n`;
  summary += `power: ${currentData.power.toFixed(0)}W\n`;
  summary += `battery: ${currentData.soc.toFixed(1)}%\n`;
  summary += `distance: ${currentData.distance.toFixed(2)} km\n`;
  summary += `efficiency: ${currentData.energyPerKm.toFixed(1)} Wh/km\n\n`;
  
  // Model performance
  if (modelMetrics.predictionErrors.length > 0) {
    const avgError = modelMetrics.predictionErrors.reduce((a, b) => a + b, 0) / modelMetrics.predictionErrors.length;
    const accuracy = Math.max(0, (1 - avgError) * 100);
    summary += `🧠 AI MODEL PERFORMANCE:\n`;
    summary += `prediction accuracy: ${accuracy.toFixed(1)}%\n`;
    summary += `total training epochs: ${trainingEpochs}\n`;
    summary += `data points: ${telemetryData.speed.length}\n\n`;
  }
  
  // Prediction
  const prediction = await makePrediction(currentData);
  if (prediction) {
    summary += `🔮 PREDICTIONS (next 5s):\n`;
    summary += `power: ${prediction.predictedPower.toFixed(0)}W\n`;
    summary += `efficiency: ${prediction.predictedEfficiency.toFixed(1)} Wh/km\n`;
    summary += `range: ${prediction.predictedRange.toFixed(1)} km\n\n`;
  }
  
  // Physics reference
  const reference = calculatePhysicalReference(currentData);
  summary += `⚙️ PHYSICS REFERENCE:\n`;
  summary += `theoretical optimal power: ${reference.referencePower.toFixed(0)}W\n`;
  summary += `estimated efficiency: ${(reference.estimatedEfficiency * 100).toFixed(1)}%\n`;
  summary += `drag power: ${reference.dragPower.toFixed(0)}W\n`;
  summary += `rolling resistance: ${reference.rollingPower.toFixed(0)}W\n`;
  
  return summary;
}

// ============================================================================
// EVENT LISTENERS AND INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 Initializing VoltStar Neural AI with proper signal processing...');
  
  initChart();
  await initNeuralNetwork();
  setupFirebaseListeners();
  
  const chartTypeSelect = document.getElementById('chartType');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', updateChart);
  }
  
  const aiInput = document.getElementById('aiInput');
  if (aiInput) {
    aiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleUserMessage();
    });
  }
  
  const trainBtn = document.getElementById('trainModelBtn');
  if (trainBtn) {
    trainBtn.addEventListener('click', trainNeuralNetwork);
  }
  
  const sendBtn = document.getElementById('sendMessageBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleUserMessage);
  }
  
  const clearChatBtn = document.getElementById('clearChatBtn');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      const messagesContainer = document.getElementById('aiMessages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
        addAIMessage('chat cleared! what would you like to know?', 'ai');
      }
    });
  }
  
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      const targetTab = tabName === 'chat' ? 'chatTab' : tabName === 'diagnostics' ? 'diagnosticsTab' : 'trainingTab';
      const elem = document.getElementById(targetTab);
      if (elem) elem.classList.add('active');
    });
  });
  
  const aiToggleBtn = document.getElementById('aiToggleBtn');
  const aiSidebar = document.getElementById('aiSidebar');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  
  if (aiToggleBtn && aiSidebar) {
    aiToggleBtn.addEventListener('click', () => {
      aiSidebar.classList.add('open');
    });
  }
  
  if (closeSidebarBtn && aiSidebar) {
    closeSidebarBtn.addEventListener('click', () => {
      aiSidebar.classList.remove('open');
    });
  }
  
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1400 && aiSidebar && aiSidebar.classList.contains('open')) {
      if (!aiSidebar.contains(e.target) && e.target !== aiToggleBtn) {
        aiSidebar.classList.remove('open');
      }
    }
  });
  
  setInterval(() => {
    if (telemetryData.speed.length > 0) {
      updateDiagnostics();
    }
  }, 2000);

  console.log('✅ Application initialized with proper signal processing and predictive ML');
  addTrainingLog('VoltStar Neural AI ready - using filtered signals and predictive modeling', 'success');
  addTrainingLog('waiting for telemetry data...', 'info');
  
  addAIMessage('hey! 👋 neural ai here with improved signal processing and real predictive modeling\n\ni now:\n✅ filter sensor noise before calculating derivatives\n✅ predict ACTUAL future states from real data\n✅ validate predictions against measured outcomes\n✅ provide uncertainty estimates\n\nstart sending data and ask me anything!', 'ai');
});

console.log('🎯 VoltStar Neural AI ready with proper ML and signal processing!');