// VoltStar Neural AI - FULLY CORRECTED VERSION
// Fixes: Firebase path alignment, horizontal scrollable graphs with auto-scroll
console.log('🚀 VoltStar Neural AI - Initializing with Android app integration...');

// Firebase config
const firebaseConfig = {
  databaseURL: "https://voltstar01-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Telemetry data storage - stores ALL data from Firebase
let telemetryData = {
  timestamps: [],          // Real timestamps from Android app
  // Raw measurements from Cycle Analyst
  speed: [],
  voltage: [],
  current: [],
  power: [],               // Calculated V*A from Android
  rpm: [],
  distance: [],
  ah: [],                  // Amp-hours from Cycle Analyst
  temperature: [],         // Temperature (degree)
  // Additional fields from Android
  torque: [],
  throttleIn: [],
  throttleOut: [],
  flags: [],
  activePreset: [],
  voltageLimiting: [],
  currentLimiting: [],
  speedLimiting: [],
  brakeActive: [],
  throttleFault: [],
  // Derived quantities
  soc: [],
  energyPerKm: [],
  acceleration: [],
  jerk: []
};

let currentData = {
  speed: 0,
  voltage: 0,
  current: 0,
  power: 0,
  rpm: 0,
  distance: 0,
  ah: 0,
  temperature: 0,
  torque: 0,
  soc: 100,
  energyPerKm: 0,
  acceleration: 0,
  flags: 0,
  activePreset: 0,
  voltageLimiting: false,
  currentLimiting: false,
  speedLimiting: false,
  brakeActive: false,
  throttleFault: false
};

let chatHistory = [];
let maxDataPoints = 1000;  // Store up to 1000 readings
let isConnected = false;
let lastUpdateTimestamp = 0;

// Vehicle physical constants
const VEHICLE_CONSTANTS = {
  batteryCapacity: 26,       // Ah
  batteryVoltage: 48,        // V
  motorPower: 1000,          // W
  wheelDiameter: 0.66,       // m
  vehicleMass: 120,          // kg
  dragCoefficient: 0.6,
  frontalArea: 0.5,          // m²
  airDensity: 1.225,         // kg/m³
  rollingResistance: 0.008,
  maxRPM: 500,
  maxTorque: 50,
  maxPower: 1000,
  maxCurrent: 30,
  maxVoltage: 60,
  maxSpeed: 60
};

// Neural network state
let model = null;
let trainingEpochs = 0;
let modelMetrics = {
  trainLoss: 0,
  valLoss: 0,
  accuracy: 0,
  lastUpdate: null
};
let lastTrainingTime = 0;

// ============================================================================
// SIGNAL PROCESSING
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

// ============================================================================
// PHYSICAL CALCULATIONS
// ============================================================================

function calculateDerivedMetrics() {
  if (telemetryData.timestamps.length < 2) return;
  
  const len = telemetryData.timestamps.length;
  
  // Calculate SOC from amp-hours
  for (let i = 0; i < len; i++) {
    const ahUsed = telemetryData.ah[i] || 0;
    const soc = Math.max(0, Math.min(100, 100 - (ahUsed / VEHICLE_CONSTANTS.batteryCapacity) * 100));
    telemetryData.soc[i] = soc;
  }
  
  // Calculate energy efficiency (Wh/km)
  for (let i = 0; i < len; i++) {
    if (telemetryData.distance[i] > 0) {
      // Energy = integral of power over time ≈ sum of (V * A) for each reading
      // For simplicity, use ah * voltage as accumulated energy
      const energyWh = telemetryData.ah[i] * VEHICLE_CONSTANTS.batteryVoltage;
      const whPerKm = energyWh / telemetryData.distance[i];
      telemetryData.energyPerKm[i] = whPerKm;
    } else {
      telemetryData.energyPerKm[i] = 0;
    }
  }
  
  // Calculate acceleration (using filtered speed)
  const speedFiltered = movingAverage(telemetryData.speed, 5);
  for (let i = 1; i < len; i++) {
    const dt = (telemetryData.timestamps[i] - telemetryData.timestamps[i-1]) / 1000;  // seconds
    if (dt > 0) {
      const dv = (speedFiltered[i] - speedFiltered[i-1]) / 3.6;  // Convert km/h to m/s
      const accel = dv / dt;  // m/s²
      telemetryData.acceleration[i] = accel;
    } else {
      telemetryData.acceleration[i] = 0;
    }
  }
  if (len > 0) telemetryData.acceleration[0] = 0;
  
  // Calculate jerk
  const accelFiltered = movingAverage(telemetryData.acceleration, 3);
  for (let i = 1; i < len; i++) {
    const dt = (telemetryData.timestamps[i] - telemetryData.timestamps[i-1]) / 1000;
    if (dt > 0) {
      const da = accelFiltered[i] - accelFiltered[i-1];
      const jerk = da / dt;  // m/s³
      telemetryData.jerk[i] = jerk;
    } else {
      telemetryData.jerk[i] = 0;
    }
  }
  if (len > 0) telemetryData.jerk[0] = 0;
}

// ============================================================================
// NEURAL NETWORK
// ============================================================================

async function initNeuralNetwork() {
  console.log('🧠 Initializing Neural Network...');
  
  model = tf.sequential({
    layers: [
      tf.layers.dense({ inputShape: [5], units: 32, activation: 'relu' }),
      tf.layers.dropout({ rate: 0.2 }),
      tf.layers.dense({ units: 16, activation: 'relu' }),
      tf.layers.dense({ units: 3, activation: 'linear' })  // Predict: power, speed, current
    ]
  });
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'meanSquaredError',
    metrics: ['mae']
  });
  
  console.log('✅ Neural Network initialized');
  addTrainingLog('Model initialized - ready for training', 'success');
}

