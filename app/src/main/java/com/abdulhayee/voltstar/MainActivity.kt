package com.abdulhayee.voltstar

import android.app.Application
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.database.FirebaseDatabase
import com.hoho.android.usbserial.driver.*
import com.hoho.android.usbserial.util.SerialInputOutputManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.collections.ArrayList
import kotlin.math.absoluteValue

// ============================================================================
// APPLICATION CLASS
// ============================================================================

/**
 * Main application class for Firebase initialization
 */
class VoltStarApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        // Initialize Firebase
        FirebaseDatabase.getInstance().apply {
            setPersistenceEnabled(true)
            setPersistenceCacheSizeBytes(10 * 1024 * 1024)
        }

        Log.d("VoltStar", "Application initialized")
    }
}

// ============================================================================
// DATA CLASSES
// ============================================================================

/**
 * Decoded flags from Cycle Analyst Flgs column
 */
data class FlagsDecoded(
    val activePreset: Int,           // Which preset is active (0-4)
    val voltageLimiting: Boolean,    // Voltage limiting active
    val currentLimiting: Boolean,    // Current limiting active
    val speedLimiting: Boolean,      // Speed limiting active
    val brakeActive: Boolean,        // Brake is engaged
    val throttleFault: Boolean       // Throttle fault detected
) {
    companion object {
        fun fromInt(flags: Int): FlagsDecoded {
            return FlagsDecoded(
                activePreset = flags and 0x07,
                voltageLimiting = (flags and 0x08) != 0,
                currentLimiting = (flags and 0x10) != 0,
                speedLimiting = (flags and 0x20) != 0,
                brakeActive = (flags and 0x40) != 0,
                throttleFault = (flags and 0x80) != 0
            )
        }
    }
}

/**
 * Strongly typed telemetry data - ALL Cycle Analyst fields
 */
data class TelemetryData(
    val timestamp: Long,
    val values: Map<String, String>,
    // Primary metrics (displayed on screen)
    val ampHours: Double?,           // Ah
    val voltage: Double?,             // V
    val current: Double?,             // A
    val speed: Double?,               // S
    // Additional metrics (uploaded but not displayed)
    val distance: Double?,            // D
    val temperature: Double?,         // Deg
    val rpm: Int?,                    // RPM
    val humanWatts: Double?,          // HW (not used - no pedals on vehicle)
    val torque: Double?,              // Nm
    val throttleIn: Double?,          // ThI
    val throttleOut: Double?,         // ThO
    val auxAnalog: Double?,           // AuxA
    val auxDigital: Int?,             // AuxD
    val flagsRaw: String?,            // Flgs (as string for state representation)
    val flags: FlagsDecoded?,         // Decoded flags for logic
    val electricalPower: Double?      // Calculated V * A
) {
    fun toFirebaseMap(): Map<String, Any> {
        return buildMap {
            put("timestamp", timestamp)

            // Upload ALL Cycle Analyst fields
            ampHours?.let { put("ah", it) }
            voltage?.let { put("voltage", it) }
            current?.let { put("current", it) }
            speed?.let { put("speed", it) }
            distance?.let { put("distance", it) }
            temperature?.let { put("temperature", it) }
            rpm?.let { put("rpm", it) }
            humanWatts?.let { put("humanWatts", it) }
            torque?.let { put("torque", it) }
            throttleIn?.let { put("throttleIn", it) }
            throttleOut?.let { put("throttleOut", it) }
            auxAnalog?.let { put("auxAnalog", it) }
            auxDigital?.let { put("auxDigital", it) }
            flagsRaw?.let { put("flags", it) }  // Upload as string
            electricalPower?.let { put("power", it) }

            // Also upload decoded flag states for convenience
            flags?.let { f ->
                put("activePreset", f.activePreset)
                put("voltageLimiting", f.voltageLimiting)
                put("currentLimiting", f.currentLimiting)
                put("speedLimiting", f.speedLimiting)
                put("brakeActive", f.brakeActive)
                put("throttleFault", f.throttleFault)
            }
        }
    }
}

/**
 * Log entry for UI display
 */
data class LogEntry(
    val timestamp: Long,
    val message: String,
    val level: LogLevel
)

enum class LogLevel {
    INFO, WARNING, ERROR
}

// ============================================================================
// STREAM FRAMING
// ============================================================================

/**
 * Handles rolling byte buffer and line extraction
 */
