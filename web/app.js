// voltstar neural ai - lets gooooo
console.log('🚀 VoltStar Neural AI - Initializing with TensorFlow.js...');

// firebase config
const firebaseConfig = {
  databaseURL: "https://voltstar01-default-rtdb.europe-west1.firebasedatabase.app"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// telemetry data storage
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

// vehicle physical constants (the true physics baby)
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

// neural network stuff
let model = null;
let trainingEpochs = 0;
let modelAccuracy = 0;
let predictionCount = 0;
let validationLoss = 0;
let trainingData = [];
let lastTrainingTime = 0;
let autoTrainInterval = null;

// init the neural network
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
  addTrainingLog('neural network model created with 6-input, 5-output architecture');
  addTrainingLog('inputs: speed, voltage, current, rpm, distance, previous_power');
  addTrainingLog('outputs: optimal_power, optimal_rpm, optimal_torque, efficiency, energy_per_km');
  
  // auto train every 30 seconds if we got enough data
  autoTrainInterval = setInterval(() => {
    if (telemetryData.speed.length >= 20 && Date.now() - lastTrainingTime > 30000) {
      trainNeuralNetwork();
    }
  }, 30000);
}

// calculate true physical params
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

// validate predictions against physics
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

// calc physical limits based on current state
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

// train the neural net baby
async function trainNeuralNetwork() {
  if (telemetryData.speed.length < 20) {
    addTrainingLog('need at least 20 data points to train', 'warning');
    return;
  }
  
  addTrainingLog('starting self-training session...', 'success');
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
    addTrainingLog('not enough valid samples', 'warning');
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
            addTrainingLog(`epoch ${epoch + 1}/30 - loss: ${logs.loss.toFixed(4)}, val: ${logs.val_loss.toFixed(4)}, mae: ${logs.mae.toFixed(4)}`);
          }
        }
      }
    });
    
    lastTrainingTime = Date.now();
    addTrainingLog('✅ self-training completed!', 'success');
    addTrainingLog(`model accuracy: ${modelAccuracy.toFixed(1)}% | trained on ${validSamples} samples`, 'success');
    addTrainingLog('model aligned with physics constraints', 'success');
    updateTrainingStatus('READY');
    
  } catch (error) {
    console.error('training error:', error);
    addTrainingLog('training failed: ' + error.message, 'error');
    updateTrainingStatus('ERROR');
  } finally {
    xs.dispose();
    ys.dispose();
  }
}

// make prediction with the model
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

