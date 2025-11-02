console.log('🚀 VoltStar Neural AI - Initializing with TensorFlow.js...');

// Firebase Configuration
const firebaseConfig = {
  databaseURL: "https://voltstar01-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Data Storage
let telemetryData = {
  timestamps: [],
  speed: [],
  voltage: [],
  current: [],
  power: [],
  rpm: [],
  distance: [],
  torque: [],
  acceleration: [],
  jerk: [],
  energy: [],
  soc: [],
  ampHours: []
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
let maxDataPoints = 100;
let isConnected = false;

// Physical Constants (TRUE PHYSICAL PARAMETERS)
const VEHICLE_CONSTANTS = {
  batteryCapacity: 26, // Ah
  batteryVoltage: 48, // V
  motorPower: 1000, // W
  wheelDiameter: 0.66, // m
  vehicleMass: 120, // kg
  dragCoefficient: 0.6,
  frontalArea: 0.5, // m²
  airDensity: 1.225, // kg/m³
  rollingResistance: 0.008,
  maxRPM: 500,
  maxTorque: 50, // Nm
  maxPower: 1000, // W
  maxCurrent: 30, // A
  maxVoltage: 60, // V
  maxSpeed: 50, // km/h
  internalResistanceRange: [0.05, 0.5], // Ω
  efficiencyRange: [0.7, 0.95],
  maxAcceleration: 5, // m/s²
  maxJerk: 10 // m/s³
};

// Neural Network
let model = null;
let trainingEpochs = 0;
let modelAccuracy = 0;
let predictionCount = 0;
let validationLoss = 0;
let trainingData = [];
let lastTrainingTime = 0;
let autoTrainInterval = null;

// Initialize Neural Network
async function initNeuralNetwork() {
  console.log('🧠 Initializing Neural Network...');
  
  model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [6], units: 64, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ units: 128, activation: 'relu', kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }),
      tf.layers.dropout({ rate: 0.3 }),
      tf.layers.dense({ units: 64, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 32, activation: 'relu' }),
      tf.layers.dense({ units: 5, activation: 'linear' })
    ]
  });
  
  model.compile({
    optimizer: tf.train.adam(0.0005),
    loss: 'meanSquaredError',
    metrics: ['mae', 'mse']
  });
  
  console.log('✅ Neural Network initialized');
  addTrainingLog('Neural network model created with 6-input, 5-output architecture');
  addTrainingLog('Inputs: speed, voltage, current, rpm, distance, previous_power');
  addTrainingLog('Outputs: optimal_power, optimal_rpm, optimal_torque, efficiency, energy_per_km');
  
  autoTrainInterval = setInterval(() => {
    if (telemetryData.speed.length >= 20 && Date.now() - lastTrainingTime > 30000) {
      trainNeuralNetwork();
    }
  }, 30000);
}

// Calculate TRUE physical parameters
function calculateTruePhysicalParameters(dataPoint, index) {
  const { speed, voltage, current, rpm, distance } = dataPoint;
  
  const power = voltage * current;
  const omega = (2 * Math.PI * rpm) / 60;
  const torque = omega > 0 ? power / omega : 0;
  
  let acceleration = 0;
  if (index > 0) {
    const prevSpeed = telemetryData.speed[index - 1] || speed;
    const dt = 1;
    const speedMs = speed / 3.6;
    const prevSpeedMs = prevSpeed / 3.6;
    acceleration = (speedMs - prevSpeedMs) / dt;
  }
  
  let jerk = 0;
  if (index > 1) {
    const prevAccel = telemetryData.acceleration[index - 1] || acceleration;
    const dt = 1;
    jerk = (acceleration - prevAccel) / dt;
  }
  
  const prevEnergy = index > 0 ? (telemetryData.energy[index - 1] || 0) : 0;
  const energy = prevEnergy + (power / 3600);
  
  const prevAh = index > 0 ? (telemetryData.ampHours[index - 1] || 0) : 0;
  const ampHours = prevAh + (current / 3600);
  
  const totalAh = VEHICLE_CONSTANTS.batteryCapacity;
  const soc = Math.max(0, Math.min(100, 100 - (ampHours / totalAh) * 100));
  
  return { power, torque, acceleration, jerk, energy, soc, ampHours };
}

// Validate predictions against TRUE physical parameters
function validatePhysicalParameters(prediction) {
  const validations = {
    powerValid: prediction.power >= 0 && prediction.power <= VEHICLE_CONSTANTS.maxPower,
    rpmValid: prediction.rpm >= 0 && prediction.rpm <= VEHICLE_CONSTANTS.maxRPM,
    torqueValid: prediction.torque >= 0 && prediction.torque <= VEHICLE_CONSTANTS.maxTorque,
    efficiencyValid: prediction.efficiency >= VEHICLE_CONSTANTS.efficiencyRange[0] && 
                     prediction.efficiency <= VEHICLE_CONSTANTS.efficiencyRange[1],
    energyValid: prediction.energyPerKm >= 0 && prediction.energyPerKm <= 200
  };
  
  const isValid = Object.values(validations).every(v => v);
  const validCount = Object.values(validations).filter(v => v).length;
  const accuracy = validCount / Object.values(validations).length;
  
  return { isValid, accuracy, validations };
}