class StreamFramer {
    private val buffer = ByteBuffer.allocate(8192)
    private val lineQueue = ConcurrentLinkedQueue<String>()

    @Synchronized
    fun addBytes(data: ByteArray, length: Int) {
        // Ensure capacity
        if (buffer.remaining() < length) {
            compact()
        }

        // Add new data
        buffer.put(data, 0, length)
    }

    @Synchronized
    fun extractLines(): List<String> {
        val lines = mutableListOf<String>()

        buffer.flip()
        val bytes = ByteArray(buffer.remaining())
        buffer.get(bytes)

        var start = 0
        for (i in bytes.indices) {
            if (bytes[i] == '\n'.code.toByte()) {
                val lineBytes = bytes.copyOfRange(start, i)
                val line = String(lineBytes, Charsets.UTF_8).trim()
                if (line.isNotEmpty()) {
                    lines.add(line)
                }
                start = i + 1
            }
        }

        // Put back incomplete line
        buffer.clear()
        if (start < bytes.size) {
            buffer.put(bytes, start, bytes.size - start)
        }

        return lines
    }

    private fun compact() {
        buffer.flip()
        val remaining = buffer.remaining()
        val temp = ByteArray(remaining)
        buffer.get(temp)
        buffer.clear()
        buffer.put(temp)
    }
}

// ============================================================================
// TELEMETRY PARSER
// ============================================================================

/**
 * Parses tab-delimited telemetry with dynamic header mapping
 */
class TelemetryParser {
    private var columnMap: Map<String, Int>? = null

    fun parseHeader(line: String): Boolean {
        val columns = line.split('\t').map { it.trim() }
        columnMap = columns.withIndex().associate { it.value to it.index }
        Log.d("VoltStar", "Header parsed: ${columns.joinToString(", ")}")
        return true
    }