function prepareTrainingData() {
  const inputs = [];
  const targets = [];
  
  if (telemetryData.timestamps.length < 10) return { inputs, targets };
  
  // Use sliding window to predict next values
  for (let i = 5; i < telemetryData.timestamps.length - 1; i++) {
    const input = [
      telemetryData.speed[i] / 60,
      telemetryData.voltage[i] / 60,
      telemetryData.current[i] / 30,
      telemetryData.rpm[i] / 500,
      telemetryData.distance[i] / 100
    ];
    
    const target = [
      telemetryData.power[i+1] / 1000,
      telemetryData.speed[i+1] / 60,
      telemetryData.current[i+1] / 30
    ];
    
    inputs.push(input);
    targets.push(target);
  }
  
  return { inputs, targets };
}

async function trainNeuralNetwork() {
  if (telemetryData.timestamps.length < 50) {
    addTrainingLog(`Need at least 50 data points (have ${telemetryData.timestamps.length})`, 'warning');
    return;
  }
  
  const now = Date.now();
  if (now - lastTrainingTime < 10000) {
    addTrainingLog('Please wait 10 seconds between training sessions', 'warning');
    return;
  }
  
  lastTrainingTime = now;
  
  addTrainingLog('Preparing training data...', 'info');
  const { inputs, targets } = prepareTrainingData();
  
  if (inputs.length < 10) {
    addTrainingLog('Not enough valid data for training', 'error');
    return;
  }
  
  addTrainingLog(`Training on ${inputs.length} samples...`, 'info');
  
  const inputTensor = tf.tensor2d(inputs);
  const targetTensor = tf.tensor2d(targets);
  
  try {
    const history = await model.fit(inputTensor, targetTensor, {
      epochs: 20,
      validationSplit: 0.2,
      batchSize: 32,
      callbacks: {
        onEpochEnd: async (epoch, logs) => {
          trainingEpochs++;
          modelMetrics.trainLoss = logs.loss;
          modelMetrics.valLoss = logs.val_loss;
          modelMetrics.accuracy = (1 - logs.val_loss) * 100;
          modelMetrics.lastUpdate = new Date();
          
          updateTrainingInfo();
          
          if (epoch % 5 === 0) {
            addTrainingLog(`Epoch ${epoch + 1}/20 - Loss: ${logs.loss.toFixed(4)}, Val Loss: ${logs.val_loss.toFixed(4)}`, 'success');
          }
        }
      }
    });
    
    addTrainingLog(`Training complete! Final accuracy: ${modelMetrics.accuracy.toFixed(1)}%`, 'success');
    updateTrainingInfo();
    
  } catch (error) {
    addTrainingLog(`Training error: ${error.message}`, 'error');
  } finally {
    inputTensor.dispose();
    targetTensor.dispose();
  }
}

async function makePrediction(currentState) {
  if (!model || telemetryData.timestamps.length < 5) {
    return null;
  }
  
  const input = tf.tensor2d([[
    currentState.speed / 60,
    currentState.voltage / 60,
    currentState.current / 30,
    currentState.rpm / 500,
    currentState.distance / 100
  ]]);
  
  const prediction = model.predict(input);
  const result = await prediction.array();
  
  input.dispose();
  prediction.dispose();
  
  return {
    power: result[0][0] * 1000,
    speed: result[0][1] * 60,
    current: result[0][2] * 30
  };
}

// ============================================================================
// CHART VISUALIZATION - WITH HORIZONTAL SCROLLING
// ============================================================================

let chart = null;
let userIsScrolling = false;
let scrollCheckTimer = null;

function initChart() {
  const ctx = document.getElementById('telemetryChart');
  if (!ctx) return;
  
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: []
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
          labels: { 
            color: '#e2e8f0',
            usePointStyle: true,
            font: { size: 11 }
          }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#00ff00',
          bodyColor: '#e2e8f0',
          borderColor: '#00ff00',
          borderWidth: 1
        },
        zoom: {
          pan: {
            enabled: true,
            mode: 'x',
            onPanComplete: () => {
              checkUserScrollPosition();
            }
          },
          zoom: {
            wheel: {
              enabled: true,
              modifierKey: 'ctrl'
            },
            pinch: {
              enabled: true
            },
            mode: 'x'
          },
          limits: {
            x: { min: 'original', max: 'original' }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { 
            color: '#94a3b8', 
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 45
          }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.1)' },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      elements: {
        point: {
          radius: 1,
          hitRadius: 10,
          hoverRadius: 4
        },
        line: {
          tension: 0.3,
          borderWidth: 2
        }
      }
    }
  });
  
  // Listen for wheel events to detect user scrolling
  ctx.addEventListener('wheel', () => {
    userIsScrolling = true;
    resetScrollCheck();
  });
}

function checkUserScrollPosition() {
  if (!chart) return;
  
  const xScale = chart.scales.x;
  if (!xScale) return;
  
  const maxIndex = telemetryData.timestamps.length - 1;
  const currentMaxVisible = xScale.max;
  
  // If user is within 5 data points of the end, they're "at the edge"
  if (maxIndex - currentMaxVisible < 5) {
    userIsScrolling = false;
  } else {
    userIsScrolling = true;
  }
}

function resetScrollCheck() {
  if (scrollCheckTimer) {
    clearTimeout(scrollCheckTimer);
  }
  
  scrollCheckTimer = setTimeout(() => {
    checkUserScrollPosition();
  }, 1000);
}

