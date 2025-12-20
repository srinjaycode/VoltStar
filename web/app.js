// voltstar neural ai - lets gooooo  checking for git update
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
            label: `trend (R ≈ ${Math.abs(slope).toFixed(3)}Ω)`,
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
      
    default: // telemetry - THIS IS THE ONE THATS BROKEN
      telemetryChart.options.scales.x.type = 'category';
      labels = telemetryData.timestamps;
      
      // yo get the checkbox states properly
      const voltageChecked = document.getElementById('chartVoltage')?.checked || false;
      const currentChecked = document.getElementById('chartCurrent')?.checked || false;
      const powerChecked = document.getElementById('chartPower')?.checked || false;
      
      console.log('checkbox states:', voltageChecked, currentChecked, powerChecked); // debug this shit
      
      // use dual y-axis if power is selected with other metrics
      const useDualAxis = powerChecked && (voltageChecked || currentChecked);
      
      if (useDualAxis) {
        telemetryChart.options.scales.y1.display = true;
        telemetryChart.options.scales.y.title = { display: true, text: 'V/A', color: '#94a3b8' };
        telemetryChart.options.scales.y1.title = { display: true, text: 'Power (W)', color: '#94a3b8' };
      }
      
      if (voltageChecked) {
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
      
      if (currentChecked) {
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
      
      if (powerChecked) {
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
  // Update speedometer
  updateSpeedometer(currentData.speed);
  
  // Update battery gauge
  updateBatteryGauge(currentData.soc, telemetryData.ampHours[telemetryData.ampHours.length - 1] || 0);
  
  // Update other metrics
  document.getElementById('voltageValue').textContent = currentData.voltage.toFixed(1);
  document.getElementById('currentValue').textContent = currentData.current.toFixed(1);
  document.getElementById('powerValue').textContent = currentData.power.toFixed(0);
  document.getElementById('rpmValue').textContent = currentData.rpm;
  document.getElementById('torqueValue').textContent = currentData.torque.toFixed(1);
  document.getElementById('energyPerKmValue').textContent = currentData.energyPerKm.toFixed(1);
  
  const accelElem = document.getElementById('accelValue');
  if (accelElem) accelElem.textContent = currentData.acceleration.toFixed(2);
  
  // Update colors
  updateMetricColors();
}

// ADD THESE FUNCTIONS - Speedometer with graduations
function updateSpeedometer(speed) {
  const maxSpeed = 60; // 0-60 km/h range
  const percentage = Math.min(speed / maxSpeed, 1);
  
  // Calculate angle (-135deg to +135deg = 270deg total)
  const angle = -135 + (percentage * 270);
  
  // Update needle
  const needle = document.getElementById('speedometer-needle');
  if (needle) {
    needle.style.transform = `rotate(${angle}deg)`;
  }
  
  // Update arc
  const arc = document.getElementById('speedometer-arc');
  if (arc) {
    const offset = 424 * (1 - percentage);
    arc.style.strokeDashoffset = offset;
    
    // Dynamic color
    let color;
    if (speed < 20) color = '#00ff00';
    else if (speed < 35) color = '#88ff00';
    else if (speed < 50) color = '#ffaa00';
    else color = '#ff0000';
    
    arc.style.stroke = color;
  }
  
  // Update dot color
  const dot = document.getElementById('speedometer-dot');
  if (dot) {
    let color;
    if (speed < 20) color = '#00ff00';
    else if (speed < 35) color = '#88ff00';
    else if (speed < 50) color = '#ffaa00';
    else color = '#ff0000';
    
    dot.style.fill = color;
    dot.style.filter = `drop-shadow(0 0 8px ${color})`;
  }
  
  // Update text color
  const speedValue = document.getElementById('speedValue');
  if (speedValue) {
    let color, glow;
    if (speed < 20) {
      color = '#00ff00';
      glow = '0 0 15px rgba(0, 255, 0, 0.8)';
    } else if (speed < 35) {
      color = '#88ff00';
      glow = '0 0 15px rgba(136, 255, 0, 0.8)';
    } else if (speed < 50) {
      color = '#ffaa00';
      glow = '0 0 15px rgba(255, 170, 0, 0.8)';
    } else {
      color = '#ff0000';
      glow = '0 0 15px rgba(255, 0, 0, 0.8)';
    }
    
    speedValue.style.color = color;
    speedValue.style.textShadow = glow;
  }
}

// Battery with proportional fill
function updateBatteryGauge(soc, ah) {
  const batteryWidth = 130;
  const fillWidth = (soc / 100) * batteryWidth;
  
  const fill = document.getElementById('battery-fill');
  if (fill) {
    fill.setAttribute('width', fillWidth);
    
    // Dynamic color
    let color;
    if (soc >= 80) color = '#00ff00';
    else if (soc >= 60) color = '#88ff00';
    else if (soc >= 40) color = '#ffff00';
    else if (soc >= 20) color = '#ffaa00';
    else color = '#ff0000';
    
    fill.style.fill = color;
    fill.style.filter = `drop-shadow(0 0 6px ${color})`;
  }
  
  const batteryText = document.getElementById('battery-text');
  if (batteryText) {
    batteryText.textContent = `${Math.round(soc)}%`;
    batteryText.style.fill = soc >= 60 ? '#ffffff' : '#000000';
  }
  
  const socValue = document.getElementById('socValue');
  if (socValue) {
    let color, glow;
    if (soc >= 80) {
      color = '#00ff00';
      glow = '0 0 15px rgba(0, 255, 0, 0.8)';
    } else if (soc >= 60) {
      color = '#88ff00';
      glow = '0 0 15px rgba(136, 255, 0, 0.8)';
    } else if (soc >= 40) {
      color = '#ffff00';
      glow = '0 0 15px rgba(255, 255, 0, 0.8)';
    } else if (soc >= 20) {
      color = '#ffaa00';
      glow = '0 0 15px rgba(255, 170, 0, 0.8)';
    } else {
      color = '#ff0000';
      glow = '0 0 15px rgba(255, 0, 0, 0.8)';
    }
    
    socValue.style.color = color;
    socValue.style.textShadow = glow;
  }
  
  const ahValue = document.getElementById('ahValue');
  if (ahValue) {
    ahValue.textContent = ah.toFixed(2);
  }
}

// Update metric colors
function updateMetricColors() {
  // Voltage
  const voltagePercent = (currentData.voltage / VEHICLE_CONSTANTS.maxVoltage) * 100;
  let voltageColor;
  if (voltagePercent >= 90) voltageColor = { color: '#00ff00', glow: '0 0 15px rgba(0, 255, 0, 0.8)' };
  else if (voltagePercent >= 75) voltageColor = { color: '#88ff00', glow: '0 0 15px rgba(136, 255, 0, 0.8)' };
  else if (voltagePercent >= 60) voltageColor = { color: '#ffff00', glow: '0 0 15px rgba(255, 255, 0, 0.8)' };
  else if (voltagePercent >= 50) voltageColor = { color: '#ffaa00', glow: '0 0 15px rgba(255, 170, 0, 0.8)' };
  else voltageColor = { color: '#ff0000', glow: '0 0 15px rgba(255, 0, 0, 0.8)' };
  
  const voltageEl = document.getElementById('voltageValue');
  if (voltageEl) {
    voltageEl.style.color = voltageColor.color;
    voltageEl.style.textShadow = voltageColor.glow;
  }
  
  // Similar for other metrics...
  const currentPercent = Math.abs(currentData.current / VEHICLE_CONSTANTS.maxCurrent) * 100;
  let currentColor;
  if (currentPercent < 40) currentColor = { color: '#00ff00', glow: '0 0 15px rgba(0, 255, 0, 0.8)' };
  else if (currentPercent < 60) currentColor = { color: '#88ff00', glow: '0 0 15px rgba(136, 255, 0, 0.8)' };
  else if (currentPercent < 80) currentColor = { color: '#ffaa00', glow: '0 0 15px rgba(255, 170, 0, 0.8)' };
  else currentColor = { color: '#ff0000', glow: '0 0 15px rgba(255, 0, 0, 0.8)' };
  
  const currentEl = document.getElementById('currentValue');
  if (currentEl) {
    currentEl.style.color = currentColor.color;
    currentEl.style.textShadow = currentColor.glow;
  }
  
  // Power, RPM, Torque, Energy, Accel - similar pattern
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

// ENHANCED KEYWORD RECOGNITION SYSTEM - ADD THIS BEFORE handleUserMessage()

const KEYWORD_CATEGORIES = {
  training: [
    'train', 'training', 'learn', 'learning', 'teach', 'teaching', 'practice', 'practicing',
    'improve', 'improving', 'optimize', 'optimizing', 'enhance', 'enhancing', 'upgrade',
    'upgrading', 'educate', 'educating', 'study', 'studying', 'develop', 'developing',
    'refine', 'refining', 'tune', 'tuning', 'calibrate', 'calibrating', 'adapt', 'adapting',
    'evolve', 'evolving', 'grow', 'growing', 'advance', 'advancing', 'progress', 'progressing',
    'model', 'neural', 'network', 'ai', 'machine learning', 'ml', 'deep learning'
  ],
  
  suggestions: [
    'suggest', 'suggestion', 'suggestions', 'recommend', 'recommendation', 'recommendations',
    'advise', 'advice', 'tip', 'tips', 'hint', 'hints', 'help', 'helping', 'guide', 'guidance',
    'improve', 'improvement', 'improvements', 'optimize', 'optimization', 'better', 'best',
    'ideal', 'perfect', 'enhance', 'enhancement', 'boost', 'boosting', 'upgrade', 'upgrading',
    'maximize', 'maximizing', 'increase', 'increasing', 'fix', 'fixing', 'solve', 'solving',
    'solution', 'solutions', 'idea', 'ideas', 'way', 'ways', 'method', 'methods', 'approach',
    'what should', 'how can', 'how do', 'can you', 'could you', 'would you', 'please',
    'need help', 'help me', 'show me', 'tell me', 'explain', 'clarify'
  ],
  
  power: [
    'power', 'watt', 'watts', 'w', 'torque', 'nm', 'newton', 'motor', 'engine',
    'rpm', 'rev', 'revs', 'revolution', 'revolutions', 'rotation', 'rotations', 'spin', 'spinning',
    'acceleration', 'accelerate', 'accelerating', 'speed up', 'speeding up', 'faster', 'fast',
    'quick', 'quicker', 'rapid', 'velocity', 'throttle', 'gas', 'pedal', 'performance',
    'horsepower', 'hp', 'thrust', 'force', 'push', 'pushing', 'pull', 'pulling',
    'output', 'capacity', 'capability', 'strength', 'strong', 'powerful', 'weak', 'weakness',
    'grunt', 'oomph', 'juice', 'muscle', 'kick', 'punch', 'boost', 'surge'
  ],
  
  efficiency: [
    'efficiency', 'efficient', 'inefficient', 'economy', 'economical', 'energy', 'energies',
    'consumption', 'consume', 'consuming', 'usage', 'use', 'using', 'burn', 'burning',
    'drain', 'draining', 'waste', 'wasting', 'save', 'saving', 'savings', 'conservation',
    'conserve', 'conserving', 'mileage', 'mpg', 'range', 'distance', 'wh/km', 'wh', 'kwh',
    'per km', 'per kilometer', 'per mile', 'fuel', 'gas', 'electric', 'electricity',
    'discharge', 'discharging', 'charge', 'charging', 'drain rate', 'consumption rate',
    'eco', 'eco mode', 'economical', 'frugal', 'thrifty', 'lean', 'green', 'sustainable'
  ],
  
  battery: [
    'battery', 'batteries', 'cell', 'cells', 'charge', 'charging', 'charged', 'charger',
    'soc', 'state of charge', 'capacity', 'ah', 'amp hour', 'amp hours', 'ampere',
    'voltage', 'volt', 'volts', 'v', 'power', 'juice', 'energy', 'stored', 'remaining',
    'left', 'reserve', 'reserves', 'level', 'percentage', 'percent', '%', 'low', 'high',
    'full', 'empty', 'dead', 'dying', 'life', 'lifespan', 'health', 'condition',
    'degradation', 'wear', 'age', 'aging', 'cycle', 'cycles', 'discharge', 'discharging',
    'pack', 'module', 'lithium', 'li-ion', 'lifepo4', 'lead acid', 'chemistry',
    'internal resistance', 'sag', 'drop', 'cutoff', 'protection', 'bms'
  ],
  
  range: [
    'range', 'distance', 'far', 'how far', 'how long', 'miles', 'kilometers', 'km',
    'travel', 'traveling', 'trip', 'journey', 'go', 'going', 'reach', 'reaching',
    'mileage', 'endurance', 'stamina', 'coverage', 'span', 'extent', 'limit', 'limitation',
    'run out', 'running out', 'last', 'lasting', 'duration', 'time', 'remaining',
    'left', 'available', 'reserve', 'estimate', 'estimated', 'prediction', 'predicted',
    'forecast', 'expected', 'potential', 'maximum', 'max', 'minimum', 'min'
  ],
  
  status: [
    'status', 'current', 'now', 'present', 'currently', 'right now', 'at the moment',
    'stats', 'statistics', 'data', 'info', 'information', 'details', 'numbers', 'figures',
    'readings', 'values', 'metrics', 'parameters', 'measurements', 'telemetry',
    'what', 'whats', "what's", 'how', 'hows', "how's", 'where', 'wheres', "where's",
    'show', 'display', 'tell', 'give', 'provide', 'report', 'update', 'overview',
    'summary', 'snapshot', 'state', 'situation', 'condition', 'health', 'check'
  ],
  
  diagnostics: [
    'diagnostic', 'diagnostics', 'check', 'checking', 'test', 'testing', 'scan', 'scanning',
    'problem', 'problems', 'issue', 'issues', 'error', 'errors', 'fault', 'faults',
    'wrong', 'bad', 'broken', 'failure', 'failing', 'malfunction', 'malfunctioning',
    'trouble', 'troubleshoot', 'troubleshooting', 'debug', 'debugging', 'fix', 'fixing',
    'repair', 'repairing', 'health', 'healthy', 'unhealthy', 'sick', 'damage', 'damaged',
    'wear', 'tear', 'inspection', 'inspect', 'inspecting', 'examine', 'examining',
    'analysis', 'analyze', 'analyzing', 'evaluate', 'evaluating', 'assessment', 'assess',
    'warning', 'warnings', 'alert', 'alerts', 'critical', 'danger', 'dangerous', 'risk'
  ],
  
  prediction: [
    'predict', 'prediction', 'predictions', 'forecast', 'forecasting', 'expect', 'expected',
    'expecting', 'anticipate', 'anticipating', 'future', 'upcoming', 'next', 'later',
    'will', 'would', 'should', 'could', 'might', 'may', 'probably', 'likely', 'unlikely',
    'estimate', 'estimated', 'estimating', 'guess', 'guessing', 'projection', 'projecting',
    'outlook', 'prospect', 'prognosis', 'trend', 'trending', 'pattern', 'patterns',
    'compare', 'comparison', 'comparing', 'difference', 'differences', 'versus', 'vs',
    'better', 'worse', 'best', 'worst', 'optimal', 'ideal', 'target', 'goal'
  ],
  
  speed: [
    'speed', 'speeding', 'velocity', 'fast', 'faster', 'fastest', 'slow', 'slower', 'slowest',
    'quick', 'quicker', 'quickest', 'rapid', 'mph', 'kph', 'km/h', 'kmh', 'kilometers per hour',
    'miles per hour', 'pace', 'rate', 'tempo', 'accelerate', 'acceleration', 'decelerate',
    'deceleration', 'brake', 'braking', 'cruise', 'cruising', 'top speed', 'max speed',
    'minimum speed', 'average speed', 'current speed', 'moving', 'motion', 'travel'
  ],
  
  temperature: [
    'temp', 'temperature', 'temperatures', 'hot', 'cold', 'warm', 'cool', 'heat', 'heating',
    'overheat', 'overheating', 'thermal', 'celsius', 'fahrenheit', 'degrees', 'deg',
    'c', 'f', 'cooling', 'cooler', 'hotter', 'warmer', 'burning', 'freeze', 'freezing'
  ],
  
  summary: [
    'summary', 'summarize', 'summarise', 'overview', 'brief', 'briefing', 'recap', 'recaps',
    'rundown', 'roundup', 'digest', 'synopsis', 'abstract', 'outline', 'highlight', 'highlights',
    'key points', 'main points', 'essentials', 'basics', 'fundamentals', 'overall',
    'general', 'everything', 'all', 'total', 'complete', 'full', 'entire', 'whole',
    'big picture', 'birds eye', 'high level', 'quick look', 'glance', 'snapshot'
  ]
};

// Function to detect which categories match the user's message
function detectCategories(message) {
  const lowerMsg = message.toLowerCase();
  const matched = new Set();
  
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORIES)) {
    for (const keyword of keywords) {
      if (lowerMsg.includes(keyword)) {
        matched.add(category);
        break; // Found a match in this category, move to next category
      }
    }
  }
  
  return Array.from(matched);
}

// Generate comprehensive summary
async function generateComprehensiveSummary() {
  let summary = `📊 COMPLETE RIDE SUMMARY\n\n`;
  
  // Basic stats
  summary += `🚴 CURRENT STATUS:\n`;
  summary += `├─ Speed: ${currentData.speed.toFixed(1)} km/h\n`;
  summary += `├─ Distance: ${currentData.distance.toFixed(2)} km\n`;
  summary += `├─ Battery: ${currentData.soc.toFixed(1)}%\n`;
  summary += `└─ Energy/km: ${currentData.energyPerKm.toFixed(1)} Wh/km\n\n`;
  
  // Power & Performance
  summary += `⚡ POWER & PERFORMANCE:\n`;
  summary += `├─ Power: ${currentData.power.toFixed(0)}W (${((currentData.power/VEHICLE_CONSTANTS.maxPower)*100).toFixed(1)}% of max)\n`;
  summary += `├─ Torque: ${currentData.torque.toFixed(2)} Nm\n`;
  summary += `├─ RPM: ${currentData.rpm}\n`;
  summary += `├─ Voltage: ${currentData.voltage.toFixed(1)}V\n`;
  summary += `├─ Current: ${currentData.current.toFixed(1)}A\n`;
  summary += `└─ Acceleration: ${currentData.acceleration.toFixed(2)} m/s²\n\n`;
  
  // Efficiency & Range
  const estimatedRange = (VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage) / currentData.energyPerKm;
  const remainingCapacity = (currentData.soc / 100) * VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage;
  summary += `🔋 EFFICIENCY & RANGE:\n`;
  summary += `├─ Consumption: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
  summary += `├─ Estimated Range: ${estimatedRange.toFixed(1)} km\n`;
  summary += `├─ Remaining Energy: ${remainingCapacity.toFixed(0)} Wh\n`;
  summary += `└─ Total Distance: ${currentData.distance.toFixed(2)} km\n\n`;
  
  // Physics Analysis
  if (currentData.speed > 5) {
    const limits = calculatePhysicalLimits(currentData);
    summary += `🌬️ AERODYNAMICS:\n`;
    summary += `├─ Drag Power: ${limits.dragPower.toFixed(0)}W\n`;
    summary += `├─ Rolling Resistance: ${limits.rollingPower.toFixed(0)}W\n`;
    summary += `├─ Total Resistance: ${limits.resistancePower.toFixed(0)}W\n`;
    summary += `└─ Efficiency: ${(limits.efficiency * 100).toFixed(1)}%\n\n`;
  }
  
  // Battery Health
  if (currentData.current > 0.5) {
    const voltageSag = VEHICLE_CONSTANTS.batteryVoltage - currentData.voltage;
    const internalR = Math.abs(voltageSag / currentData.current);
    let healthStatus = 'excellent';
    if (internalR > 0.15) healthStatus = 'good';
    if (internalR > 0.25) healthStatus = 'fair';
    if (internalR > 0.4) healthStatus = 'poor';
    
    summary += `🔬 BATTERY HEALTH:\n`;
    summary += `├─ Internal Resistance: ${internalR.toFixed(3)} Ω\n`;
    summary += `├─ Voltage Sag: ${Math.abs(voltageSag).toFixed(2)}V\n`;
    summary += `├─ Health Status: ${healthStatus.toUpperCase()}\n`;
    summary += `└─ Battery Condition: ${healthStatus === 'excellent' || healthStatus === 'good' ? '✅ Healthy' : '⚠️ Needs attention'}\n\n`;
  }
  
  // AI Insights
  if (model && telemetryData.speed.length >= 5) {
    summary += `🧠 AI INSIGHTS:\n`;
    summary += `├─ Model Trained: ${trainingEpochs} epochs\n`;
    summary += `├─ Accuracy: ${modelAccuracy.toFixed(1)}%\n`;
    summary += `├─ Predictions Made: ${predictionCount}\n`;
    summary += `└─ Status: ${trainingEpochs > 0 ? 'Learning from your ride' : 'Warming up'}\n\n`;
  }
  
  // Warnings & Alerts
  const alerts = [];
  if (currentData.soc < 20) alerts.push('🚨 Battery critically low!');
  if (currentData.power > VEHICLE_CONSTANTS.maxPower * 0.9) alerts.push('⚠️ Motor at maximum capacity');
  if (currentData.energyPerKm > 50) alerts.push('⚠️ High energy consumption');
  
  if (alerts.length > 0) {
    summary += `⚠️ ALERTS:\n`;
    alerts.forEach(alert => summary += `├─ ${alert}\n`);
    summary += `\n`;
  } else {
    summary += `✅ ALL SYSTEMS NOMINAL\n\n`;
  }
  
  // Neural suggestions if available
  if (model && telemetryData.speed.length >= 5) {
    summary += `💡 AI RECOMMENDATIONS:\n`;
    const suggestions = await generateNeuralSuggestions();
    summary += suggestions;
  }
  
  return summary;
}

// REPLACE THE ENTIRE handleUserMessage() FUNCTION WITH THIS:
async function handleUserMessage() {
  const input = document.getElementById('aiInput');
  if (!input) return;
  
  const message = input.value.trim();
  if (!message) return;
  
  addAIMessage(message, 'user');
  input.value = '';
  
  // Detect all matching categories
  const categories = detectCategories(message);
  let response = '';
  
  // If no categories matched, show help
  if (categories.length === 0) {
    response = `🧠 voltstar neural ai here!\n\n`;
    response += `not sure what youre asking about, but here's what i can do:\n\n`;
    response += `💪 POWER STUFF: power, torque, rpm, acceleration, motor performance\n`;
    response += `🔋 BATTERY STUFF: charge, voltage, soc, health, cells, capacity\n`;
    response += `📏 RANGE & DISTANCE: mileage, how far, remaining distance\n`;
    response += `⚡ EFFICIENCY: consumption, economy, wh/km, energy usage\n`;
    response += `🏃 SPEED: velocity, pace, fast, slow, acceleration\n`;
    response += `📊 STATUS: current stats, data, metrics, readings\n`;
    response += `🔍 DIAGNOSTICS: problems, issues, health check, warnings\n`;
    response += `🎯 OPTIMIZATION: suggestions, recommendations, tips, improvements\n`;
    response += `🧠 TRAINING: learn, practice, improve model, neural network\n`;
    response += `📋 SUMMARY: overview, recap, complete status, everything\n\n`;
    response += `just ask me naturally! i understand hundreds of keywords and phrases`;
    addAIMessage(response, 'ai');
    return;
  }
  
  // Handle multiple categories
  const responses = [];
  
  // Priority order for responses
  const priorityOrder = ['summary', 'training', 'suggestions', 'diagnostics', 'prediction', 
                         'power', 'battery', 'efficiency', 'range', 'status', 'speed', 'temperature'];
  
  for (const category of priorityOrder) {
    if (!categories.includes(category)) continue;
    
    switch(category) {
      case 'summary':
        responses.push(await generateComprehensiveSummary());
        break;
        
      case 'training':
        responses.push('alright, firing up the training sequence... lets make this model smarter! 🧠\n');
        await trainNeuralNetwork();
        responses.push(await generateNeuralSuggestions());
        break;
        
      case 'suggestions':
        responses.push(await generateNeuralSuggestions());
        break;
        
      case 'power':
        let powerResp = `⚡ POWER & PERFORMANCE BREAKDOWN:\n\n`;
        powerResp += `current power: ${currentData.power.toFixed(0)}W (${((currentData.power/VEHICLE_CONSTANTS.maxPower)*100).toFixed(1)}% of max)\n`;
        powerResp += `torque: ${currentData.torque.toFixed(2)} Nm @ ${currentData.rpm} RPM\n`;
        powerResp += `acceleration: ${currentData.acceleration.toFixed(2)} m/s²\n\n`;
        const limits = calculatePhysicalLimits(currentData);
        powerResp += `optimal power for this speed: ${limits.optimalPower.toFixed(0)}W\n`;
        powerResp += `optimal rpm: ${limits.optimalRPM.toFixed(0)}\n`;
        responses.push(powerResp);
        break;
        
      case 'efficiency':
      case 'battery':
      case 'range':
        let effResp = `🔋 ENERGY, BATTERY & RANGE ANALYSIS:\n\n`;
        effResp += `energy consumption: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
        effResp += `battery charge: ${currentData.soc.toFixed(1)}%\n`;
        effResp += `distance covered: ${currentData.distance.toFixed(2)} km\n\n`;
        const effLimits = calculatePhysicalLimits(currentData);
        effResp += `aerodynamic drag: ${effLimits.dragPower.toFixed(0)}W\n`;
        effResp += `rolling resistance: ${effLimits.rollingPower.toFixed(0)}W\n`;
        effResp += `total resistance: ${effLimits.resistancePower.toFixed(0)}W\n\n`;
        const estimatedRange = (VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage) / currentData.energyPerKm;
        effResp += `estimated range: ${estimatedRange.toFixed(1)} km\n`;
        const remainingCapacity = (currentData.soc / 100) * VEHICLE_CONSTANTS.batteryCapacity * VEHICLE_CONSTANTS.batteryVoltage;
        effResp += `remaining energy: ${remainingCapacity.toFixed(0)} Wh\n`;
        responses.push(effResp);
        break;
        
      case 'status':
      case 'speed':
        let statusResp = `📊 CURRENT RIDE STATS:\n\n`;
        statusResp += `speed: ${currentData.speed.toFixed(1)} km/h\n`;
        statusResp += `power: ${currentData.power.toFixed(0)}W\n`;
        statusResp += `torque: ${currentData.torque.toFixed(2)} Nm\n`;
        statusResp += `rpm: ${currentData.rpm}\n`;
        statusResp += `voltage: ${currentData.voltage.toFixed(1)}V\n`;
        statusResp += `current: ${currentData.current.toFixed(1)}A\n`;
        statusResp += `battery: ${currentData.soc.toFixed(1)}%\n`;
        statusResp += `distance: ${currentData.distance.toFixed(2)} km\n`;
        statusResp += `energy/km: ${currentData.energyPerKm.toFixed(1)} Wh/km\n`;
        responses.push(statusResp);
        break;
        
      case 'diagnostics':
        let diagResp = `🔍 RUNNING DIAGNOSTICS...\n\n`;
        let issuesFound = false;
        
        if (currentData.soc < 20) {
          diagResp += `⚠️ battery critically low! find a charger asap\n`;
          issuesFound = true;
        }
        if (currentData.power > VEHICLE_CONSTANTS.maxPower * 0.9) {
          diagResp += `⚠️ motor at max capacity - ease off to prevent overheating\n`;
          issuesFound = true;
        }
        if (currentData.energyPerKm > 50) {
          diagResp += `⚠️ energy consumption very high - check riding style\n`;
          issuesFound = true;
        }
        
        const diagLimits = calculatePhysicalLimits(currentData);
        if (currentData.current > 0.5) {
          const voltageSag = VEHICLE_CONSTANTS.batteryVoltage - currentData.voltage;
          const internalR = Math.abs(voltageSag / currentData.current);
          if (internalR > 0.3) {
            diagResp += `⚠️ battery internal resistance elevated (${internalR.toFixed(3)}Ω) - cells might be aging\n`;
            issuesFound = true;
          }
        }
        
        if (!issuesFound) {
          diagResp += `✅ all systems looking good!\n`;
        }
        
        diagResp += `\ncheck the diagnostics tab for detailed analysis`;
        responses.push(diagResp);
        break;
        
      case 'prediction':
        responses.push(await generateNeuralSuggestions());
        break;
    }
  }
  
  // Combine all responses (yo those lines were way too long)
  response = responses.join('\n\n' + '─'.repeat(15) + '\n\n');
  
  // If training was triggered, suggestions are already included
  if (categories.includes('training') && categories.includes('suggestions')) {
    // Avoid duplicate suggestions
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
  
  // yo we gotta update diagnostics regularly or it stays empty like a ghost town
  setInterval(() => {
    const diagTab = document.getElementById('diagnosticsTab');
    if (diagTab && diagTab.classList.contains('active') && telemetryData.speed.length > 0) {
      updateDiagnostics();
    }
  }, 2000); // update every 2 seconds when diagnostics tab is open

// force diagnostics update every 3 seconds if we got data
setInterval(() => {
  if (telemetryData.speed.length > 0) {
    console.log('updating diagnostics, data points:', telemetryData.speed.length);
    updateDiagnostics();
  }
}, 3000);

console.log('✅ application initialized');

  console.log('✅ application initialized');
  addTrainingLog('voltstar neural ai ready', 'success');
  addTrainingLog('waiting for telemetry data...', 'info');
  
  // add welcome message to chat
  addAIMessage('hey! 👋 neural ai here and ready to analyze your ride\n\nstart sending telemetry data and ill learn from it in real-time. ask me anything about power, efficiency, battery, or performance!', 'ai');
});

// ADD THESE FUNCTIONS TO YOUR app.js FILE

// Function to get color based on value and thresholds
function getValueColor(value, thresholds) {
  // thresholds: { excellent, good, moderate, warning }
  if (value <= thresholds.excellent) return { color: 'var(--color-excellent)', glow: 'var(--glow-green)' };
  if (value <= thresholds.good) return { color: 'var(--color-good)', glow: 'var(--glow-green)' };
  if (value <= thresholds.moderate) return { color: 'var(--color-moderate)', glow: 'var(--glow-yellow)' };
  if (value <= thresholds.warning) return { color: 'var(--color-warning)', glow: 'var(--glow-orange)' };
  return { color: 'var(--color-critical)', glow: 'var(--glow-red)' };
}

// Update speedometer gauge
function updateSpeedometer(speed) {
  const maxSpeed = VEHICLE_CONSTANTS.maxSpeed;
  const percentage = Math.min(speed / maxSpeed, 1);
  const arcLength = 251.2; // Full arc length
  const offset = arcLength * (1 - percentage);
  
  // Update arc
  const arc = document.getElementById('speedometer-arc');
  if (arc) {
    arc.style.strokeDashoffset = offset;
  }
  
  // Update needle (rotate from -90deg to 90deg)
  const angle = -90 + (percentage * 180);
  const needle = document.getElementById('speedometer-needle');
  if (needle) {
    needle.style.transform = `rotate(${angle}deg)`;
  }
  
  // Update color based on speed
  const thresholds = {
    excellent: maxSpeed * 0.3,
    good: maxSpeed * 0.5,
    moderate: maxSpeed * 0.7,
    warning: maxSpeed * 0.9
  };
  const colorData = getValueColor(speed, thresholds);
  
  const dot = document.getElementById('speedometer-dot');
  if (dot) {
    dot.style.fill = colorData.color;
    dot.style.filter = `drop-shadow(0 0 10px ${colorData.color})`;
  }
  
  const speedValue = document.getElementById('speedValue');
  if (speedValue) {
    speedValue.style.color = colorData.color;
    speedValue.style.textShadow = colorData.glow;
  }
}

// Update battery gauge
function updateBatteryGauge(soc, ah) {
  const maxWidth = 130; // Max width of battery fill
  const fillWidth = (soc / 100) * maxWidth;
  
  // Update fill width
  const fill = document.getElementById('battery-fill');
  if (fill) {
    fill.setAttribute('width', fillWidth);
  }
  
  // Update color based on SOC
  const thresholds = {
    excellent: 100, // Reversed - higher is better
    good: 60,
    moderate: 40,
    warning: 20
  };
  
  let colorData;
  if (soc >= 80) colorData = { color: 'var(--color-excellent)', glow: 'var(--glow-green)' };
  else if (soc >= 60) colorData = { color: 'var(--color-good)', glow: 'var(--glow-green)' };
  else if (soc >= 40) colorData = { color: 'var(--color-moderate)', glow: 'var(--glow-yellow)' };
  else if (soc >= 20) colorData = { color: 'var(--color-warning)', glow: 'var(--glow-orange)' };
  else colorData = { color: 'var(--color-critical)', glow: 'var(--glow-red)' };
  
  if (fill) {
    fill.style.fill = colorData.color;
  }
  
  const batteryText = document.getElementById('battery-text');
  if (batteryText) {
    batteryText.textContent = `${Math.round(soc)}%`;
    batteryText.style.fill = colorData.color;
  }
  
  const socValue = document.getElementById('socValue');
  if (socValue) {
    socValue.style.color = colorData.color;
    socValue.style.textShadow = colorData.glow;
  }
  
  // Update ah display
  const ahValue = document.getElementById('ahValue');
  if (ahValue) {
    ahValue.textContent = ah.toFixed(2);
  }
}

// Update metric cards with conditional colors
function updateMetricColors() {
  // Voltage - based on percentage of max
  const voltagePercent = (currentData.voltage / VEHICLE_CONSTANTS.maxVoltage) * 100;
  const voltageThresholds = { excellent: 100, good: 75, moderate: 60, warning: 50 };
  let voltageColor;
  if (voltagePercent >= 90) voltageColor = getValueColor(100, voltageThresholds);
  else if (voltagePercent >= 75) voltageColor = getValueColor(80, voltageThresholds);
  else if (voltagePercent >= 60) voltageColor = getValueColor(65, voltageThresholds);
  else if (voltagePercent >= 50) voltageColor = getValueColor(55, voltageThresholds);
  else voltageColor = getValueColor(40, voltageThresholds);
  
  const voltageEl = document.getElementById('voltageValue');
  if (voltageEl) {
    voltageEl.style.color = voltageColor.color;
    voltageEl.style.textShadow = voltageColor.glow;
  }
  
  // Current - based on percentage of max
  const currentPercent = Math.abs(currentData.current / VEHICLE_CONSTANTS.maxCurrent) * 100;
  const currentThresholds = { excellent: 30, good: 50, moderate: 70, warning: 90 };
  const currentColor = getValueColor(currentPercent, currentThresholds);
  
  const currentEl = document.getElementById('currentValue');
  if (currentEl) {
    currentEl.style.color = currentColor.color;
    currentEl.style.textShadow = currentColor.glow;
  }
  
  // Power - based on percentage of max
  const powerPercent = (currentData.power / VEHICLE_CONSTANTS.maxPower) * 100;
  const powerThresholds = { excellent: 40, good: 60, moderate: 80, warning: 95 };
  const powerColor = getValueColor(powerPercent, powerThresholds);
  
  const powerEl = document.getElementById('powerValue');
  if (powerEl) {
    powerEl.style.color = powerColor.color;
    powerEl.style.textShadow = powerColor.glow;
  }
  
  // RPM - based on percentage of max
  const rpmPercent = (currentData.rpm / VEHICLE_CONSTANTS.maxRPM) * 100;
  const rpmThresholds = { excellent: 40, good: 60, moderate: 80, warning: 95 };
  const rpmColor = getValueColor(rpmPercent, rpmThresholds);
  
  const rpmEl = document.getElementById('rpmValue');
  if (rpmEl) {
    rpmEl.style.color = rpmColor.color;
    rpmEl.style.textShadow = rpmColor.glow;
  }
  
  // Torque - based on percentage of max
  const torquePercent = (currentData.torque / VEHICLE_CONSTANTS.maxTorque) * 100;
  const torqueThresholds = { excellent: 40, good: 60, moderate: 80, warning: 95 };
  const torqueColor = getValueColor(torquePercent, torqueThresholds);
  
  const torqueEl = document.getElementById('torqueValue');
  if (torqueEl) {
    torqueEl.style.color = torqueColor.color;
    torqueEl.style.textShadow = torqueColor.glow;
  }
  
  // Energy per km - lower is better
  const energyThresholds = { excellent: 15, good: 25, moderate: 35, warning: 50 };
  const energyColor = getValueColor(currentData.energyPerKm, energyThresholds);
  
  const energyEl = document.getElementById('energyPerKmValue');
  if (energyEl) {
    energyEl.style.color = energyColor.color;
    energyEl.style.textShadow = energyColor.glow;
  }
  
  // Acceleration - based on absolute value
  const accelThresholds = { excellent: 1, good: 2, moderate: 3, warning: 4 };
  const accelColor = getValueColor(Math.abs(currentData.acceleration), accelThresholds);
  
  const accelEl = document.getElementById('accelValue');
  if (accelEl) {
    accelEl.style.color = accelColor.color;
    accelEl.style.textShadow = accelColor.glow;
  }
}

// MODIFY your updateMetricsDisplay() function to call these new functions:
function updateMetricsDisplay() {
  // Update speedometer
  updateSpeedometer(currentData.speed);
  
  // Update battery gauge
  updateBatteryGauge(currentData.soc, telemetryData.ampHours[telemetryData.ampHours.length - 1] || 0);
  
  // Update other metrics
  document.getElementById('voltageValue').textContent = currentData.voltage.toFixed(1);
  document.getElementById('currentValue').textContent = currentData.current.toFixed(1);
  document.getElementById('powerValue').textContent = currentData.power.toFixed(0);
  document.getElementById('rpmValue').textContent = currentData.rpm;
  document.getElementById('torqueValue').textContent = currentData.torque.toFixed(1);
  document.getElementById('energyPerKmValue').textContent = currentData.energyPerKm.toFixed(1);
  
  const accelElem = document.getElementById('accelValue');
  if (accelElem) accelElem.textContent = currentData.acceleration.toFixed(2);
  
  // Update colors for all metrics
  updateMetricColors();
}

// ALSO UPDATE the calculateTruePhysicalParameters function to handle missing ah:
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
  
  // FIX: Handle missing ah by integrating from current
  let ampHours;
  if (dataPoint.ah !== undefined && dataPoint.ah !== null) {
    // Use provided ah value
    ampHours = parseFloat(dataPoint.ah);
  } else {
    // Integrate from current (dt = 1 second)
    const prevAh = index > 0 ? (telemetryData.ampHours[index - 1] || 0) : 0;
    ampHours = prevAh + (current / 3600); // Ah = A * hours (1 second = 1/3600 hour)
  }
  
  const totalAh = VEHICLE_CONSTANTS.batteryCapacity;
  const soc = Math.max(0, Math.min(100, 100 - (ampHours / totalAh) * 100));
  
  return { power, torque, acceleration, jerk, energy, soc, ampHours };
}

console.log('🎯 voltstar neural ai ready!')