// Calculate physical limits
function calculatePhysicalLimits(currentState) {
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
  const efficiency = 0.85;
  const optimalPower = resistancePower / efficiency;
  
  const wheelCircumference = Math.PI * VEHICLE_CONSTANTS.wheelDiameter;
  const optimalRPM = (speedMs * 60) / wheelCircumference;
  
  const omega = (2 * Math.PI * optimalRPM) / 60;
  const optimalTorque = omega > 0 ? optimalPower / omega : 0;
  
  return {
    maxPower: maxTheoreticalPower,
    optimalPower: Math.min(optimalPower, maxTheoreticalPower),
    optimalRPM: Math.min(optimalRPM, VEHICLE_CONSTANTS.maxRPM),
    optimalTorque: Math.min(optimalTorque, VEHICLE_CONSTANTS.maxTorque),
    resistancePower,
    dragPower,
    rollingPower,
    efficiency: efficiency
  };
}

// Train Neural Network
async function trainNeuralNetwork() {
  if (telemetryData.speed.length < 20) {
    addTrainingLog('Insufficient data for training (need at least 20 points)', 'warning');
    return;
  }
  
  addTrainingLog('Starting self-training session...', 'success');
  updateTrainingStatus('TRAINING');
  
  const inputs = [];
  const outputs = [];
  let validSamples = 0;
  
  for (let i = 2; i < telemetryData.speed.length; i++) {
    const currentState = {
      speed: telemetryData.speed[i],
      voltage: telemetryData.voltage[i],
      current: telemetryData.current[i],
      rpm: telemetryData.rpm[i]
    };
    
    const physicalLimits = calculatePhysicalLimits(currentState);
    const prevPower = telemetryData.power[i - 1] || 0;
    
    inputs.push([
      telemetryData.speed[i] / VEHICLE_CONSTANTS.maxSpeed,
      telemetryData.voltage[i] / VEHICLE_CONSTANTS.maxVoltage,
      telemetryData.current[i] / VEHICLE_CONSTANTS.maxCurrent,
      telemetryData.rpm[i] / VEHICLE_CONSTANTS.maxRPM,
      (telemetryData.distance[i] % 1000) / 1000,
      prevPower / VEHICLE_CONSTANTS.maxPower
    ]);
    
    const energyPerKm = telemetryData.distance[i] > 0 ? 
      ((telemetryData.energy[i] / telemetryData.distance[i]) * 1000) : 0;
    
    outputs.push([
      physicalLimits.optimalPower / VEHICLE_CONSTANTS.maxPower,
      physicalLimits.optimalRPM / VEHICLE_CONSTANTS.maxRPM,
      physicalLimits.optimalTorque / VEHICLE_CONSTANTS.maxTorque,
      physicalLimits.efficiency,
      Math.min(energyPerKm / 100, 1)
    ]);
    
    validSamples++;
  }
  
  if (validSamples < 10) {
    addTrainingLog('Not enough valid samples for training', 'warning');
    updateTrainingStatus('READY');
    return;
  }
  
  const xs = tf.tensor2d(inputs);
  const ys = tf.tensor2d(outputs);
  
  try {
    const history = await model.fit(xs, ys, {
      epochs: 30,
      batchSize: Math.min(16, Math.floor(validSamples / 4)),
      validationSplit: 0.2,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          trainingEpochs++;
          validationLoss = logs.val_loss || 0;
          modelAccuracy = Math.max(0, Math.min(100, (1 - Math.min(logs.val_loss, 1)) * 100));
          
          document.getElementById('trainingEpochs').textContent = trainingEpochs;
          document.getElementById('validationLoss').textContent = validationLoss.toFixed(4);
          document.getElementById('modelAccuracy').textContent = modelAccuracy.toFixed(1) + '%';
          
          if (epoch % 10 === 0 || epoch === 29) {
            addTrainingLog(`Epoch ${epoch + 1}/30 - Loss: ${logs.loss.toFixed(4)}, Val Loss: ${logs.val_loss.toFixed(4)}, MAE: ${logs.mae.toFixed(4)}`);
          }
        }
      }
    });
    
    lastTrainingTime = Date.now();
    addTrainingLog('✅ Self-training completed successfully!', 'success');
    addTrainingLog(`Model accuracy: ${modelAccuracy.toFixed(1)}% | Trained on ${validSamples} samples`, 'success');
    addTrainingLog('Model aligned with TRUE physical parameters', 'success');
    updateTrainingStatus('READY');
    
  } catch (error) {
    console.error('Training error:', error);
    addTrainingLog('Training failed: ' + error.message, 'error');
    updateTrainingStatus('ERROR');
  } finally {
    xs.dispose();
    ys.dispose();
  }
}