    fun parseData(line: String): TelemetryData? {
        val map = columnMap ?: return null
        val values = line.split('\t').map { it.trim() }

        if (values.size < map.size) {
            Log.w("VoltStar", "Incomplete data row: expected ${map.size}, got ${values.size}")
            return null
        }

        val valueMap = map.mapValues { (_, index) ->
            values.getOrNull(index) ?: ""
        }

        return try {
            // Extract all Cycle Analyst fields
            val ah = map["Ah"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val voltage = map["V"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val current = map["A"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val speed = map["S"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val distance = map["D"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val temperature = map["Deg"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val rpm = map["RPM"]?.let { values.getOrNull(it)?.toIntOrNull() }
            val humanWatts = map["HW"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val torque = map["Nm"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val throttleIn = map["ThI"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val throttleOut = map["ThO"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val auxAnalog = map["AuxA"]?.let { values.getOrNull(it)?.toDoubleOrNull() }
            val auxDigital = map["AuxD"]?.let { values.getOrNull(it)?.toIntOrNull() }
            val flagsRaw = map["Flgs"]?.let { values.getOrNull(it) }  // Keep as string
            val flagsInt = flagsRaw?.toIntOrNull()

            val flags = flagsInt?.let { FlagsDecoded.fromInt(it) }
            val power = if (voltage != null && current != null) voltage * current else null

            TelemetryData(
                timestamp = System.currentTimeMillis(),
                values = valueMap,
                ampHours = ah,
                voltage = voltage,
                current = current,
                speed = speed,
                distance = distance,
                temperature = temperature,
                rpm = rpm,
                humanWatts = humanWatts,
                torque = torque,
                throttleIn = throttleIn,
                throttleOut = throttleOut,
                auxAnalog = auxAnalog,
                auxDigital = auxDigital,
                flagsRaw = flagsRaw,
                flags = flags,
                electricalPower = power
            )
        } catch (e: Exception) {
            Log.e("VoltStar", "Parse error: ${e.message}")
            null
        }
    }
}

// ============================================================================
// TELEMETRY STATE
// ============================================================================

/**
 * Manages rolling buffers and derived values
 */
class TelemetryState {
    private val maxBufferSize = 100
    private val readings = ArrayDeque<TelemetryData>(maxBufferSize)

    @Synchronized
    fun add(data: TelemetryData) {
        readings.addLast(data)
        while (readings.size > maxBufferSize) {
            readings.removeFirst()
        }
    }

    @Synchronized
    fun getLatest(): TelemetryData? = readings.lastOrNull()

    @Synchronized
    fun getAll(): List<TelemetryData> = readings.toList()

    @Synchronized
    fun clear() = readings.clear()

    @Synchronized
    fun getAveragePower(seconds: Int = 10): Double? {
        val cutoff = System.currentTimeMillis() - (seconds * 1000)
        val recent = readings.filter { it.timestamp >= cutoff }
        return if (recent.isEmpty()) null else {
            recent.mapNotNull { it.electricalPower }.average()
        }
    }
}

// ============================================================================
// USB SERIAL MANAGER
// ============================================================================

/**
 * Manages USB serial connection and I/O
 */
class UsbSerialManager(
    private val context: Context,
    private val onDataReceived: (TelemetryData) -> Unit,
    private val onLog: (String, LogLevel) -> Unit,
    private val onConnectionChanged: (Boolean) -> Unit
) {
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private var serialPort: UsbSerialPort? = null
    private var ioManager: SerialInputOutputManager? = null
    private val framer = StreamFramer()
    private val parser = TelemetryParser()
    private var headerParsed = false

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_USB_PERMISSION -> {
                    synchronized(this) {
                        val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                        } else {
                            @Suppress("DEPRECATION")
                            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                        }

                        if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                            device?.let { connect(it) }
                        } else {
                            onLog("USB permission denied", LogLevel.ERROR)
                        }
                    }
                }
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    device?.let { requestPermission(it) }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    disconnect()
                }
            }
        }
    }

    private val listener = object : SerialInputOutputManager.Listener {
        override fun onNewData(data: ByteArray) {
            framer.addBytes(data, data.size)
            processLines()
        }

        override fun onRunError(e: Exception) {
            onLog("Serial error: ${e.message}", LogLevel.ERROR)
            disconnect()
        }
    }

    fun init() {
        val filter = IntentFilter().apply {
            addAction(ACTION_USB_PERMISSION)
            addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(usbReceiver, filter)
        }

        // Try to connect to existing device
        findAndConnect()
    }

    fun destroy() {
        try {
            context.unregisterReceiver(usbReceiver)
        } catch (e: Exception) {
            // Receiver not registered
        }
        disconnect()
        scope.cancel()
    }

    private fun findAndConnect() {
        val availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager)

        if (availableDrivers.isEmpty()) {
            onLog("No USB devices found", LogLevel.WARNING)
            return
        }

        val driver = availableDrivers[0]
        val device = driver.device

        if (usbManager.hasPermission(device)) {
            connect(device)
        } else {
            requestPermission(device)
        }
    }

    private fun requestPermission(device: UsbDevice) {
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val intent = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
        usbManager.requestPermission(device, intent)
        onLog("Requesting USB permission...", LogLevel.INFO)
    }

    private fun connect(device: UsbDevice) {
        try {
            val driver = UsbSerialProber.getDefaultProber().probeDevice(device)
            if (driver == null) {
                onLog("No driver for device", LogLevel.ERROR)
                return
            }

            val connection = usbManager.openDevice(device)
            if (connection == null) {
                onLog("Failed to open device", LogLevel.ERROR)
                return
            }

            val port = driver.ports[0]
            port.open(connection)
            port.setParameters(9600, 8, UsbSerialPort.STOPBITS_1, UsbSerialPort.PARITY_NONE)
            port.dtr = true
            port.rts = true

            serialPort = port

            ioManager = SerialInputOutputManager(port, listener).apply {
                readTimeout = 100
            }

            scope.launch(Dispatchers.IO) {
                ioManager?.run()
            }

            headerParsed = false
            onLog("Connected to ${device.deviceName}", LogLevel.INFO)
            onConnectionChanged(true)

        } catch (e: Exception) {
            onLog("Connection error: ${e.message}", LogLevel.ERROR)
            disconnect()
        }
    }

    fun disconnect() {
        ioManager?.stop()
        ioManager = null

        try {
            serialPort?.close()
        } catch (e: Exception) {
            // Ignore
        }
        serialPort = null

        headerParsed = false
        onConnectionChanged(false)
        onLog("Disconnected", LogLevel.WARNING)
    }

    private fun processLines() {
        val lines = framer.extractLines()

        for (line in lines) {
            if (!headerParsed) {
                if (line.contains("\t")) {
                    parser.parseHeader(line)
                    headerParsed = true
                    onLog("Header received", LogLevel.INFO)
                }
            } else {
                parser.parseData(line)?.let { data ->
                    onDataReceived(data)
                }
            }
        }
    }

    companion object {
        private const val ACTION_USB_PERMISSION = "com.abdulhayee.voltstar.USB_PERMISSION"
    }
}

// ============================================================================
// FIREBASE UPLOADER
// ============================================================================

/**
 * Handles Firebase uploads
 */
class FirebaseUploader {
    private val database = FirebaseDatabase.getInstance()
    private val readingsRef = database.getReference("cycle_readings")
    private val uploadQueue = ConcurrentLinkedQueue<TelemetryData>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    init {
        readingsRef.keepSynced(true)
        startUploadWorker()
    }

    fun enqueue(data: TelemetryData) {
        uploadQueue.offer(data)
    }

    private fun startUploadWorker() {
        scope.launch {
            while (isActive) {
                uploadQueue.poll()?.let { data ->
                    try {
                        val key = readingsRef.push().key ?: return@let
                        readingsRef.child(key).setValue(data.toFirebaseMap())
                    } catch (e: Exception) {
                        Log.e("VoltStar", "Firebase upload error: ${e.message}")
                    }
                }
                delay(100) // Batch uploads
            }
        }
    }

    fun destroy() {
        scope.cancel()
    }
}

// ============================================================================
// MAIN ACTIVITY
// ============================================================================

class MainActivity : ComponentActivity() {

    private val telemetryState = TelemetryState()
    private val firebaseUploader = FirebaseUploader()
    private lateinit var usbManager: UsbSerialManager

    private val _currentData = MutableStateFlow<TelemetryData?>(null)
    private val _isConnected = MutableStateFlow(false)
    private val _logs = MutableStateFlow<List<LogEntry>>(emptyList())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        usbManager = UsbSerialManager(
            context = this,
            onDataReceived = { data ->
                telemetryState.add(data)
                _currentData.value = data
                firebaseUploader.enqueue(data)
            },
            onLog = { message, level ->
                addLog(message, level)
            },
            onConnectionChanged = { connected ->
                _isConnected.value = connected
            }
        )

        usbManager.init()

        setContent {
            VoltStarTheme {
                MainScreen(
                    currentData = _currentData.collectAsState().value,
                    isConnected = _isConnected.collectAsState().value,
                    logs = _logs.collectAsState().value,
                    onDisconnect = { usbManager.disconnect() }
                )
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        usbManager.destroy()
        firebaseUploader.destroy()
    }

    private fun addLog(message: String, level: LogLevel) {
        val entry = LogEntry(System.currentTimeMillis(), message, level)
        _logs.value = (_logs.value + entry).takeLast(50)

        when (level) {
            LogLevel.INFO -> Log.i("VoltStar", message)
            LogLevel.WARNING -> Log.w("VoltStar", message)
            LogLevel.ERROR -> Log.e("VoltStar", message)
        }
    }
}

// ============================================================================
// UI THEME
// ============================================================================

object DashboardTheme {
    val MainBlack = Color(0xFF0A0E27)
    val CardBlack = Color(0xFF151B3D)
    val Blue = Color(0xFF4A9EFF)
    val Green = Color(0xFF00FF88)
    val Yellow = Color(0xFFFFD93D)
    val Red = Color(0xFFFF4757)
    val TextPrimary = Color(0xFFE8E8E8)
    val TextSecondary = Color(0xFF9CA3AF)
}

@Composable
fun VoltStarTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = DashboardTheme.Blue,
            background = DashboardTheme.MainBlack,
            surface = DashboardTheme.CardBlack
        ),
        content = content
    )
}

// ============================================================================
// UI SCREENS
// ============================================================================

@Composable
fun MainScreen(
    currentData: TelemetryData?,
    isConnected: Boolean,
    logs: List<LogEntry>,
    onDisconnect: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(DashboardTheme.MainBlack)
            .padding(16.dp)
    ) {
        // Header
        HeaderSection(isConnected = isConnected, onDisconnect = onDisconnect)

        Spacer(modifier = Modifier.height(16.dp))

        // Main telemetry display
        if (currentData != null) {
            TelemetryDisplay(data = currentData)
        } else {
            NoDataCard()
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Log section
        LogSection(logs = logs, modifier = Modifier.weight(1f))
    }
}

@Composable
fun HeaderSection(isConnected: Boolean, onDisconnect: () -> Unit) {
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DashboardTheme.CardBlack, RoundedCornerShape(12.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text(
                text = "VOLTSTAR",
                color = Color.White,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.sp
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .alpha(if (isConnected) alpha else 0.3f)
                        .background(
                            if (isConnected) DashboardTheme.Green else Color.Gray,
                            CircleShape
                        )
                )
                Text(
                    text = if (isConnected) "CONNECTED" else "DISCONNECTED",
                    color = if (isConnected) DashboardTheme.Green else Color.Gray,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }

        if (isConnected) {
            IconButton(
                onClick = onDisconnect,
                modifier = Modifier
                    .background(DashboardTheme.Red.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .border(1.dp, DashboardTheme.Red.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
            ) {
                Icon(
                    Icons.Default.PowerOff,
                    contentDescription = "Disconnect",
                    tint = DashboardTheme.Red
                )
            }
        }
    }
}

@Composable
fun TelemetryDisplay(data: TelemetryData) {
    // Display only the 4 required metrics: Ah, V, A, S
    // Optimized for landscape orientation
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DashboardTheme.CardBlack, RoundedCornerShape(12.dp))
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Voltage
        PrimaryMetricCard(
            label = "VOLTAGE",
            value = data.voltage?.let { "%.1f".format(it) } ?: "--",
            unit = "V",
            color = DashboardTheme.Blue,
            modifier = Modifier.weight(1f)
        )

        // Current
        PrimaryMetricCard(
            label = "CURRENT",
            value = data.current?.let { "%.1f".format(it) } ?: "--",
            unit = "A",
            color = DashboardTheme.Yellow,
            modifier = Modifier.weight(1f)
        )

        // Speed
        PrimaryMetricCard(
            label = "SPEED",
            value = data.speed?.let { "%.1f".format(it) } ?: "--",
            unit = "km/h",
            color = DashboardTheme.Green,
            modifier = Modifier.weight(1f)
        )

        // Amp Hours
        PrimaryMetricCard(
            label = "AMP HOURS",
            value = data.ampHours?.let { "%.2f".format(it) } ?: "--",
            unit = "Ah",
            color = DashboardTheme.Blue,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
fun PrimaryMetricCard(
    label: String,
    value: String,
    unit: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .background(DashboardTheme.MainBlack, RoundedCornerShape(8.dp))
            .border(2.dp, color.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = label,
            color = DashboardTheme.TextSecondary,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            letterSpacing = 1.sp
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = value,
            color = color,
            fontSize = 36.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = unit,
            color = DashboardTheme.TextSecondary,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            fontFamily = FontFamily.Monospace
        )
    }
}

@Composable
fun NoDataCard() {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(DashboardTheme.CardBlack, RoundedCornerShape(12.dp))
            .padding(32.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                Icons.Default.Cable,
                contentDescription = null,
                tint = DashboardTheme.TextSecondary,
                modifier = Modifier.size(48.dp)
            )
            Text(
                text = "Waiting for data...",
                color = DashboardTheme.TextSecondary,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace
            )
            Text(
                text = "Connect Cycle Analyst via USB",
                color = DashboardTheme.TextSecondary.copy(alpha = 0.6f),
                fontSize = 12.sp,
                fontFamily = FontFamily.Monospace
            )
        }
    }
}

@Composable
fun LogSection(logs: List<LogEntry>, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(DashboardTheme.CardBlack, RoundedCornerShape(12.dp))
            .padding(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "SYSTEM LOG",
                color = DashboardTheme.TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 1.sp
            )
            Text(
                text = "${logs.size} entries",
                color = DashboardTheme.TextSecondary.copy(alpha = 0.6f),
                fontSize = 10.sp,
                fontFamily = FontFamily.Monospace
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            logs.reversed().forEach { entry ->
                LogEntryRow(entry)
            }
        }
    }
}

@Composable
fun LogEntryRow(entry: LogEntry) {
    val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    val time = timeFormat.format(Date(entry.timestamp))

    val color = when (entry.level) {
        LogLevel.INFO -> DashboardTheme.Blue
        LogLevel.WARNING -> DashboardTheme.Yellow
        LogLevel.ERROR -> DashboardTheme.Red
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(DashboardTheme.MainBlack, RoundedCornerShape(4.dp))
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = time,
            color = DashboardTheme.TextSecondary.copy(alpha = 0.6f),
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace
        )
        Text(
            text = entry.message,
            color = color,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.weight(1f)
        )
    }
}