function updateChart() {
  if (!chart) return;
  
  const chartType = document.getElementById('chartType')?.value || 'telemetry';
  
  if (telemetryData.timestamps.length === 0) {
    chart.data.labels = [];
    chart.data.datasets = [];
    chart.update('none');
    return;
  }
  
  // Create labels for all data points
  const labels = telemetryData.timestamps.map((timestamp, index) => {
    return `#${index}`;
  });
  
  chart.data.labels = labels;
  
  // Configure datasets based on chart type
  switch (chartType) {
    case 'telemetry':
      chart.data.datasets = [
        {
          label: 'Speed (km/h)',
          data: telemetryData.speed,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Voltage (V)',
          data: telemetryData.voltage,
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Current (A)',
          data: telemetryData.current,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'Speed / Voltage / Current', color: '#94a3b8' };
      break;
      
    case 'power-rpm':
      chart.data.datasets = [
        {
          label: 'Power (W)',
          data: telemetryData.power,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'RPM',
          data: telemetryData.rpm,
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'Power (W) / RPM', color: '#94a3b8' };
      break;
      
    case 'torque-rpm':
      chart.data.datasets = [
        {
          label: 'Torque (Nm)',
          data: telemetryData.torque,
          borderColor: 'rgb(251, 146, 60)',
          backgroundColor: 'rgba(251, 146, 60, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'RPM',
          data: telemetryData.rpm,
          borderColor: 'rgb(168, 85, 247)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'Torque (Nm) / RPM', color: '#94a3b8' };
      break;
      
    case 'acceleration':
      chart.data.datasets = [
        {
          label: 'Acceleration (m/s²)',
          data: telemetryData.acceleration,
          borderColor: 'rgb(236, 72, 153)',
          backgroundColor: 'rgba(236, 72, 153, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Jerk (m/s³)',
          data: telemetryData.jerk,
          borderColor: 'rgb(147, 51, 234)',
          backgroundColor: 'rgba(147, 51, 234, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'Acceleration / Jerk', color: '#94a3b8' };
      break;
      
    case 'energy-distance':
      chart.data.datasets = [
        {
          label: 'Energy Efficiency (Wh/km)',
          data: telemetryData.energyPerKm,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          yAxisID: 'y'
        },
        {
          label: 'Distance (km)',
          data: telemetryData.distance,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'Energy (Wh/km) / Distance (km)', color: '#94a3b8' };
      break;
      
    case 'soc-distance':
      chart.data.datasets = [
        {
          label: 'State of Charge (%)',
          data: telemetryData.soc,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          yAxisID: 'y',
          fill: true
        },
        {
          label: 'Distance (km)',
          data: telemetryData.distance,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.y.title = { display: true, text: 'SOC (%) / Distance (km)', color: '#94a3b8' };
      break;
      
    case 'voltage-current':
      chart.data.datasets = [
        {
          label: 'V-I Curve',
          data: telemetryData.current.map((current, i) => ({ 
            x: current, 
            y: telemetryData.voltage[i] 
          })),
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.3)',
          showLine: false,
          pointRadius: 3
        }
      ];
      chart.options.scales.x.title = { display: true, text: 'Current (A)', color: '#94a3b8' };
      chart.options.scales.y.title = { display: true, text: 'Voltage (V)', color: '#94a3b8' };
      break;
      
    case 'speed-distance':
      chart.data.datasets = [
        {
          label: 'Speed (km/h)',
          data: telemetryData.speed,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          yAxisID: 'y'
        }
      ];
      chart.options.scales.x.title = { display: true, text: 'Sample', color: '#94a3b8' };
      chart.options.scales.y.title = { display: true, text: 'Speed (km/h)', color: '#94a3b8' };
      break;
      
    default:
      chart.data.datasets = [];
  }
  
  // Auto-scroll to latest data if user is not manually scrolling
  if (!userIsScrolling && telemetryData.timestamps.length > 20) {
    const visiblePoints = 50;
    const maxIndex = telemetryData.timestamps.length - 1;
    const minIndex = Math.max(0, maxIndex - visiblePoints);
    
    chart.options.scales.x.min = minIndex;
    chart.options.scales.x.max = maxIndex;
  }
  
  chart.update('none');
}

// ============================================================================
// FIREBASE LISTENER - CORRECTED TO MATCH ANDROID APP
// ============================================================================

function setupFirebaseListeners() {
  const cycleReadingsRef = database.ref('cycle_readings').limitToLast(maxDataPoints);
  
  cycleReadingsRef.on('value', (snapshot) => {
    const readings = snapshot.val();
    if (!readings) {
      isConnected = false;
      updateConnectionStatus();
      return;
    }
    
    isConnected = true;
    updateConnectionStatus();
    
    // Clear existing data
    Object.keys(telemetryData).forEach(key => {
      telemetryData[key] = [];
    });
    
    // Convert Firebase object to sorted array by timestamp
    const readingsArray = Object.entries(readings).map(([key, value]) => ({
      key,
      ...value
    })).sort((a, b) => a.timestamp - b.timestamp);
    
    // Populate telemetryData arrays
    readingsArray.forEach(reading => {
      telemetryData.timestamps.push(reading.timestamp || Date.now());
      telemetryData.speed.push(reading.speed || 0);
      telemetryData.voltage.push(reading.voltage || 0);
      telemetryData.current.push(reading.current || 0);
      telemetryData.power.push(reading.power || (reading.voltage * reading.current) || 0);
      telemetryData.rpm.push(reading.rpm || 0);
      telemetryData.distance.push(reading.distance || 0);
      telemetryData.ah.push(reading.ah || 0);
      telemetryData.temperature.push(reading.temperature || 0);
      telemetryData.torque.push(reading.torque || 0);
      telemetryData.throttleIn.push(reading.throttleIn || 0);
      telemetryData.throttleOut.push(reading.throttleOut || 0);
      telemetryData.flags.push(reading.flags || '0');
      telemetryData.activePreset.push(reading.activePreset || 0);
      telemetryData.voltageLimiting.push(reading.voltageLimiting || false);
      telemetryData.currentLimiting.push(reading.currentLimiting || false);
      telemetryData.speedLimiting.push(reading.speedLimiting || false);
      telemetryData.brakeActive.push(reading.brakeActive || false);
      telemetryData.throttleFault.push(reading.throttleFault || false);
    });
    
    // Calculate derived metrics
    calculateDerivedMetrics();
    
    // Update current data with most recent reading
    if (readingsArray.length > 0) {
      const latest = readingsArray[readingsArray.length - 1];
      currentData.speed = latest.speed || 0;
      currentData.voltage = latest.voltage || 0;
      currentData.current = latest.current || 0;
      currentData.power = latest.power || 0;
      currentData.rpm = latest.rpm || 0;
      currentData.distance = latest.distance || 0;
      currentData.ah = latest.ah || 0;
      currentData.temperature = latest.temperature || 0;
      currentData.torque = latest.torque || 0;
      currentData.flags = latest.flags || '0';
      currentData.activePreset = latest.activePreset || 0;
      currentData.voltageLimiting = latest.voltageLimiting || false;
      currentData.currentLimiting = latest.currentLimiting || false;
      currentData.speedLimiting = latest.speedLimiting || false;
      currentData.brakeActive = latest.brakeActive || false;
      currentData.throttleFault = latest.throttleFault || false;
      
      const idx = telemetryData.timestamps.length - 1;
      currentData.soc = telemetryData.soc[idx] || 100;
      currentData.energyPerKm = telemetryData.energyPerKm[idx] || 0;
      currentData.acceleration = telemetryData.acceleration[idx] || 0;
      
      lastUpdateTimestamp = latest.timestamp || Date.now();
    }
    
    updateDisplays();
    updateChart();
  });
  
  console.log('✅ Firebase listeners established on cycle_readings');
}

// ============================================================================
// UI UPDATES
// ============================================================================

function updateDisplays() {
  // Main gauges
  updateElement('speedValue', currentData.speed.toFixed(1));
  updateElement('socValue', currentData.soc.toFixed(0));
  updateElement('ahValue', currentData.ah.toFixed(2));
  
  // Metrics
  updateElement('voltageValue', currentData.voltage.toFixed(1));
  updateElement('currentValue', currentData.current.toFixed(1));
  updateElement('powerValue', currentData.power.toFixed(0));
  updateElement('rpmValue', currentData.rpm.toString());
  updateElement('torqueValue', currentData.torque.toFixed(1));
  updateElement('energyPerKmValue', currentData.energyPerKm.toFixed(1));
  updateElement('accelValue', currentData.acceleration.toFixed(2));
  
  // Update speedometer needle
  updateSpeedometer(currentData.speed);
  
  // Update battery gauge
  updateBatteryGauge(currentData.soc, currentData.ah);
  
  // Update timestamp
  if (lastUpdateTimestamp > 0) {
    const date = new Date(lastUpdateTimestamp);
    updateElement('lastUpdateTimestamp', date.toLocaleTimeString());
  }
  
  // Apply dynamic colors
  applyDynamicColors();
}

function updateElement(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateSpeedometer(speed) {
  // Map speed (0-60 km/h) to rotation (-135° to +135°)
  const maxSpeed = 60;
  const angle = ((speed / maxSpeed) * 270) - 135;
  
  const needle = document.getElementById('speedometer-needle');
  if (needle) {
    needle.style.transform = `rotate(${angle}deg)`;
  }
  
  // Update arc color and length
  const arc = document.getElementById('speedometer-arc');
  if (arc) {
    const circumference = 220;
    const offset = circumference - (speed / maxSpeed) * circumference;
    arc.style.strokeDashoffset = offset;
    
    // Color based on speed
    if (speed < 15) {
      arc.style.stroke = '#00ff00';
    } else if (speed < 30) {
      arc.style.stroke = '#88ff00';
    } else if (speed < 45) {
      arc.style.stroke = '#ffff00';
    } else {
      arc.style.stroke = '#ffaa00';
    }
  }
  
  const dot = document.getElementById('speedometer-dot');
  if (dot && arc) {
    dot.style.fill = arc.style.stroke;
  }
}

function updateBatteryGauge(soc, ahUsed) {
  const fill = document.getElementById('battery-fill');
  const text = document.getElementById('battery-text');
  
  if (fill) {
    const width = (soc / 100) * 130;
    fill.setAttribute('width', width);
    
    // Color based on SOC
    if (soc > 60) {
      fill.style.fill = '#00ff00';
    } else if (soc > 30) {
      fill.style.fill = '#ffff00';
    } else if (soc > 15) {
      fill.style.fill = '#ffaa00';
    } else {
      fill.style.fill = '#ff0000';
    }
  }
  
  if (text) {
    text.textContent = `${soc.toFixed(0)}%`;
    text.style.fill = soc > 50 ? '#000' : '#fff';
  }
}

function applyDynamicColors() {
  const colorDynamic = document.querySelectorAll('.color-dynamic');
  
  colorDynamic.forEach(el => {
    const value = parseFloat(el.textContent);
    const parent = el.closest('.metric-card');
    if (!parent) return;
    
    const label = parent.querySelector('.metric-label')?.textContent.toLowerCase() || '';
    
    if (label.includes('voltage')) {
      if (value > 52) el.style.color = '#00ff00';
      else if (value > 46) el.style.color = '#ffff00';
      else if (value > 42) el.style.color = '#ffaa00';
      else el.style.color = '#ff0000';
    } else if (label.includes('current')) {
      if (value < 0) el.style.color = '#00ff00';
      else if (value < 10) el.style.color = '#ffff00';
      else if (value < 20) el.style.color = '#ffaa00';
      else el.style.color = '#ff0000';
    } else if (label.includes('power')) {
      if (value < 0) el.style.color = '#00ff00';
      else if (value < 500) el.style.color = '#ffff00';
      else if (value < 800) el.style.color = '#ffaa00';
      else el.style.color = '#ff0000';
    } else {
      el.style.color = '#e2e8f0';
    }
  });
}

function updateConnectionStatus() {
  const statusEl = document.getElementById('connectionStatus');
  if (!statusEl) return;
  
  const statusDot = statusEl.querySelector('span:first-child');
  const statusText = statusEl.querySelector('span:last-child');
  
  if (isConnected) {
    statusEl.className = 'status-indicator status-connected pulse';
    if (statusText) statusText.textContent = 'CONNECTED';
  } else {
    statusEl.className = 'status-indicator status-waiting pulse';
    if (statusText) statusText.textContent = 'WAITING...';
  }
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

function updateDiagnostics() {
  const diagnosticsEl = document.getElementById('aiDiagnostics');
  if (!diagnosticsEl) return;
  
  let html = '<div class="diagnostic-section">';
  html += '<h3>System Diagnostics</h3>';
  
  // Connection status
  html += '<div class="diagnostic-item">';
  html += `<span class="diagnostic-label">Connection:</span>`;
  html += `<span class="diagnostic-value ${isConnected ? 'status-ok' : 'status-error'}">${isConnected ? 'Connected' : 'Disconnected'}</span>`;
  html += '</div>';
  
  // Data points
  html += '<div class="diagnostic-item">';
  html += `<span class="diagnostic-label">Data Points:</span>`;
  html += `<span class="diagnostic-value">${telemetryData.timestamps.length}</span>`;
  html += '</div>';
  
  // Voltage status
  const voltageStatus = currentData.voltage > 46 ? 'Normal' : currentData.voltage > 42 ? 'Low' : 'Critical';
  const voltageClass = currentData.voltage > 46 ? 'status-ok' : currentData.voltage > 42 ? 'status-warning' : 'status-error';
  html += '<div class="diagnostic-item">';
  html += `<span class="diagnostic-label">Battery Voltage:</span>`;
  html += `<span class="diagnostic-value ${voltageClass}">${currentData.voltage.toFixed(1)}V (${voltageStatus})</span>`;
  html += '</div>';
  
  // SOC status
  const socStatus = currentData.soc > 30 ? 'Normal' : currentData.soc > 15 ? 'Low' : 'Critical';
  const socClass = currentData.soc > 30 ? 'status-ok' : currentData.soc > 15 ? 'status-warning' : 'status-error';
  html += '<div class="diagnostic-item">';
  html += `<span class="diagnostic-label">State of Charge:</span>`;
  html += `<span class="diagnostic-value ${socClass}">${currentData.soc.toFixed(0)}% (${socStatus})</span>`;
  html += '</div>';
  
  // Temperature status
  const tempStatus = currentData.temperature < 60 ? 'Normal' : currentData.temperature < 75 ? 'Warm' : 'Hot';
  const tempClass = currentData.temperature < 60 ? 'status-ok' : currentData.temperature < 75 ? 'status-warning' : 'status-error';
  html += '<div class="diagnostic-item">';
  html += `<span class="diagnostic-label">Temperature:</span>`;
  html += `<span class="diagnostic-value ${tempClass}">${currentData.temperature.toFixed(1)}°C (${tempStatus})</span>`;
  html += '</div>';
  
  html += '</div>';
  
  // Warnings section
  html += '<div class="diagnostic-section">';
  html += '<h3>Active Warnings</h3>';
  
  const warnings = [];
  if (currentData.voltageLimiting) warnings.push('Voltage Limiting Active');
  if (currentData.currentLimiting) warnings.push('Current Limiting Active');
  if (currentData.speedLimiting) warnings.push('Speed Limiting Active');
  if (currentData.throttleFault) warnings.push('Throttle Fault Detected');
  if (currentData.soc < 20) warnings.push('Low Battery');
  if (currentData.temperature > 70) warnings.push('High Temperature');
  
  if (warnings.length === 0) {
    html += '<div class="diagnostic-item"><span class="status-ok">No active warnings</span></div>';
  } else {
    warnings.forEach(warning => {
      html += `<div class="diagnostic-item"><span class="status-warning">⚠️ ${warning}</span></div>`;
    });
  }
  
  html += '</div>';
  
  // Performance metrics
  html += '<div class="diagnostic-section">';
  html += '<h3>Performance Metrics</h3>';
  
  if (telemetryData.timestamps.length > 1) {
    const avgSpeed = telemetryData.speed.reduce((a, b) => a + b, 0) / telemetryData.speed.length;
    const maxSpeed = Math.max(...telemetryData.speed);
    const avgPower = telemetryData.power.reduce((a, b) => a + b, 0) / telemetryData.power.length;
    const maxPower = Math.max(...telemetryData.power);
    
    html += '<div class="diagnostic-item">';
    html += `<span class="diagnostic-label">Avg Speed:</span>`;
    html += `<span class="diagnostic-value">${avgSpeed.toFixed(1)} km/h</span>`;
    html += '</div>';
    
    html += '<div class="diagnostic-item">';
    html += `<span class="diagnostic-label">Max Speed:</span>`;
    html += `<span class="diagnostic-value">${maxSpeed.toFixed(1)} km/h</span>`;
    html += '</div>';
    
    html += '<div class="diagnostic-item">';
    html += `<span class="diagnostic-label">Avg Power:</span>`;
    html += `<span class="diagnostic-value">${avgPower.toFixed(0)} W</span>`;
    html += '</div>';
    
    html += '<div class="diagnostic-item">';
    html += `<span class="diagnostic-label">Max Power:</span>`;
    html += `<span class="diagnostic-value">${maxPower.toFixed(0)} W</span>`;
    html += '</div>';
  } else {
    html += '<div class="diagnostic-item"><span class="diagnostic-value">Waiting for data...</span></div>';
  }
  
  html += '</div>';
  
  diagnosticsEl.innerHTML = html;
}

// ============================================================================
// TRAINING INFO
// ============================================================================

function updateTrainingInfo() {
  updateElement('trainingEpochs', trainingEpochs);
  updateElement('modelAccuracy', modelMetrics.accuracy.toFixed(1) + '%');
  updateElement('validationLoss', modelMetrics.valLoss.toFixed(4));
  updateElement('predictionCount', telemetryData.timestamps.length);
  
  const statusEl = document.getElementById('trainingStatus');
  if (statusEl) {
    if (telemetryData.timestamps.length < 50) {
      statusEl.textContent = 'NEED DATA';
      statusEl.style.color = '#ffaa00';
    } else if (trainingEpochs === 0) {
      statusEl.textContent = 'READY';
      statusEl.style.color = '#00ff00';
    } else {
      statusEl.textContent = 'TRAINED';
      statusEl.style.color = '#00ff00';
    }
  }
}

function addTrainingLog(message, type = 'info') {
  const logEl = document.getElementById('trainingLog');
  if (!logEl) return;
  
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `training-log-entry training-log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  
  logEl.appendChild(logEntry);
  logEl.scrollTop = logEl.scrollHeight;
  
  // Keep only last 50 entries
  while (logEl.children.length > 50) {
    logEl.removeChild(logEl.firstChild);
  }
}

// ============================================================================
// AI CHATBOT
// ============================================================================

function addAIMessage(message, sender = 'ai') {
  const messagesEl = document.getElementById('aiMessages');
  if (!messagesEl) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `ai-message ai-message-${sender}`;
  
  const bubble = document.createElement('div');
  bubble.className = 'ai-message-bubble';
  bubble.textContent = message;
  
  messageDiv.appendChild(bubble);
  messagesEl.appendChild(messageDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function handleUserMessage() {
  const inputEl = document.getElementById('aiInput');
  if (!inputEl) return;
  
  const message = inputEl.value.trim();
  if (!message) return;
  
  addAIMessage(message, 'user');
  inputEl.value = '';
  
  processUserQuery(message);
}

async function processUserQuery(query) {
  const q = query.toLowerCase();
  
  // SPEED QUERIES
  if (q.match(/\b(speed|fast|slow|km\/h|mph)\b/)) {
    let response = `Current speed: ${currentData.speed.toFixed(1)} km/h\n\n`;
    
    if (telemetryData.speed.length > 1) {
      const avgSpeed = telemetryData.speed.reduce((a, b) => a + b, 0) / telemetryData.speed.length;
      const maxSpeed = Math.max(...telemetryData.speed);
      response += `Average speed: ${avgSpeed.toFixed(1)} km/h\n`;
      response += `Max speed: ${maxSpeed.toFixed(1)} km/h\n`;
      
      if (currentData.speed > 40) {
        response += `\n⚠️ High speed - be careful!`;
      }
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // BATTERY / SOC QUERIES
  if (q.match(/\b(battery|charge|soc|range|remaining|left)\b/)) {
    let response = `Battery status:\n\n`;
    response += `State of Charge: ${currentData.soc.toFixed(0)}%\n`;
    response += `Voltage: ${currentData.voltage.toFixed(1)}V\n`;
    response += `Ah used: ${currentData.ah.toFixed(2)} / ${VEHICLE_CONSTANTS.batteryCapacity} Ah\n`;
    response += `Ah remaining: ${(VEHICLE_CONSTANTS.batteryCapacity - currentData.ah).toFixed(2)} Ah\n\n`;
    
    // Range estimation
    if (currentData.energyPerKm > 0 && currentData.soc > 0) {
      const energyRemaining = (VEHICLE_CONSTANTS.batteryCapacity - currentData.ah) * VEHICLE_CONSTANTS.batteryVoltage;
      const estimatedRange = energyRemaining / currentData.energyPerKm;
      response += `Estimated range: ${estimatedRange.toFixed(1)} km\n`;
    }
    
    if (currentData.soc < 20) {
      response += `\n⚠️ Low battery! Consider charging soon.`;
    } else if (currentData.soc < 50) {
      response += `\n💡 Battery is getting low.`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // VOLTAGE QUERIES
  if (q.match(/\b(voltage|volt|v)\b/)) {
    let response = `Voltage: ${currentData.voltage.toFixed(1)}V\n\n`;
    
    if (telemetryData.voltage.length > 1) {
      const avgVoltage = telemetryData.voltage.reduce((a, b) => a + b, 0) / telemetryData.voltage.length;
      response += `Average: ${avgVoltage.toFixed(1)}V\n`;
    }
    
    if (currentData.voltage < 42) {
      response += `\n⚠️ Voltage critically low!`;
    } else if (currentData.voltage < 46) {
      response += `\n⚠️ Voltage is low`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // CURRENT / POWER QUERIES
  if (q.match(/\b(current|amps?|power|watts?)\b/)) {
    let response = `Power metrics:\n\n`;
    response += `Current: ${currentData.current.toFixed(1)}A\n`;
    response += `Power: ${currentData.power.toFixed(0)}W\n\n`;
    
    if (telemetryData.power.length > 1) {
      const avgPower = telemetryData.power.reduce((a, b) => a + b, 0) / telemetryData.power.length;
      const maxPower = Math.max(...telemetryData.power);
      response += `Average power: ${avgPower.toFixed(0)}W\n`;
      response += `Max power: ${maxPower.toFixed(0)}W\n`;
    }
    
    if (currentData.current < 0) {
      response += `\n🔋 Regenerative braking active`;
    } else if (currentData.current > 25) {
      response += `\n⚡ High current draw`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // RPM / MOTOR QUERIES
  if (q.match(/\b(rpm|motor|revolution)\b/)) {
    let response = `Motor status:\n\n`;
    response += `RPM: ${currentData.rpm}\n`;
    
    if (telemetryData.rpm.length > 1) {
      const avgRPM = telemetryData.rpm.reduce((a, b) => a + b, 0) / telemetryData.rpm.length;
      const maxRPM = Math.max(...telemetryData.rpm);
      response += `Average RPM: ${avgRPM.toFixed(0)}\n`;
      response += `Max RPM: ${maxRPM.toFixed(0)}\n`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // TEMPERATURE QUERIES
  if (q.match(/\b(temp|temperature|hot|cold|heat)\b/)) {
    let response = `Temperature: ${currentData.temperature.toFixed(1)}°C\n\n`;
    
    if (currentData.temperature > 75) {
      response += `⚠️ Temperature is very high! Consider reducing load.`;
    } else if (currentData.temperature > 60) {
      response += `⚠️ Temperature is elevated`;
    } else {
      response += `✅ Temperature is normal`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // DISTANCE / TRIP QUERIES
  if (q.match(/\b(distance|trip|travel|km|kilometer)\b/)) {
    let response = `Trip data:\n\n`;
    response += `Distance: ${currentData.distance.toFixed(2)} km\n`;
    response += `Energy efficiency: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
    
    if (telemetryData.timestamps.length > 1) {
      const duration = (telemetryData.timestamps[telemetryData.timestamps.length - 1] - telemetryData.timestamps[0]) / 1000 / 60;
      response += `Duration: ${duration.toFixed(1)} minutes\n`;
      
      if (currentData.distance > 0 && duration > 0) {
        const avgSpeed = (currentData.distance / duration) * 60;
        response += `Average speed: ${avgSpeed.toFixed(1)} km/h`;
      }
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // EFFICIENCY QUERIES
  if (q.match(/\b(efficiency|wh\/km|consumption|energy)\b/)) {
    let response = `Energy efficiency:\n\n`;
    response += `Current: ${currentData.energyPerKm.toFixed(1)} Wh/km\n\n`;
    
    if (telemetryData.energyPerKm.length > 10) {
      const validEfficiency = telemetryData.energyPerKm.filter(e => e > 0);
      if (validEfficiency.length > 0) {
        const avgEfficiency = validEfficiency.reduce((a, b) => a + b, 0) / validEfficiency.length;
        response += `Average: ${avgEfficiency.toFixed(1)} Wh/km\n`;
        
        if (avgEfficiency < 20) {
          response += `\n✅ Excellent efficiency!`;
        } else if (avgEfficiency < 30) {
          response += `\n✅ Good efficiency`;
        } else {
          response += `\n💡 Higher than optimal - consider smoother riding`;
        }
      }
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // WARNING / ERROR QUERIES
  if (q.match(/\b(warning|error|fault|problem|issue|alert)\b/)) {
    let response = `System status:\n\n`;
    
    const warnings = [];
    if (currentData.voltageLimiting) warnings.push('Voltage limiting active');
    if (currentData.currentLimiting) warnings.push('Current limiting active');
    if (currentData.speedLimiting) warnings.push('Speed limiting active');
    if (currentData.throttleFault) warnings.push('Throttle fault detected');
    if (currentData.soc < 20) warnings.push('Low battery');
    if (currentData.temperature > 70) warnings.push('High temperature');
    
    if (warnings.length === 0) {
      response += `✅ No warnings or errors\nAll systems normal!`;
    } else {
      response += `Active warnings:\n`;
      warnings.forEach(w => {
        response += `⚠️ ${w}\n`;
      });
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // TRAINING / MODEL QUERIES
  if (q.match(/\b(train|model|neural|ai|learn|accuracy)\b/)) {
    let response = `AI Model Status:\n\n`;
    response += `Training epochs: ${trainingEpochs}\n`;
    response += `Model accuracy: ${modelMetrics.accuracy.toFixed(1)}%\n`;
    response += `Validation loss: ${modelMetrics.valLoss.toFixed(4)}\n`;
    response += `Data points: ${telemetryData.timestamps.length}\n\n`;
    
    if (telemetryData.timestamps.length < 50) {
      response += `Need ${50 - telemetryData.timestamps.length} more data points to train`;
    } else {
      response += `Ready to train! Click "Train Model" button or ask me to train.`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // PREDICTION QUERIES
  if (q.match(/\b(predict|forecast|future|next|what will)\b/)) {
    const prediction = await makePrediction(currentData);
    
    if (prediction) {
      let response = `AI Prediction (next moment):\n\n`;
      response += `Predicted power: ${prediction.power.toFixed(0)}W\n`;
      response += `Predicted speed: ${prediction.speed.toFixed(1)} km/h\n`;
      response += `Predicted current: ${prediction.current.toFixed(1)}A\n\n`;
      response += `Based on ${telemetryData.timestamps.length} measurements`;
      addAIMessage(response, 'ai');
    } else {
      addAIMessage('Need more data to make predictions (minimum 5 readings)', 'ai');
    }
    return;
  }
  
  // STATUS / SUMMARY QUERIES
  if (q.match(/\b(status|summary|overview|everything|all|how)\b/)) {
    let response = `System Summary:\n\n`;
    response += `🚗 Speed: ${currentData.speed.toFixed(1)} km/h\n`;
    response += `🔋 Battery: ${currentData.soc.toFixed(0)}% (${currentData.voltage.toFixed(1)}V)\n`;
    response += `⚡ Power: ${currentData.power.toFixed(0)}W\n`;
    response += `🔄 RPM: ${currentData.rpm}\n`;
    response += `📏 Distance: ${currentData.distance.toFixed(2)} km\n`;
    response += `📊 Efficiency: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
    response += `🌡️ Temp: ${currentData.temperature.toFixed(1)}°C\n`;
    response += `💾 Data points: ${telemetryData.timestamps.length}\n\n`;
    
    if (currentData.soc < 20) {
      response += `⚠️ Low battery!\n`;
    }
    if (currentData.voltageLimiting || currentData.currentLimiting || currentData.speedLimiting) {
      response += `⚠️ System limiting active\n`;
    }
    if (currentData.throttleFault) {
      response += `❌ Throttle fault detected!\n`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // DATA / READINGS QUERIES
  if (q.match(/\b(data|points|readings|samples|collect|how many)\b/)) {
    let response = `Data Collection:\n\n`;
    response += `Total readings: ${telemetryData.timestamps.length}\n`;
    response += `Connected: ${isConnected ? 'Yes' : 'No'}\n`;
    response += `Last update: ${new Date(lastUpdateTimestamp).toLocaleTimeString()}\n\n`;
    
    if (telemetryData.timestamps.length > 0) {
      const duration = (telemetryData.timestamps[telemetryData.timestamps.length - 1] - telemetryData.timestamps[0]) / 1000;
      response += `Recording duration: ${(duration / 60).toFixed(1)} minutes\n`;
      response += `Average rate: ${(telemetryData.timestamps.length / duration).toFixed(1)} readings/sec`;
    }
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // HELP / CAPABILITIES QUERIES
  if (q.match(/\b(help|what can you|commands|options|can you)\b/)) {
    let response = `I can help with:\n\n`;
    response += `📊 Real-time telemetry:\n`;
    response += `  - Speed, voltage, current, power\n`;
    response += `  - Battery status and range\n`;
    response += `  - Motor RPM and temperature\n`;
    response += `  - Distance and efficiency\n\n`;
    response += `🔮 Predictions:\n`;
    response += `  - Future power, speed, current\n`;
    response += `  - Range estimates\n\n`;
    response += `🧠 AI Model:\n`;
    response += `  - Training status\n`;
    response += `  - Model accuracy\n\n`;
    response += `⚠️ Diagnostics:\n`;
    response += `  - System warnings\n`;
    response += `  - Limiting status\n`;
    response += `  - Fault detection\n\n`;
    response += `Just ask me naturally!`;
    
    addAIMessage(response, 'ai');
    return;
  }
  
  // DEFAULT RESPONSE
  let response = `I'm not sure what you're asking about. Try asking about:\n\n`;
  response += `- Speed, voltage, current, power\n`;
  response += `- Battery level or range\n`;
  response += `- Motor RPM or temperature\n`;
  response += `- Distance or efficiency\n`;
  response += `- System warnings or status\n`;
  response += `- AI predictions or training\n\n`;
  response += `Or just say "help" for more options!`;
  
  addAIMessage(response, 'ai');
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 Initializing VoltStar Neural AI...');
  
  initChart();
  await initNeuralNetwork();
  setupFirebaseListeners();
  
  // Chart type selector
  const chartTypeSelect = document.getElementById('chartType');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', updateChart);
  }
  
  // AI chat
  const aiInput = document.getElementById('aiInput');
  if (aiInput) {
    aiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleUserMessage();
    });
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
        addAIMessage('Chat cleared! How can I help you?', 'ai');
      }
    });
  }
  
  // Train button
  const trainBtn = document.getElementById('trainModelBtn');
  if (trainBtn) {
    trainBtn.addEventListener('click', trainNeuralNetwork);
  }
  
  // Tab switching
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
      
      // Update diagnostics when switching to that tab
      if (tabName === 'diagnostics') {
        updateDiagnostics();
      }
    });
  });
  
  // Mobile sidebar toggle
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
  
  // Close sidebar on outside click (mobile)
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1400 && aiSidebar && aiSidebar.classList.contains('open')) {
      if (!aiSidebar.contains(e.target) && e.target !== aiToggleBtn && !aiToggleBtn.contains(e.target)) {
        aiSidebar.classList.remove('open');
      }
    }
  });
  
  // Update diagnostics periodically
  setInterval(() => {
    if (isConnected && telemetryData.timestamps.length > 0) {
      updateDiagnostics();
      updateTrainingInfo();
    }
  }, 2000);
  
  console.log('✅ Application initialized');
  addTrainingLog('VoltStar Neural AI ready', 'success');
  addTrainingLog('Waiting for telemetry data from Android app...', 'info');
  
  addAIMessage('Hey! 👋 Neural AI here.\n\nI can help you with:\n- Real-time telemetry analysis\n- Battery and range estimates\n- Performance predictions\n- System diagnostics\n\nJust ask me anything!', 'ai');
});

console.log('🎯 VoltStar Neural AI loaded successfully!');