// Make prediction
async function makePrediction(speed, voltage, current, rpm, distance, prevPower) {
  if (!model) return null;
  
  const input = tf.tensor2d([[
    speed / VEHICLE_CONSTANTS.maxSpeed,
    voltage / VEHICLE_CONSTANTS.maxVoltage,
    current / VEHICLE_CONSTANTS.maxCurrent,
    rpm / VEHICLE_CONSTANTS.maxRPM,
    (distance % 1000) / 1000,
    prevPower / VEHICLE_CONSTANTS.maxPower
  ]]);
  
  const prediction = model.predict(input);
  const values = await prediction.data();
  
  input.dispose();
  prediction.dispose();
  
  predictionCount++;
  document.getElementById('predictionCount').textContent = predictionCount;
  
  const denormalizedPrediction = {
    power: values[0] * VEHICLE_CONSTANTS.maxPower,
    rpm: values[1] * VEHICLE_CONSTANTS.maxRPM,
    torque: values[2] * VEHICLE_CONSTANTS.maxTorque,
    efficiency: values[3],
    energyPerKm: values[4] * 100
  };
  
  const validation = validatePhysicalParameters(denormalizedPrediction);
  
  return { prediction: denormalizedPrediction, validation };
}

// Generate AI suggestions
async function generateNeuralSuggestions() {
  if (!model || telemetryData.speed.length < 5) {
    return 'Collecting data for neural analysis... Need at least 5 data points.';
  }
  
  const lastIdx = telemetryData.speed.length - 1;
  const prevIdx = Math.max(0, lastIdx - 1);
  
  const result = await makePrediction(
    telemetryData.speed[lastIdx],
    telemetryData.voltage[lastIdx],
    telemetryData.current[lastIdx],
    telemetryData.rpm[lastIdx],
    telemetryData.distance[lastIdx],
    telemetryData.power[prevIdx]
  );
  
  if (!result) return 'Neural network prediction unavailable.';
  
  const { prediction, validation } = result;
  const physicalLimits = calculatePhysicalLimits({
    speed: telemetryData.speed[lastIdx],
    voltage: telemetryData.voltage[lastIdx],
    current: telemetryData.current[lastIdx],
    rpm: telemetryData.rpm[lastIdx]
  });
  
  let suggestions = `🧠 Neural AI Analysis (Self-Trained Model)\n\n`;
  suggestions += `📊 PREDICTIONS:\n`;
  suggestions += `├─ Optimal Power: ${prediction.power.toFixed(0)}W (Current: ${currentData.power.toFixed(0)}W)\n`;
  suggestions += `├─ Optimal RPM: ${prediction.rpm.toFixed(0)} (Current: ${currentData.rpm})\n`;
  suggestions += `├─ Optimal Torque: ${prediction.torque.toFixed(2)} Nm (Current: ${currentData.torque.toFixed(2)} Nm)\n`;
  suggestions += `├─ Efficiency: ${(prediction.efficiency * 100).toFixed(1)}%\n`;
  suggestions += `└─ Energy/km: ${prediction.energyPerKm.toFixed(1)} Wh/km\n\n`;
  
  suggestions += `✅ PHYSICAL VALIDATION:\n`;
  suggestions += `├─ Overall: ${validation.isValid ? '✅ VALID' : '⚠️ REVIEW NEEDED'}\n`;
  suggestions += `├─ Accuracy: ${(validation.accuracy * 100).toFixed(1)}%\n`;
  suggestions += `├─ Power Check: ${validation.validations.powerValid ? '✅' : '❌'}\n`;
  suggestions += `├─ RPM Check: ${validation.validations.rpmValid ? '✅' : '❌'}\n`;
  suggestions += `├─ Torque Check: ${validation.validations.torqueValid ? '✅' : '❌'}\n`;
  suggestions += `└─ Energy Check: ${validation.validations.energyValid ? '✅' : '❌'}\n\n`;
  
  suggestions += `🎯 ACTIONABLE SUGGESTIONS:\n`;
  
  const powerDiff = prediction.power - currentData.power;
  if (Math.abs(powerDiff) > 50) {
    if (powerDiff > 0) {
      suggestions += `💡 Increase power by ${powerDiff.toFixed(0)}W for optimal performance\n`;
    } else {
      suggestions += `💡 Reduce power by ${Math.abs(powerDiff).toFixed(0)}W to improve efficiency\n`;
    }
  } else {
    suggestions += `✅ Power output is optimal\n`;
  }
  
  const rpmDiff = prediction.rpm - currentData.rpm;
  if (Math.abs(rpmDiff) > 20) {
    suggestions += `💡 Adjust RPM to ${prediction.rpm.toFixed(0)} (${rpmDiff > 0 ? 'increase' : 'decrease'} by ${Math.abs(rpmDiff).toFixed(0)})\n`;
  }
  
  if (prediction.efficiency < 0.8) {
    suggestions += `⚠️ Low efficiency detected. Check:\n`;
    suggestions += `   - Aerodynamic drag (${physicalLimits.dragPower.toFixed(0)}W)\n`;
    suggestions += `   - Rolling resistance (${physicalLimits.rollingPower.toFixed(0)}W)\n`;
  }
  
  if (currentData.energyPerKm > prediction.energyPerKm * 1.2) {
    suggestions += `⚠️ High energy consumption! Predicted: ${prediction.energyPerKm.toFixed(1)} Wh/km\n`;
  }
  
  return suggestions;
}

