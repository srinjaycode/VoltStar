// voltstar neural ai - telemetry dashboard
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


// charts
let telemetryChart, powerSpeedChart, efficiencyChart;

function initCharts() {
    initMainChart();
    initPowerSpeedChart();
    initEfficiencyChart();
}

function initMainChart() {
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

function initPowerSpeedChart() {
    const ctx = document.getElementById('powerSpeedChart').getContext('2d');
    powerSpeedChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Power vs Speed',
                data: [],
                backgroundColor: 'rgba(255, 170, 0, 0.5)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Power vs Speed', color: '#e2e8f0' },
                legend: { display: false }
            },
            scales: {
                x: { title: { display: true, text: 'Speed (km/h)', color: '#94a3b8' }, grid: { color: 'rgba(45, 52, 84, 0.3)' }, ticks: { color: '#94a3b8' } },
                y: { title: { display: true, text: 'Power (W)', color: '#94a3b8' }, grid: { color: 'rgba(45, 52, 84, 0.3)' }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function initEfficiencyChart() {
    const ctx = document.getElementById('efficiencyChart').getContext('2d');
    efficiencyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Efficiency',
                data: [],
                borderColor: '#00ff88',
                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Efficiency over Time', color: '#e2e8f0' },
                legend: { display: false }
            },
            scales: {
                x: { title: { display: true, text: 'Time', color: '#94a3b8' }, grid: { color: 'rgba(45, 52, 84, 0.3)' }, ticks: { color: '#94a3b8' } },
                y: { title: { display: true, text: 'Efficiency (%)', color: '#94a3b8' }, grid: { color: 'rgba(45, 52, 84, 0.3)' }, ticks: { color: '#94a3b8', min: 0, max: 100 } }
            }
        }
    });
}


function updateCharts() {
    updateMainChart();
    updatePowerSpeedChart();
    updateEfficiencyChart();
}

function updateMainChart() {
    telemetryChart.data.datasets = [];
    telemetryChart.update();
}

function updatePowerSpeedChart() {
    powerSpeedChart.data.datasets[0].data = telemetryData.speed.map((s, i) => ({ x: s, y: telemetryData.power[i] }));
    powerSpeedChart.update();
}

function updateEfficiencyChart() {
    const efficiencyData = telemetryData.power.map((p, i) => {
        const inputPower = telemetryData.voltage[i] * telemetryData.current[i];
        return inputPower > 0 ? (p / inputPower) * 100 : 0;
    });
    efficiencyChart.data.labels = telemetryData.timestamps;
    efficiencyChart.data.datasets[0].data = efficiencyData;
    efficiencyChart.update();
}


let gauges = {};

function initGauges() {
    gauges.speed = new RadialGauge({ renderTo: 'speed-gauge', ...gaugeOptions('km/h'), maxValue: VEHICLE_CONSTANTS.maxSpeed }).draw();
    gauges.voltage = new RadialGauge({ renderTo: 'voltage-gauge', ...gaugeOptions('V'), maxValue: VEHICLE_CONSTANTS.maxVoltage }).draw();
    gauges.current = new RadialGauge({ renderTo: 'current-gauge', ...gaugeOptions('A'), maxValue: VEHICLE_CONSTANTS.maxCurrent }).draw();
    gauges.power = new RadialGauge({ renderTo: 'power-gauge', ...gaugeOptions('W'), maxValue: VEHICLE_CONSTANTS.maxPower }).draw();
    gauges.rpm = new RadialGauge({ renderTo: 'rpm-gauge', ...gaugeOptions('RPM'), maxValue: VEHICLE_CONSTANTS.maxRPM }).draw();
}

function gaugeOptions(units) {
    return {
        width: 200,
        height: 200,
        units: units,
        minValue: 0,
        startAngle: 90,
        ticksAngle: 180,
        valueBox: true,
        majorTicks: Array.from({length: 11}, (v, i) => i * 100),
        minorTicks: 2,
        strokeTicks: true,
        highlights: [],
        colorPlate: "transparent",
        colorMajorTicks: "#f5f5f5",
        colorMinorTicks: "#ddd",
        colorTitle: "#fff",
        colorUnits: "#ccc",
        colorNumbers: "#eee",
        colorNeedle: "#ff006e",
        colorNeedleEnd: "#ff006e",
        valueBoxBorderRadius: 0,
        colorNeedleCircleOuter: "#ccc",
        colorNeedleCircleOuterEnd: "#ccc",
        colorNeedleCircleInner: "#222",
        colorNeedleCircleInnerEnd: "#111",
        needleType: "arrow",
        needleWidth: 2,
        needleCircleSize: 7,
        needleCircleOuter: true,
        needleCircleInner: false,
        animationDuration: 1500,
        animationRule: "linear",
        fontValue: "Led",
        fontNumbers: "Led",
        fontTitle: "Led",
        fontUnits: "Led",
    };
}

function updateGauges() {
    gauges.speed.value = currentData.speed;
    gauges.voltage.value = currentData.voltage;
    gauges.current.value = currentData.current;
    gauges.power.value = currentData.power;
    gauges.rpm.value = currentData.rpm;
}



// firebase listeners
function setupFirebaseListeners() {
  console.log('🔗 setting up firebase listener...');
  
  const readingsRef = database.ref('/cycle_readings');
  
  readingsRef.on('value', (snapshot) => {
    if (!snapshot.exists()) {
      console.warn('⚠️ no data found');
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
    updateGauges();
    updateCharts();
    
    console.log('✅ loaded', telemetryData.timestamps.length, 'points');
    
  }, (error) => {
    console.error('❌ firebase error:', error);
  });
}





// event listeners and initialization
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎯 initializing voltstar neural ai...');
  
  initCharts();
  initGauges();
  await initNeuralNetwork();
  setupFirebaseListeners();
  
  console.log('✅ application initialized');
});

console.log('🎯 voltstar neural ai ready!');