// generate ai suggestions (more expressive now)
async function generateNeuralSuggestions() {
  if (!model || telemetryData.speed.length < 5) {
    return 'hey! im still warming up here... need at least 5 data points to start analyzing your ride 🔥';
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
  
  if (!result) return 'neural network prediction unavailable rn, gimme a sec...';
  
  const { prediction, validation } = result;
  const physicalLimits = calculatePhysicalLimits({
    speed: telemetryData.speed[lastIdx],
    voltage: telemetryData.voltage[lastIdx],
    current: telemetryData.current[lastIdx],
    rpm: telemetryData.rpm[lastIdx]
  });
  
  let suggestions = `🧠 alright lets dive into whats happening with your ride!\n\n`;
  suggestions += `📊 NEURAL PREDICTIONS:\n`;
  suggestions += `├─ optimal power: ${prediction.power.toFixed(0)}W (youre at ${currentData.power.toFixed(0)}W)\n`;
  suggestions += `├─ optimal rpm: ${prediction.rpm.toFixed(0)} (currently ${currentData.rpm})\n`;
  suggestions += `├─ optimal torque: ${prediction.torque.toFixed(2)} Nm (youve got ${currentData.torque.toFixed(2)} Nm)\n`;
  suggestions += `├─ predicted efficiency: ${(prediction.efficiency * 100).toFixed(1)}%\n`;
  suggestions += `└─ energy consumption: ${prediction.energyPerKm.toFixed(1)} Wh/km\n\n`;
  
  suggestions += `✅ PHYSICS CHECK:\n`;
  suggestions += `├─ validation: ${validation.isValid ? '✅ all systems nominal!' : '⚠️ hmm something might be off'}\n`;
  suggestions += `├─ confidence: ${(validation.accuracy * 100).toFixed(1)}%\n`;
  suggestions += `├─ power limits: ${validation.validations.powerValid ? '✅' : '❌'}\n`;
  suggestions += `├─ rpm range: ${validation.validations.rpmValid ? '✅' : '❌'}\n`;
  suggestions += `├─ torque range: ${validation.validations.torqueValid ? '✅' : '❌'}\n`;
  suggestions += `└─ energy check: ${validation.validations.energyValid ? '✅' : '❌'}\n\n`;
  
  suggestions += `🎯 WHAT YOU SHOULD DO:\n`;
  
  const powerDiff = prediction.power - currentData.power;
  if (Math.abs(powerDiff) > 50) {
    if (powerDiff > 0) {
      suggestions += `💡 yo! you could push it harder - try adding ${powerDiff.toFixed(0)}W more power for better performance\n`;
    } else {
      suggestions += `💡 ease up a bit! reducing power by ${Math.abs(powerDiff).toFixed(0)}W will save you some battery life\n`;
    }
  } else {
    suggestions += `✅ power output looking good! youre in the sweet spot right now\n`;
  }
  
  const rpmDiff = prediction.rpm - currentData.rpm;
  if (Math.abs(rpmDiff) > 20) {
    suggestions += `💡 try adjusting rpm to ${prediction.rpm.toFixed(0)} (${rpmDiff > 0 ? 'speed up' : 'slow down'} by ${Math.abs(rpmDiff).toFixed(0)} rpm)\n`;
  }
  
  if (prediction.efficiency < 0.8) {
    suggestions += `⚠️ efficiency is kinda low rn... check these things:\n`;
    suggestions += `   - wind resistance is costing you ${physicalLimits.dragPower.toFixed(0)}W\n`;
    suggestions += `   - tire friction is eating ${physicalLimits.rollingPower.toFixed(0)}W\n`;
    suggestions += `   maybe tuck in more or check your tire pressure?\n`;
  }
  
  if (currentData.energyPerKm > prediction.energyPerKm * 1.2) {
    suggestions += `⚠️ whoa! youre burning way more energy than you need to\n`;
    suggestions += `   predicted: ${prediction.energyPerKm.toFixed(1)} Wh/km but youre at ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
  }
  
  if (currentData.soc < 30) {
    suggestions += `\n🔋 battery getting low! maybe find a charging spot soon?\n`;
  }
  
  return suggestions;
}

// init chart with multi-axis support
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
          position: 'left',
          grid: { color: 'rgba(45, 52, 84, 0.3)', drawBorder: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        },
        y1: {
          display: false,
          position: 'right',
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { size: 10 } }
        }
      },
      animation: { duration: 300 }
    }
  });
}

// update chart with multi-axis support
function updateChart() {
  const chartType = document.getElementById('chartType').value;
  
  let datasets = [];
  let labels = [];
  
  // reset scales
  telemetryChart.options.scales.x.type = 'linear';
  telemetryChart.options.scales.y.type = 'linear';
  telemetryChart.options.scales.y1.display = false;
  
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
      
      // add trend line if we got enough data
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
            label: `trend line (R ≈ ${Math.abs(slope).toFixed(3)}Ω)`,
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
      
    default: // telemetry with dual y-axis
      telemetryChart.options.scales.x.type = 'category';
      labels = telemetryData.timestamps;
      
      // use dual y-axis if power is selected with other metrics
      const isPowerSelected = document.getElementById('chartPower').checked;
      const otherMetricsSelected = document.getElementById('chartSpeed').checked || 
                                   document.getElementById('chartVoltage').checked || 
                                   document.getElementById('chartCurrent').checked;
      
      const useDualAxis = isPowerSelected && otherMetricsSelected;
      
      if (useDualAxis) {
        telemetryChart.options.scales.y1.display = true;
        telemetryChart.options.scales.y.title = { display: true, text: 'Speed/Voltage/Current', color: '#94a3b8' };
        telemetryChart.options.scales.y1.title = { display: true, text: 'Power (W)', color: '#94a3b8' };
      }
      
      if (document.getElementById('chartSpeed').checked) {
        datasets.push({
          label: 'Speed (km/h)',
          data: telemetryData.speed,
          borderColor: '#00ff88',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: 'y'
        });
      }
      if (document.getElementById('chartVoltage').checked) {
        datasets.push({
          label: 'Voltage (V)',
          data: telemetryData.voltage,
          borderColor: '#00d9ff',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: 'y'
        });
      }
      if (document.getElementById('chartCurrent').checked) {
        datasets.push({
          label: 'Current (A)',
          data: telemetryData.current,
          borderColor: '#ff3366',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: 'y'
        });
      }
      if (document.getElementById('chartPower').checked) {
        datasets.push({
          label: 'Power (W)',
          data: telemetryData.power,
          borderColor: '#ffaa00',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          yAxisID: useDualAxis ? 'y1' : 'y'
        });
      }
      telemetryChart.options.scales.x.title = { display: false };
      if (!useDualAxis) {
        telemetryChart.options.scales.y.title = { display: false };
      }
  }
  
  telemetryChart.data.labels = labels;
  telemetryChart.data.datasets = datasets;
  telemetryChart.update('none');
}

// firebase listeners
function setupFirebaseListeners() {
  console.log('🔗 setting up firebase listener...');
  
  const readingsRef = database.ref('/cycle_readings');
  
  readingsRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.warn('⚠️ no data found');
      updateConnectionStatus(false);
      return;
    }
    
    const readings = snapshot.val();
    const readingKeys = Object.keys(readings).sort();
    
    console.log('📊 processing', readingKeys.length, 'data points');
    
    // clear old data
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
    
    // keep only latest maxDataPoints
    if (telemetryData.timestamps.length > maxDataPoints) {
      const excess = telemetryData.timestamps.length - maxDataPoints;
      for (const key in telemetryData) {
        telemetryData[key].splice(0, excess);
      }
    }
    
    // update current data
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
    
    console.log('✅ loaded', telemetryData.timestamps.length, 'points');
    
  }, (error) => {
    console.error('❌ firebase error:', error);
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
  
  // power vs rpm analysis
  if (currentData.rpm > 0 && currentData.power > 0) {
    const powerUtilization = (currentData.power / VEHICLE_CONSTANTS.maxPower) * 100;
    const optimalPowerDiff = currentData.power - physicalLimits.optimalPower;
    let status, message, suggestion;
    
    if (powerUtilization < 40) {
      status = 'good';
      message = 'motor chillin in comfort mode';
      suggestion = `got ${(VEHICLE_CONSTANTS.maxPower - currentData.power).toFixed(0)}W in reserves if you need it`;
    } else if (powerUtilization < 70) {
      status = 'good';
      message = 'sweet spot! motor running efficiently';
      suggestion = 'nice balance between power and heat management';
    } else if (powerUtilization < 90) {
      status = 'moderate';
      message = 'pushing it pretty hard, getting close to thermal limits';
      suggestion = '⚠️ keep an eye on motor temp';
    } else {
      status = 'critical';
      message = 'MAX POWER!! motor at full capacity';
      suggestion = '🚨 ease off the throttle to avoid damage';
    }
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Power Curve (P vs RPM)</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${powerUtilization.toFixed(1)}% | ${currentData.power.toFixed(0)}W @ ${currentData.rpm} RPM</div>
        <div class="diagnostic-message">${message} | optimal: ${physicalLimits.optimalPower.toFixed(0)}W</div>
        <div class="diagnostic-suggestion">💡 ${suggestion}</div>
      </div>
    `;
  }
  
  // torque vs rpm
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
        <div class="diagnostic-message">T = P / ω where ω = 2π×RPM/60 | optimal: ${physicalLimits.optimalTorque.toFixed(2)} Nm</div>
        <div class="diagnostic-suggestion">💡 ${torquePercent < 70 ? 'safe operating range' : '⚠️ high torque - watch that temp'}</div>
      </div>
    `;
  }
  
  // acceleration & jerk
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
        <div class="diagnostic-message">a = dS/dt, j = d²S/dt² | smooth acceleration = better traction</div>
        <div class="diagnostic-suggestion">💡 ${Math.abs(currentData.jerk) < 5 ? 'smooth as butter' : '⚠️ jerky movements - ease on the throttle'}</div>
      </div>
    `;
  }
  
  // energy per distance
  if (currentData.distance > 0.1 && currentData.energyPerKm > 0) {
    let status = 'good';
    if (currentData.energyPerKm > 30) status = 'moderate';
    if (currentData.energyPerKm > 50) status = 'critical';
    
    const estimatedRange = (VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage) / currentData.energyPerKm;
    
    diagnosticsContainer.innerHTML += `
      <div class="diagnostic-item">
        <div class="diagnostic-header">
          <span class="diagnostic-label">Energy Consumption</span>
          <span class="diagnostic-status status-${status}">${status.toUpperCase()}</span>
        </div>
        <div class="diagnostic-value">${currentData.energyPerKm.toFixed(1)} Wh/km</div>
        <div class="diagnostic-message">estimated range: ${estimatedRange.toFixed(1)} km at this rate</div>
        <div class="diagnostic-suggestion">💡 ${status === 'good' ? 'excellent efficiency!' : '⚠️ burning through energy - try cruising lighter'}</div>
      </div>
    `;
  }
  
  // aero & rolling resistance
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
        <div class="diagnostic-message">drag: ${physicalLimits.dragPower.toFixed(0)}W | rolling: ${physicalLimits.rollingPower.toFixed(0)}W</div>
        <div class="diagnostic-suggestion">💡 ${dragPercent < 60 ? 'good aero profile' : '⚠️ high drag - slow down or tuck in'}</div>
      </div>
    `;
  }
  
  // soc analysis
  const remainingCapacity = (currentData.soc / 100) * VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage;
  let socStatus = currentData.soc > 80 ? 'excellent' : currentData.soc > 50 ? 'good' : currentData.soc > 20 ? 'moderate' : 'critical';
  
  diagnosticsContainer.innerHTML += `
    <div class="diagnostic-item">
      <div class="diagnostic-header">
        <span class="diagnostic-label">Battery State of Charge</span>
        <span class="diagnostic-status status-${socStatus}">${socStatus.toUpperCase()}</span>
      </div>
      <div class="diagnostic-value">${currentData.soc.toFixed(1)}% | ${remainingCapacity.toFixed(0)} Wh left</div>
      <div class="diagnostic-message">distance traveled: ${currentData.distance.toFixed(2)} km</div>
      <div class="diagnostic-suggestion">💡 ${socStatus === 'critical' ? '🚨 charge NOW!' : socStatus === 'moderate' ? '⚠️ start looking for a charger' : 'battery lookin healthy'}</div>
    </div>
  `;
  
  // voltage sag & internal resistance
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
        <div class="diagnostic-message">voltage sag: ${Math.abs(voltageSag).toFixed(2)}V @ ${currentData.current.toFixed(1)}A</div>
        <div class="diagnostic-suggestion">💡 ${status === 'excellent' || status === 'good' ? 'battery cells in good shape' : '⚠️ resistance high - check your cells'}</div>
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
  
  // keep only last 50 entries
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

// enhanced keyword recognition and responses
async function handleUserMessage() {
  const input = document.getElementById('aiInput');
  if (!input) return;
  
  const message = input.value.trim();
  if (!message) return;
  
  addAIMessage(message, 'user');
  input.value = '';
  
  const lowerMsg = message.toLowerCase();
  let response = '';
  
  // training keywords
  if (lowerMsg.includes('train') || lowerMsg.includes('learn') || lowerMsg.includes('teach') || lowerMsg.includes('practice')) {
    response = 'alright, firing up the training sequence... lets make this model smarter! 🧠\n\n';
    await trainNeuralNetwork();
    response += await generateNeuralSuggestions();
  } 
  // suggestion keywords
  else if (lowerMsg.includes('suggest') || lowerMsg.includes('recommend') || lowerMsg.includes('advise') || 
           lowerMsg.includes('tip') || lowerMsg.includes('help') || lowerMsg.includes('improve') || 
           lowerMsg.includes('optimize') || lowerMsg.includes('better')) {
    response = await generateNeuralSuggestions();
  }
  // power/torque keywords
  else if (lowerMsg.includes('power') || lowerMsg.includes('torque') || lowerMsg.includes('watt') || 
           lowerMsg.includes('rpm') || lowerMsg.includes('motor') || lowerMsg.includes('acceleration') ||
           lowerMsg.includes('speed up') || lowerMsg.includes('faster')) {
    response = `⚡ power & performance breakdown:\n\n`;
    response += `current power: ${currentData.power.toFixed(0)}W (${((currentData.power/VEHICLE_CONSTANTS.maxPower)*100).toFixed(1)}% of max)\n`;
    response += `torque: ${currentData.torque.toFixed(2)} Nm @ ${currentData.rpm} RPM\n`;
    response += `acceleration: ${currentData.acceleration.toFixed(2)} m/s²\n\n`;
    const limits = calculatePhysicalLimits(currentData);
    response += `optimal power for this speed: ${limits.optimalPower.toFixed(0)}W\n`;
    response += `optimal rpm: ${limits.optimalRPM.toFixed(0)}\n\n`;
    response += await generateNeuralSuggestions();
  }
  // efficiency/energy keywords
  else if (lowerMsg.includes('efficiency') || lowerMsg.includes('energy') || lowerMsg.includes('battery') || 
           lowerMsg.includes('range') || lowerMsg.includes('consumption') || lowerMsg.includes('wh/km') ||
           lowerMsg.includes('save') || lowerMsg.includes('economical')) {
    response = `🔋 energy & efficiency analysis:\n\n`;
    response += `energy consumption: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
    response += `battery charge: ${currentData.soc.toFixed(1)}%\n`;
    response += `distance covered: ${currentData.distance.toFixed(2)} km\n\n`;
    const limits = calculatePhysicalLimits(currentData);
    response += `aerodynamic drag: ${limits.dragPower.toFixed(0)}W\n`;
    response += `rolling resistance: ${limits.rollingPower.toFixed(0)}W\n`;
    response += `total resistance: ${limits.resistancePower.toFixed(0)}W\n\n`;
    const estimatedRange = (VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage) / currentData.energyPerKm;
    response += `estimated range: ${estimatedRange.toFixed(1)} km\n\n`;
    response += await generateNeuralSuggestions();
  }
  // status/current keywords
  else if (lowerMsg.includes('status') || lowerMsg.includes('current') || lowerMsg.includes('now') || 
           lowerMsg.includes('stats') || lowerMsg.includes('data') || lowerMsg.includes('info') ||
           lowerMsg.includes('what') || lowerMsg.includes('how')) {
    response = `📊 current ride stats:\n\n`;
    response += `speed: ${currentData.speed.toFixed(1)} km/h\n`;
    response += `power: ${currentData.power.toFixed(0)}W\n`;
    response += `torque: ${currentData.torque.toFixed(2)} Nm\n`;
    response += `rpm: ${currentData.rpm}\n`;
    response += `voltage: ${currentData.voltage.toFixed(1)}V\n`;
    response += `current: ${currentData.current.toFixed(1)}A\n`;
    response += `battery: ${currentData.soc.toFixed(1)}%\n`;
    response += `distance: ${currentData.distance.toFixed(2)} km\n`;
    response += `energy/km: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
  }
  // diagnostics keywords
  else if (lowerMsg.includes('diagnostic') || lowerMsg.includes('check') || lowerMsg.includes('problem') || 
           lowerMsg.includes('issue') || lowerMsg.includes('wrong') || lowerMsg.includes('health')) {
    response = `🔍 running diagnostics...\n\n`;
    
    if (currentData.soc < 20) {
      response += `⚠️ battery critically low! find a charger asap\n`;
    }
    if (currentData.power > VEHICLE_CONSTANTS.maxPower * 0.9) {
      response += `⚠️ motor at max capacity - ease off to prevent overheating\n`;
    }
    if (currentData.energyPerKm > 50) {
      response += `⚠️ energy consumption very high - check riding style\n`;
    }
    
    const limits = calculatePhysicalLimits(currentData);
    if (currentData.current > 0.5) {
      const voltageSag = VEHICLE_CONSTANTS.batteryVoltage - currentData.voltage;
      const internalR = Math.abs(voltageSag / currentData.current);
      if (internalR > 0.3) {
        response += `⚠️ battery internal resistance elevated (${internalR.toFixed(3)}Ω) - cells might be aging\n`;
      }
    }
    
    if (response === `🔍 running diagnostics...\n\n`) {
      response += `✅ all systems looking good!\n`;
    }
    
    response += `\ncheck the diagnostics tab for detailed analysis`;
  }
  // comparison/prediction keywords
  else if (lowerMsg.includes('predict') || lowerMsg.includes('forecast') || lowerMsg.includes('expect') ||
           lowerMsg.includes('compare') || lowerMsg.includes('difference') || lowerMsg.includes('should')) {
    response = await generateNeuralSuggestions();
  }
  // greeting keywords
  else if (lowerMsg.includes('hello') || lowerMsg.includes('hi ') || lowerMsg.includes('hey') ||
           lowerMsg.includes('sup') || lowerMsg.includes('yo')) {
    response = `hey there! 👋 im your neural ai assistant, trained on ${trainingEpochs} epochs with ${modelAccuracy.toFixed(1)}% accuracy\n\n`;
    response += `im here to help you optimize your ride! try asking me about:\n`;
    response += `• power & performance\n`;
    response += `• efficiency & battery\n`;
    response += `• current stats\n`;
    response += `• diagnostics\n`;
    response += `• suggestions for improvement\n\n`;
    response += `just talk to me naturally, i understand lots of keywords!`;
  }
  // thanks keywords
  else if (lowerMsg.includes('thank') || lowerMsg.includes('thanks') || lowerMsg.includes('thx')) {
    response = `no problem! happy to help 😊\n\njust lemme know if you need anything else about your ride`;
  }
  // default help response
  else {
    response = `🧠 voltstar neural ai here!\n\n`;
    response += `not sure what youre asking about, but here's what i can do:\n\n`;
    response += `💪 POWER STUFF: ask about power, torque, rpm, acceleration\n`;
    response += `🔋 ENERGY STUFF: efficiency, battery, range, consumption\n`;
    response += `📊 DATA STUFF: current status, stats, diagnostics\n`;
    response += `🎯 OPTIMIZATION: suggestions, recommendations, tips\n`;
    response += `🧠 TRAINING: tell me to train/learn for better predictions\n\n`;
    response += `just ask me naturally! i understand lots of keywords and phrases`;
  }
  
  addAIMessage(response, 'ai');
}