// Initialize Chart
let telemetryChart;

function initChart() {
  const ctx = document.getElementById('telemetryChart').getContext('2d');
  telemetryChart = new Chart(ctx, {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: '#e2e8f0', font: { size: 11, weight: 600 }, padding: 15, usePointStyle: true }
        },
        tooltip: {
          backgroundColor: 'rgba(21, 25, 50, 0.95)',
          titleColor: '#00d9ff',
          bodyColor: '#e2e8f0',
          borderColor: '#2d3454',
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        x: {
          display: true,
          grid: { color: 'rgba(45, 52, 84, 0.3)', drawBorder: false },
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkipPadding: 20, font: { size: 10 } }
        },
        y: {
          display: true,
          grid: { color: 'rgba(45, 52, 84, 0.3)', drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      animation: { duration: 300 }
    }
  });
}

// Update Chart
function updateChart() {
  const chartType = document.getElementById('chartType').value;
  
  let datasets = [];
  let labels = [];
  
  telemetryChart.options.scales.x.type = 'linear';
  telemetryChart.options.scales.y.type = 'linear';
  
  switch(chartType) {
    case 'power-rpm':
      datasets = [{
        label: 'Power vs RPM',
        data: telemetryData.rpm.map((rpm, i) => ({ x: rpm, y: telemetryData.power[i] })),
        borderColor: '#ffaa00',
        backgroundColor: 'rgba(255, 170, 0, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        showLine: true
      }];
      telemetryChart.options.scales.x.title = { display: true, text: 'RPM', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Power (W)', color: '#94a3b8' };
      break;
      
    case 'torque-rpm':
      datasets = [{
        label: 'Torque vs RPM',
        data: telemetryData.rpm.map((rpm, i) => ({ x: rpm, y: telemetryData.torque[i] })),
        borderColor: '#ff006e',
        backgroundColor: 'rgba(255, 0, 110, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        showLine: true
      }];
      telemetryChart.options.scales.x.title = { display: true, text: 'RPM', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Torque (Nm)', color: '#94a3b8' };
      break;
      
    case 'acceleration':
      telemetryChart.options.scales.x.type = 'category';
      labels = telemetryData.timestamps;
      datasets = [
        {
          label: 'Acceleration (m/s²)',
          data: telemetryData.acceleration,
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          tension: 0.4
        },
        {
          label: 'Jerk (m/s³)',
          data: telemetryData.jerk,
          borderColor: '#ff3366',
          backgroundColor: 'rgba(255, 51, 102, 0.1)',
          borderWidth: 2,
          pointRadius: 1,
          tension: 0.4
        }
      ];
      telemetryChart.options.scales.x.title = { display: true, text: 'Time', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Acceleration / Jerk', color: '#94a3b8' };
      break;
      
    case 'energy-distance':
      datasets = [{
        label: 'Energy vs Distance',
        data: telemetryData.distance.map((d, i) => ({ x: d, y: telemetryData.energy[i] })),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        showLine: true
      }];
      telemetryChart.options.scales.x.title = { display: true, text: 'Distance (km)', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Energy (Wh)', color: '#94a3b8' };
      break;
      
    case 'soc-distance':
      datasets = [{
        label: 'SOC vs Distance',
        data: telemetryData.distance.map((d, i) => ({ x: d, y: telemetryData.soc[i] })),
        borderColor: '#00d9ff',
        backgroundColor: 'rgba(0, 217, 255, 0.1)',
        borderWidth: 2,
        pointRadius: 2,
        showLine: true
      }];
      telemetryChart.options.scales.x.title = { display: true, text: 'Distance (km)', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'SOC (%)', color: '#94a3b8' };
      break;
      
    case 'voltage-current':
      datasets = [{
        label: 'Voltage vs Current',
        data: telemetryData.current.map((c, i) => ({ x: c, y: telemetryData.voltage[i] })),
        borderColor: '#ff3366',
        backgroundColor: 'rgba(255, 51, 102, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        showLine: false
      }];
      
      if (telemetryData.current.length > 5) {
        const validPoints = telemetryData.current
          .map((c, i) => ({ x: c, y: telemetryData.voltage[i] }))
          .filter(p => p.x > 0.5);
        
        if (validPoints.length > 3) {
          const sumX = validPoints.reduce((a, p) => a + p.x, 0);
          const sumY = validPoints.reduce((a, p) => a + p.y, 0);
          const sumXY = validPoints.reduce((a, p) => a + p.x * p.y, 0);
          const sumX2 = validPoints.reduce((a, p) => a + p.x * p.x, 0);
          const n = validPoints.length;
          
          const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
          const intercept = (sumY - slope * sumX) / n;
          
          const minX = Math.min(...validPoints.map(p => p.x));
          const maxX = Math.max(...validPoints.map(p => p.x));
          
          datasets.push({
            label: `Trend (R ≈ ${Math.abs(slope).toFixed(3)}Ω)`,
            data: [
              { x: minX, y: slope * minX + intercept },
              { x: maxX, y: slope * maxX + intercept }
            ],
            borderColor: '#ffaa00',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            showLine: true
          });
        }
      }
      
      telemetryChart.options.scales.x.title = { display: true, text: 'Current (A)', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Voltage (V)', color: '#94a3b8' };
      break;
      
    case 'speed-distance':
      datasets = [{
        label: 'Speed vs Distance',
        data: telemetryData.distance.map((d, i) => ({ x: d, y: telemetryData.speed[i] })),
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        borderWidth: 2,
        pointRadius: 1,
        showLine: true,
        tension: 0.4
      }];
      telemetryChart.options.scales.x.title = { display: true, text: 'Distance (km)', color: '#94a3b8' };
      telemetryChart.options.scales.y.title = { display: true, text: 'Speed (km/h)', color: '#94a3b8' };
      break;
      
    default: // telemetry
      telemetryChart.options.scales.x.type = 'category';
      labels = telemetryData.timestamps;
      if (document.getElementById('chartSpeed').checked) {
        datasets.push({
          label: 'Speed (km/h)',
          data: telemetryData.speed,
          borderColor: '#00ff88',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        });
      }
      if (document.getElementById('chartVoltage').checked) {
        datasets.push({
          label: 'Voltage (V)',
          data: telemetryData.voltage,
          borderColor: '#00d9ff',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        });
      }
      if (document.getElementById('chartCurrent').checked) {
        datasets.push({
          label: 'Current (A)',
          data: telemetryData.current,
          borderColor: '#ff3366',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        });
      }
      if (document.getElementById('chartPower').checked) {
        datasets.push({
          label: 'Power (W)',
          data: telemetryData.power,
          borderColor: '#ffaa00',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        });
      }
      telemetryChart.options.scales.x.title = { display: false };
      telemetryChart.options.scales.y.title = { display: false };
  }
  
  telemetryChart.data.labels = labels;
  telemetryChart.data.datasets = datasets;
  telemetryChart.update('none');
}

// Firebase Listeners
function setupFirebaseListeners() {
  console.log('🔗 Setting up Firebase listener...');
  
  const readingsRef = database.ref('/cycle_readings');
  
  readingsRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.warn('⚠️ No data found');
      updateConnectionStatus(false);
      return;
    }
    
    const readings = snapshot.val();
    const readingKeys = Object.keys(readings).sort();
    
    console.log('📊 Processing', readingKeys.length, 'data points');
    
    for (const key in telemetryData) {
      telemetryData[key] = [];
    }
    
    readingKeys.forEach((key, index) => {
      const reading = readings[key];
      
      const dataPoint = {
        speed: parseFloat(reading.speed) || 0,
        voltage: parseFloat(reading.voltage) || 0,
        current: parseFloat(reading.current) || 0,
        rpm: parseInt(reading.rpm) || 0,
        distance: parseFloat(reading.distance) || 0
      };
      
      const derived = calculateTruePhysicalParameters(dataPoint, index);
      
      let timestamp;
      if (reading.timestamp) {
        const date = new Date(reading.timestamp);
        timestamp = date.toLocaleTimeString();
      } else {
        timestamp = `${index + 1}`;
      }
      
      telemetryData.timestamps.push(timestamp);
      telemetryData.speed.push(dataPoint.speed);
      telemetryData.voltage.push(dataPoint.voltage);
      telemetryData.current.push(dataPoint.current);
      telemetryData.rpm.push(dataPoint.rpm);
      telemetryData.distance.push(dataPoint.distance);
      telemetryData.power.push(derived.power);
      telemetryData.torque.push(derived.torque);
      telemetryData.acceleration.push(derived.acceleration);
      telemetryData.jerk.push(derived.jerk);
      telemetryData.energy.push(derived.energy);
      telemetryData.soc.push(derived.soc);
      telemetryData.ampHours.push(derived.ampHours);
    });
    
    if (telemetryData.timestamps.length > maxDataPoints) {
      const excess = telemetryData.timestamps.length - maxDataPoints;
      for (const key in telemetryData) {
        telemetryData[key].splice(0, excess);
      }
    }
    
    const lastIdx = telemetryData.speed.length - 1;
    if (lastIdx >= 0) {
      currentData = {
        speed: telemetryData.speed[lastIdx],
        voltage: telemetryData.voltage[lastIdx],
        current: telemetryData.current[lastIdx],
        power: telemetryData.power[lastIdx],
        rpm: telemetryData.rpm[lastIdx],
        distance: telemetryData.distance[lastIdx],
        torque: telemetryData.torque[lastIdx],
        acceleration: telemetryData.acceleration[lastIdx],
        jerk: telemetryData.jerk[lastIdx],
        soc: telemetryData.soc[lastIdx],
        energyPerKm: telemetryData.distance[lastIdx] > 0 ? 
          (telemetryData.energy[lastIdx] / telemetryData.distance[lastIdx]) * 1000 : 0
      };
    }
    
    isConnected = true;
    updateConnectionStatus(true);
    updateMetricsDisplay();
    updateChart();
    updateDiagnostics();
    
    console.log('✅ Loaded', telemetryData.timestamps.length, 'points');
    
  }, (error) => {
    console.error('❌ Firebase error:', error);
    updateConnectionStatus(false);
  });
}

function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connectionStatus');
  const timestamp = document.getElementById('lastUpdateTimestamp');
  
  if (connected) {
    statusEl.className = 'status-indicator status-connected';
    statusEl.innerHTML = '<span>●</span><span>CONNECTED</span>';
    timestamp.textContent = new Date().toLocaleTimeString();
  } else {
    statusEl.className = 'status-indicator status-waiting pulse';
    statusEl.innerHTML = '<span>●</span><span>WAITING...</span>';
  }
}

function updateTrainingStatus(status) {
  const elem = document.getElementById('trainingStatus');
  if (elem) elem.textContent = status;
}

function updateMetricsDisplay() {
  document.getElementById('speedValue').textContent = currentData.speed.toFixed(1);
  document.getElementById('voltageValue').textContent = currentData.voltage.toFixed(1);
  document.getElementById('currentValue').textContent = currentData.current.toFixed(1);
  document.getElementById('powerValue').textContent = currentData.power.toFixed(0);
  document.getElementById('rpmValue').textContent = currentData.rpm;
  document.getElementById('torqueValue').textContent = currentData.torque.toFixed(1);
  document.getElementById('socValue').textContent = currentData.soc.toFixed(0);
  
  const accelElem = document.getElementById('accelValue');
  if (accelElem) accelElem.textContent = currentData.acceleration.toFixed(2);
  
  const energyElem = document.getElementById('energyPerKmValue');
  if (energyElem) energyElem.textContent = currentData.energyPerKm.toFixed(1);
}

function updateDiagnostics() {
  const diagnosticsContainer = document.getElementById('aiDiagnostics');
  if (!diagnosticsContainer) return;
  
  diagnosticsContainer.innerHTML = '';
  
  const physicalLimits = calculatePhysicalLimits({
    speed: currentData.speed,
    voltage: currentData.voltage,
    current: currentData.current,
    rpm: currentData.rpm
  });
  
  // Power vs RPM Analysis
  if (currentData.rpm > 0 && currentData.power > 0) {
    const powerUtilization = (currentData.power / VEHICLE_CONSTANTS.maxPower) * 100;
    const optimalPowerDiff = currentData.power - physicalLimits.optimalPower;
    let status, message, suggestion;
    
    if (powerUtilization < 40) {
      status = 'good';
      message = 'Motor underutilized. Comfortable cruising mode.';
      suggestion = `Power reserves: ${(VEHICLE_CONSTANTS.maxPower - currentData.power).toFixed(0)}W available.`;
    } else if (powerUtilization < 70) {
      status = 'good';
      message = 'Motor operating in optimal efficiency range.';
      suggestion = 'Good balance between power and thermal management.';
    } else if (powerUtilization < 90) {
      status = 'moderate';
      message = 'High power output. Approaching thermal limits.';
      suggestion = '⚠️ Monitor motor temperature.';
    } else {
      status = 'critical';
      message = 'Peak power! Motor at maximum capacity.';
      suggestion = '🚨 Reduce throttle to prevent damage.';
    }
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Power Curve (P vs RPM)</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${powerUtilization.toFixed(1)}% | ${currentData.power.toFixed(0)}W @ ${currentData.rpm} RPM</div>
        <div class="diagnostic-message">${message} Optimal: ${physicalLimits.optimalPower.toFixed(0)}W</div>
        <div class="diagnostic-suggestion">💡 ${suggestion}</div>
      </div>
    `;
  }
  
  // Torque vs RPM
  if (currentData.torque > 0 && currentData.rpm > 0) {
    const torquePercent = (currentData.torque / VEHICLE_CONSTANTS.maxTorque) * 100;
    let status = torquePercent < 60 ? 'good' : torquePercent < 85 ? 'moderate' : 'critical';
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Torque Curve (T vs RPM)</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${currentData.torque.toFixed(2)} Nm @ ${currentData.rpm} RPM</div>
        <div class="diagnostic-message">T = P / ω where ω = 2π×RPM/60. Optimal: ${physicalLimits.optimalTorque.toFixed(2)} Nm</div>
        <div class="diagnostic-suggestion">💡 ${torquePercent < 70 ? 'Safe operating range.' : '⚠️ High torque - monitor temperature.'}</div>
      </div>
    `;
  }
  
  // Acceleration & Jerk
  if (Math.abs(currentData.acceleration) > 0.05) {
    const accelPercent = (Math.abs(currentData.acceleration) / VEHICLE_CONSTANTS.maxAcceleration) * 100;
    let status = accelPercent < 50 ? 'good' : accelPercent < 80 ? 'moderate' : 'critical';
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Acceleration & Jerk</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">a = ${currentData.acceleration.toFixed(2)} m/s² | j = ${currentData.jerk.toFixed(2)} m/s³</div>
        <div class="diagnostic-message">a = dS/dt, j = d²S/dt². Smooth profiles improve traction.</div>
        <div class="diagnostic-suggestion">💡 ${Math.abs(currentData.jerk) < 5 ? 'Smooth acceleration.' : '⚠️ High jerk - reduce throttle changes.'}</div>
      </div>
    `;
  }
  
  // Energy per Distance
  if (currentData.distance > 0.1 && currentData.energyPerKm > 0) {
    let status = 'good';
    if (currentData.energyPerKm > 30) status = 'moderate';
    if (currentData.energyPerKm > 50) status = 'critical';
    
    const estimatedRange = (VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage) / currentData.energyPerKm;
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Energy per Distance</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${currentData.energyPerKm.toFixed(1)} Wh/km</div>
        <div class="diagnostic-message">Estimated Range: ${estimatedRange.toFixed(1)} km at current consumption</div>
        <div class="diagnostic-suggestion">💡 ${status === 'good' ? 'Excellent efficiency!' : '⚠️ High consumption - optimize driving.'}</div>
      </div>
    `;
  }
  
  // Aero & Rolling Resistance
  if (currentData.speed > 5) {
    const dragPercent = (physicalLimits.dragPower / physicalLimits.resistancePower) * 100;
    let status = dragPercent < 70 ? 'good' : dragPercent < 85 ? 'moderate' : 'critical';
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Aero & Rolling Resistance</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${physicalLimits.resistancePower.toFixed(0)}W @ ${currentData.speed.toFixed(1)} km/h</div>
        <div class="diagnostic-message">Drag: ${physicalLimits.dragPower.toFixed(0)}W | Rolling: ${physicalLimits.rollingPower.toFixed(0)}W</div>
        <div class="diagnostic-suggestion">💡 ${dragPercent < 60 ? 'Good aero efficiency.' : '⚠️ High drag - reduce speed or tuck in.'}</div>
      </div>
    `;
  }
  
  // SOC Analysis
  const remainingCapacity = (currentData.soc / 100) * VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage;
  let socStatus = currentData.soc > 80 ? 'excellent' : currentData.soc > 50 ? 'good' : currentData.soc > 20 ? 'moderate' : 'critical';
  
  diagnosticsContainer.innerHTML += `
    <div class="diagnostic-item">
      <div class="diagnostic-header">
        <span class="diagnostic-label">State of Charge</span>
        <span class="diagnostic-status status-${socStatus}">${socStatus.toUpperCase()}</span>
      </div>
      <div class="diagnostic-value">${currentData.soc.toFixed(1)}% | ${remainingCapacity.toFixed(0)} Wh</div>
      <div class="diagnostic-message">Distance: ${currentData.distance.toFixed(2)} km traveled</div>
      <div class="diagnostic-suggestion">💡 ${socStatus === 'critical' ? '🚨 Charge immediately!' : socStatus === 'moderate' ? '⚠️ Plan charging soon.' : 'Battery healthy.'}</div>
    </div>
  `;
  
  // Voltage Sag & Internal Resistance
  if (currentData.current > 0.5) {
    const expectedVoltage = VEHICLE_CONSTANTS.batteryVoltage;
    const voltageSag = expectedVoltage - currentData.voltage;
    const internalResistance = Math.abs(voltageSag / currentData.current);
    
    let status = internalResistance < 0.15 ? 'excellent' : internalResistance < 0.25 ? 'good' : internalResistance < 0.4 ? 'moderate' : 'critical';
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Voltage Sag & Internal R</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">R = ${internalResistance.toFixed(3)} Ω</div>
        <div class="diagnostic-message">Voltage sag: ${Math.abs(voltageSag).toFixed(2)}V @ ${currentData.current.toFixed(1)}A</div>
        <div class="diagnostic-suggestion">💡 ${status === 'excellent' || status === 'good' ? 'Battery health good.' : '⚠️ Elevated resistance - check cells.'}</div>
      </div>
    `;
  }
}

function addTrainingLog(message, type = 'info') {
  const logContainer = document.getElementById('trainingLog');
  if (!logContainer) return;
  
  const logEntry = document.createElement('div');
  logEntry.className = `training-log-entry training-log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
  
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
  
  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.firstChild);
  }
}

function addAIMessage(content, type = 'ai') {
  const messagesContainer = document.getElementById('aiMessages');
  if (!messagesContainer) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ${type}`;
  
  const typeLabel = type === 'user' ? 'YOU' : 'NEURAL AI';
  const typeColor = type === 'user' ? 'color-secondary' : 'color-primary';
  
  messageDiv.innerHTML = `
    <div class="ai-message-type ${typeColor}">${typeLabel}</div>
    <div class="ai-message-content">${content}</div>
  `;
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function handleUserMessage() {
  const input = document.getElementById('aiInput');
  if (!input) return;
  
  const message = input.value.trim();
  if (!message) return;
  
  addAIMessage(message, 'user');
  input.value = '';
  
  const lowerMsg = message.toLowerCase();
  let response = '';
  
  if (lowerMsg.includes('train') || lowerMsg.includes('learn')) {
    response = 'Initiating neural network training...\n\n';
    await trainNeuralNetwork();
    response += await generateNeuralSuggestions();
  } else if (lowerMsg.includes('suggest') || lowerMsg.includes('recommend')) {
    response = await generateNeuralSuggestions();
  } else if (lowerMsg.includes('power') || lowerMsg.includes('torque')) {
    response = await generateNeuralSuggestions();
  } else if (lowerMsg.includes('efficiency') || lowerMsg.includes('energy')) {
    response = `🔋 Energy Analysis:\n\n`;
    response += `Energy/km: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
    response += `SOC: ${currentData.soc.toFixed(1)}%\n`;
    response += `Distance: ${currentData.distance.toFixed(2)} km\n\n`;
    const limits = calculatePhysicalLimits(currentData);
    response += `Drag: ${limits.dragPower.toFixed(0)}W\n`;
    response += `Rolling: ${limits.rollingPower.toFixed(0)}W\n\n`;
    response += await generateNeuralSuggestions();
  } else if (lowerMsg.includes('status') || lowerMsg.includes('current')) {
    response = `📊 Current Status:\n\n`;
    response += `Speed: ${currentData.speed.toFixed(1)} km/h\n`;
    response += `Power: ${currentData.power.toFixed(0)}W\n`;
    response += `Torque: ${currentData.torque.toFixed(2)} Nm\n`;
    response += `RPM: ${currentData.rpm}\n`;
    response += `SOC: ${currentData.soc.toFixed(1)}%\n`;
  } else {
    response = `🧠 VoltStar Neural AI\n\n`;
    response += `Commands:\n`;
    response += `• "train" - Start training\n`;
    response += `• "suggest" - Get suggestions\n`;
    response += `• "efficiency" - Energy analysis\n`;
    response += `• "status" - Current status\n\n`;
    response += `Self-training neural network with physical parameter validation.`;
  }
  
  addAIMessage(response, 'ai');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 Initializing VoltStar Neural AI...');
  
  initChart();
  await initNeuralNetwork();
  setupFirebaseListeners();
  
  const chartTypeSelect = document.getElementById('chartType');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', updateChart);
  }
  
  ['chartSpeed', 'chartVoltage', 'chartCurrent', 'chartPower'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', updateChart);
    }
  });
  
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
  
  console.log('✅ Application initialized');
  addTrainingLog('VoltStar Neural AI ready', 'success');
  addTrainingLog('Waiting for telemetry data...', 'info');
});

console.log('🎯 VoltStar Neural AI Ready!');