// event listeners and initialization
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 initializing voltstar neural ai...');
  
  initChart();
  await initNeuralNetwork();
  setupFirebaseListeners();
  
  // chart type selector
  const chartTypeSelect = document.getElementById('chartType');
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener('change', updateChart);
  }
  
  // chart checkboxes
  ['chartSpeed', 'chartVoltage', 'chartCurrent', 'chartPower'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', updateChart);
    }
  });
  
  // ai chat input
  const aiInput = document.getElementById('aiInput');
  if (aiInput) {
    aiInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleUserMessage();
    });
  }
  
  // train button
  const trainBtn = document.getElementById('trainModelBtn');
  if (trainBtn) {
    trainBtn.addEventListener('click', trainNeuralNetwork);
  }
  
  // send message button
  const sendBtn = document.getElementById('sendMessageBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', handleUserMessage);
  }
  
  // clear chat button
  const clearChatBtn = document.getElementById('clearChatBtn');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      const messagesContainer = document.getElementById('aiMessages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
        addAIMessage('chat history cleared! whats up?', 'ai');
      }
    });
  }
  
  // tab navigation
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
  
  // mobile sidebar toggle
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
  
  // close sidebar when clicking outside on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1400 && aiSidebar && aiSidebar.classList.contains('open')) {
      if (!aiSidebar.contains(e.target) && e.target !== aiToggleBtn) {
        aiSidebar.classList.remove('open');
      }
    }
  });
  
  console.log('✅ application initialized');
  addTrainingLog('voltstar neural ai ready', 'success');
  addTrainingLog('waiting for telemetry data...', 'info');
  
  // add welcome message to chat
  addAIMessage('hey! 👋 neural ai here and ready to analyze your ride\n\nstart sending telemetry data and ill learn from it in real-time. ask me anything about power, efficiency, battery, or performance!', 'ai');
});

console.log('🎯 voltstar neural ai ready!')