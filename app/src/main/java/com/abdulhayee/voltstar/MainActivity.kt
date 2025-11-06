package com.abdulhayee.voltstar

import android.app.Application
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.FirebaseApp
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.DatabaseReference
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.tasks.await
import java.io.BufferedReader
import java.io.InputStreamReader
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.absoluteValue

// Constants
object Constants {
    const val TAG = "VoltStar"
    const val MONITORING_INTERVAL_MS = 1000L
    const val ERROR_RETRY_DELAY_MS = 5000L
    const val BATCH_SIZE = 10
    const val MAX_LOG_ENTRIES = 100
    const val DEBUG = true

    // Voltage thresholds
    const val VOLTAGE_MIN = 45.0
    const val VOLTAGE_MAX = 58.0
    const val VOLTAGE_WARNING = 48.0

    // Current thresholds
    const val CURRENT_WARNING = 20.0
    const val CURRENT_REGEN_THRESHOLD = -2.0
}

// Data class for cycle data
data class CycleData(
    val ah: Double = 0.0,
    val voltage: Double = 0.0,
    val current: Double = 0.0,
    val speed: Double = 0.0,
    val distance: Double = 0.0,
    val degree: Double = 0.0,
    val rpm: Double = 0.0,
    val timestamp: Long = System.currentTimeMillis(),
    val deviceId: String = "VoltStar_Android"
) {
    val power: Double get() = voltage * current
    val isRegenerating: Boolean get() = current < Constants.CURRENT_REGEN_THRESHOLD

    fun toFirebaseMap(): Map<String, Any> = mapOf(
        "ah" to ah,
        "voltage" to voltage,
        "current" to current,
        "speed" to speed,
        "distance" to distance,
        "degree" to degree,
        "rpm" to rpm,
        "timestamp" to timestamp,
        "deviceId" to deviceId,
        "power" to power
    )
}

// UI State
sealed interface UiState {
    object NoFileSelected : UiState
    data class Success(val data: CycleData) : UiState
    data class Error(val message: String) : UiState
}

// Application class
class VoltStarApplication : Application() {
    companion object {
        lateinit var instance: VoltStarApplication
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        FirebaseApp.initializeApp(this)
        FirebaseDatabase.getInstance().apply {
            setPersistenceEnabled(true)
            setPersistenceCacheSizeBytes(10 * 1024 * 1024)
        }
    }
}

// Repository for data operations
class CycleAnalystRepository {
    private val database = FirebaseDatabase.getInstance()
    private val readingsRef = database.getReference("cycle_readings")
    private var lastFileSize: Long = 0L
    private var currentUri: Uri? = null
    private val lineParser = OptimizedLineParser()

    private val _connectionState = MutableStateFlow(false)
    val connectionState: StateFlow<Boolean> = _connectionState.asStateFlow()

    init {
        readingsRef.keepSynced(true)
    }

    fun setFileUri(uri: Uri) {
        currentUri = uri
        lastFileSize = 0L
        Log.d(Constants.TAG, "File URI set, position reset")
    }

    fun resetFilePosition() {
        lastFileSize = 0L
        Log.d(Constants.TAG, "File position reset to beginning")
    }

    suspend fun readNewData(context: Context): List<CycleData> = withContext(Dispatchers.IO) {
        val newData = mutableListOf<CycleData>()

        try {
            currentUri?.let { uri ->
                context.contentResolver.openInputStream(uri)?.use { inputStream ->
                    val allBytes = inputStream.readBytes()
                    val currentSize = allBytes.size.toLong()

                    // Check if file was reset or truncated
                    if (currentSize < lastFileSize) {
                        Log.d(Constants.TAG, "File reset detected (was: $lastFileSize, now: $currentSize)")
                        lastFileSize = 0L
                    }

                    // Only read if there's new data
                    if (currentSize > lastFileSize) {
                        // Extract only the new portion
                        val newBytes = if (lastFileSize > 0) {
                            allBytes.sliceArray(lastFileSize.toInt() until allBytes.size)
                        } else {
                            allBytes
                        }

                        val newText = String(newBytes, Charsets.UTF_8)
                        val lines = newText.split("\n")

                        Log.d(Constants.TAG, "Reading ${lines.size} new lines from position $lastFileSize")

                        var parsedCount = 0
                        lines.forEach { line ->
                            if (line.isNotBlank()) {
                                lineParser.parseLine(line)?.let { data ->
                                    newData.add(data)
                                    parsedCount++
                                }
                            }
                        }

                        lastFileSize = currentSize
                        Log.d(Constants.TAG, "Parsed $parsedCount valid data points from ${lines.size} lines, file position now: $lastFileSize bytes")
                    } else if (currentSize == lastFileSize) {
                        Log.d(Constants.TAG, "No new data (size unchanged: $currentSize bytes)")
                    }
                }
            } ?: run {
                Log.w(Constants.TAG, "No file URI set")
            }
        } catch (e: Exception) {
            Log.e(Constants.TAG, "Error reading file: ${e.message}", e)
            throw e
        }

        newData
    }

    suspend fun sendBatchToFirebase(batch: List<CycleData>) {
        if (batch.isEmpty()) return

        withContext(Dispatchers.IO) {
            var retries = 0
            var success = false

            while (!success && retries < 3) {
                try {
                    val updates = mutableMapOf<String, Any>()
                    batch.forEach { data ->
                        val key = readingsRef.push().key ?: return@forEach
                        updates["/$key"] = data.toFirebaseMap()
                    }

                    readingsRef.updateChildren(updates).await()
                    _connectionState.value = true
                    success = true

                    if (Constants.DEBUG) {
                        Log.d(Constants.TAG, "Batch sent successfully: ${batch.size} items")
                    }
                } catch (e: Exception) {
                    retries++
                    _connectionState.value = false
                    Log.e(Constants.TAG, "Failed to send batch: ${e.message}", e)

                    if (retries < 3) {
                        delay(1000L * retries) // Exponential backoff
                    } else {
                        throw e
                    }
                }
            }
        }
    }
    suspend fun sendSingleData(data: CycleData) {
        withContext(Dispatchers.IO) {
            try {
                readingsRef.push().setValue(data.toFirebaseMap()).await()
                _connectionState.value = true

                if (Constants.DEBUG) {
                    Log.d(Constants.TAG, "Single data sent: V=${data.voltage}, A=${data.current}, Speed=${data.speed}")
                }
            } catch (e: Exception) {
                _connectionState.value = false
                Log.e(Constants.TAG, "Failed to send data: ${e.message}", e)
                // Don't throw - allow monitoring to continue
            }
        }
    }
}

// Line parser with caching
class OptimizedLineParser {
    private val cache = mutableMapOf<String, CycleData?>()
    private val regex = Regex("[,\\s]+")

    fun parseLine(line: String): CycleData? {
        val trimmed = line.trim()

        // Check cache first
        cache[trimmed]?.let {
            return it
        }

        // Skip invalid lines
        if (trimmed.isEmpty() ||
            trimmed.contains("ah", ignoreCase = true) ||
            trimmed.contains("voltage", ignoreCase = true) ||
            trimmed.contains("Amp", ignoreCase = true)) {
            return null
        }

        val parts = trimmed.split(regex).filter { it.isNotEmpty() }

        if (parts.size < 7) {
            return null
        }

        return try {
            val data = CycleData(
                ah = parts[0].toDoubleOrNull() ?: 0.0,
                voltage = parts[1].toDoubleOrNull() ?: 0.0,
                current = parts[2].toDoubleOrNull() ?: 0.0,
                speed = parts[3].toDoubleOrNull() ?: 0.0,
                distance = parts[4].toDoubleOrNull() ?: 0.0,
                degree = parts[5].toDoubleOrNull() ?: 0.0,
                rpm = parts[6].toDoubleOrNull() ?: 0.0
            )

            // ← ADD VALIDATION
            if (data.voltage < 0 || data.voltage > 100) {
                Log.w(Constants.TAG, "Invalid voltage: ${data.voltage}")
                return null
            }
            if (data.current < -100 || data.current > 100) {
                Log.w(Constants.TAG, "Invalid current: ${data.current}")
                return null
            }

            // Cache if not full
            if (cache.size < Constants.MAX_LOG_ENTRIES) {
                cache[trimmed] = data
            }

            if (Constants.DEBUG) {
                Log.d(Constants.TAG, "✓ Parsed: V=${data.voltage}V, A=${data.current}A, Speed=${data.speed}km/h, Power=${data.power}W")
            }
            data
        } catch (e: Exception) {
            Log.e(Constants.TAG, "Parse error: ${e.message}")
            null
        }
    }
}

// ViewModel for state management
class CycleAnalystViewModel(
    private val repository: CycleAnalystRepository = CycleAnalystRepository()
) : ViewModel() {

    private val _uiState = MutableStateFlow<UiState>(UiState.NoFileSelected)
    val uiState: StateFlow<UiState> = _uiState.asStateFlow()

    val connectionState = repository.connectionState

    private var monitoringJob: Job? = null
    private var totalLinesProcessed = 0
    private val dataBuffer = mutableListOf<CycleData>()
    private var lastBatchSend = 0L

    fun startMonitoring(context: Context, uri: Uri) {
        stopMonitoring()
        totalLinesProcessed = 0
        dataBuffer.clear()

        repository.setFileUri(uri)
        _uiState.value = UiState.Success(CycleData())

        monitoringJob = viewModelScope.launch {
            monitoringLoop(context)
        }

        Log.d(Constants.TAG, "=== Monitoring started ===")
    }

    private suspend fun monitoringLoop(context: Context) {
        coroutineScope {
            while (isActive) {
                try {
                    val newData = repository.readNewData(context)

                    if (newData.isNotEmpty()) {
                        Log.d(Constants.TAG, "Processing ${newData.size} new data points")

                        // Update UI with the most recent data
                        _uiState.value = UiState.Success(newData.last())

                        // ← REPLACE INDIVIDUAL SENDS WITH BUFFER
                        dataBuffer.addAll(newData)
                        totalLinesProcessed += newData.size

                        // Send batch every 10 points OR every 5 seconds
                        val now = System.currentTimeMillis()
                        if (dataBuffer.size >= 10 || (now - lastBatchSend) >= 5000) {
                            repository.sendBatchToFirebase(dataBuffer.toList())
                            dataBuffer.clear()
                            lastBatchSend = now
                            Log.d(Constants.TAG, "Batch sent to Firebase")
                        }

                        Log.d(Constants.TAG, "Total lines processed this session: $totalLinesProcessed")
                    }

                    delay(Constants.MONITORING_INTERVAL_MS)

                } catch (e: CancellationException) {
                    // Flush remaining buffer before stopping
                    if (dataBuffer.isNotEmpty()) {
                        repository.sendBatchToFirebase(dataBuffer.toList()) }
                    throw e // Re-throw cancellation exceptions
                } catch (e: Exception) {
                    Log.e(Constants.TAG, "Monitoring error: ${e.message}", e)
                    _uiState.value = UiState.Error("Monitoring error: ${e.message}")
                    delay(Constants.ERROR_RETRY_DELAY_MS)
                }
            }
        }
    }

    fun stopMonitoring() {
        monitoringJob?.cancel()
        monitoringJob = null
        Log.d(Constants.TAG, "=== Monitoring stopped === (Total lines: $totalLinesProcessed)")
    }

    fun reset() {
        stopMonitoring()
        totalLinesProcessed = 0
        _uiState.value = UiState.NoFileSelected
        Log.d(Constants.TAG, "App reset")
    }

    fun refreshData() {
        repository.resetFilePosition()
        totalLinesProcessed = 0
        Log.d(Constants.TAG, "Data refresh - will re-read entire file")
    }

    override fun onCleared() {
        super.onCleared()
        stopMonitoring()
    }
}

// Theme colors
object VoltStarTheme {
    val PinkPurpleGradient = Brush.horizontalGradient(
        listOf(Color(0xFFE91E63), Color(0xFF9C27B0))
    )
    val RacingRed = Color(0xFFFF1744)
    val NeonGreen = Color(0xFF00E676)
    val RacingBlue = Color(0xFF00BCD4)
    val RacingOrange = Color(0xFFFF9800)
    val BackgroundDark = Color(0xFF0A0A0A)
    val SurfaceDark = Color(0xFF1A1A1A)
    val TextSecondary = Color(0xFF888888)
}

// Main Activity
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = Color.Black,
                    surface = VoltStarTheme.BackgroundDark,
                    primary = Color(0xFFE91E63),
                    secondary = Color(0xFF9C27B0)
                )
            ) {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    CycleAnalystApp()
                }
            }
        }
    }
}

// Main App Composable
@OptIn(ExperimentalAnimationApi::class)
@Composable
fun CycleAnalystApp(
    viewModel: CycleAnalystViewModel = viewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val isConnected by viewModel.connectionState.collectAsState()

    val fileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        uri?.let {
            context.contentResolver.takePersistableUriPermission(
                it,
                Intent.FLAG_GRANT_READ_URI_PERMISSION
            )
            viewModel.startMonitoring(context, it)
        }
    }

    AnimatedContent(
        targetState = uiState,
        transitionSpec = {
            fadeIn(animationSpec = tween(300)) with fadeOut(animationSpec = tween(300))
        },
        label = "MainScreenTransition"
    ) { state ->
        when (state) {
            is UiState.NoFileSelected -> {
                FileSelectionScreen(
                    onFileSelect = {
                        fileLauncher.launch(arrayOf("text/plain", "text/csv", "*/*"))
                    }
                )
            }
            is UiState.Success -> {
                OptimizedDashboard(
                    data = state.data,
                    isConnected = isConnected,
                    onStop = { viewModel.reset() },
                    onRefresh = { viewModel.refreshData() }
                )
            }
            is UiState.Error -> {
                ErrorScreen(
                    message = state.message,
                    onRetry = { viewModel.reset() },
                    onFileSelect = {
                        fileLauncher.launch(arrayOf("text/plain", "text/csv", "*/*"))
                    }
                )
            }
        }
    }
}

// Dashboard with metrics display
@Composable
fun OptimizedDashboard(
    data: CycleData,
    isConnected: Boolean,
    onStop: () -> Unit,
    onRefresh: () -> Unit
) {
    val voltageColor = remember(data.voltage) {
        when {
            data.voltage < Constants.VOLTAGE_MIN -> VoltStarTheme.RacingRed
            data.voltage > Constants.VOLTAGE_MAX -> VoltStarTheme.RacingRed
            data.voltage < Constants.VOLTAGE_WARNING -> VoltStarTheme.RacingOrange
            else -> Color(0xFFE91E63)
        }
    }

    val currentColor = remember(data.current) {
        when {
            data.current.absoluteValue > Constants.CURRENT_WARNING -> VoltStarTheme.RacingRed
            data.current > 0 -> VoltStarTheme.RacingRed
            else -> VoltStarTheme.NeonGreen
        }
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Primary metrics column
        Column(
            modifier = Modifier.weight(2f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            LargeMetricCard(
                label = "SPEED",
                value = "%.1f".format(data.speed),
                unit = "km/h",
                color = VoltStarTheme.NeonGreen,
                modifier = Modifier.weight(1f)
            )
            LargeMetricCard(
                label = "VOLTAGE",
                value = "%.1f".format(data.voltage),
                unit = "V",
                color = voltageColor,
                modifier = Modifier.weight(1f)
            )
        }

        // Secondary metrics column
        Column(
            modifier = Modifier.weight(1.5f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricCard(
                label = "CURRENT",
                value = "%.1f".format(data.current),
                unit = "A",
                color = currentColor,
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "RPM",
                value = "%.0f".format(data.rpm),
                unit = "",
                color = VoltStarTheme.RacingBlue,
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "DISTANCE",
                value = "%.2f".format(data.distance),
                unit = "km",
                color = Color(0xFF00E5FF),
                modifier = Modifier.weight(1f)
            )
        }

        // Tertiary metrics column
        Column(
            modifier = Modifier.weight(1.5f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            MetricCard(
                label = "Ah USED",
                value = "%.2f".format(data.ah),
                unit = "Ah",
                color = VoltStarTheme.RacingOrange,
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "DEGREE",
                value = "%.1f".format(data.degree),
                unit = "°",
                color = Color(0xFFFFEB3B),
                modifier = Modifier.weight(1f)
            )
            MetricCard(
                label = "POWER",
                value = "%.0f".format(data.power),
                unit = "W",
                color = Color(0xFFFF5722),
                modifier = Modifier.weight(1f)
            )
        }

        // Controls column
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            ControlCard(
                onStop = onStop,
                onRefresh = onRefresh,
                modifier = Modifier.weight(1f)
            )
            StatusCard(
                timestamp = data.timestamp,
                isConnected = isConnected,
                modifier = Modifier.weight(1f)
            )
        }
    }
}

// Large metric display card
@Composable
fun LargeMetricCard(
    label: String,
    value: String,
    unit: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = VoltStarTheme.BackgroundDark),
        shape = RoundedCornerShape(12.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceEvenly
        ) {
            Text(
                text = label,
                fontFamily = FontFamily.Monospace,
                fontSize = 16.sp,
                color = VoltStarTheme.TextSecondary,
                letterSpacing = 2.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = value,
                fontFamily = FontFamily.Monospace,
                fontSize = 42.sp,
                color = color,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = unit,
                fontFamily = FontFamily.Monospace,
                fontSize = 18.sp,
                color = VoltStarTheme.TextSecondary,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

// Standard metric display card
@Composable
fun MetricCard(
    label: String,
    value: String,
    unit: String,
    color: Color,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = VoltStarTheme.BackgroundDark),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceEvenly
        ) {
            Text(
                text = label,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                color = VoltStarTheme.TextSecondary,
                letterSpacing = 1.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = value,
                fontFamily = FontFamily.Monospace,
                fontSize = 24.sp,
                color = color,
                fontWeight = FontWeight.Bold
            )
            if (unit.isNotEmpty()) {
                Text(
                    text = unit,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 12.sp,
                    color = VoltStarTheme.TextSecondary,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

// Control buttons card
@Composable
fun ControlCard(
    onStop: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = VoltStarTheme.SurfaceDark),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(8.dp),
            verticalArrangement = Arrangement.SpaceEvenly,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            IconButton(
                onClick = onStop,
                modifier = Modifier
                    .size(40.dp)
                    .background(VoltStarTheme.RacingRed, CircleShape)
            ) {
                Icon(
                    Icons.Default.Stop,
                    contentDescription = "Stop",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
            IconButton(
                onClick = onRefresh,
                modifier = Modifier
                    .size(40.dp)
                    .background(VoltStarTheme.PinkPurpleGradient, CircleShape)
            ) {
                Icon(
                    Icons.Default.Refresh,
                    contentDescription = "Refresh",
                    tint = Color.White,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

// Status display card
@Composable
fun StatusCard(
    timestamp: Long,
    isConnected: Boolean,
    modifier: Modifier = Modifier
) {
    val formatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    val timeString = remember(timestamp) { formatter.format(Date(timestamp)) }

    val infiniteTransition = rememberInfiniteTransition(label = "ConnectionIndicator")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.3f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "ConnectionPulse"
    )

    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = VoltStarTheme.SurfaceDark),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            verticalArrangement = Arrangement.SpaceEvenly,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "TIME",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    color = VoltStarTheme.TextSecondary,
                    letterSpacing = 1.sp
                )
                Text(
                    text = timeString,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 14.sp,
                    color = Color.White,
                    fontWeight = FontWeight.Bold
                )
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .alpha(if (isConnected) alpha else 0.3f)
                        .background(
                            if (isConnected) VoltStarTheme.NeonGreen else Color.Gray,
                            CircleShape
                        )
                )
                Text(
                    text = "FIREBASE",
                    fontFamily = FontFamily.Monospace,
                    fontSize = 8.sp,
                    color = if (isConnected) VoltStarTheme.NeonGreen else Color.Gray,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

// File selection screen
@Composable
fun FileSelectionScreen(onFileSelect: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .background(
                        brush = VoltStarTheme.PinkPurpleGradient,
                        shape = RoundedCornerShape(20.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "VS",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 32.sp,
                    color = Color.White,
                    letterSpacing = 2.sp
                )
            }
            Text(
                text = "VOLTSTAR",
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 28.sp,
                color = Color.White,
                letterSpacing = 3.sp
            )
            Button(
                onClick = onFileSelect,
                modifier = Modifier
                    .width(200.dp)
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFE91E63)
                ),
                shape = RoundedCornerShape(12.dp)
            ) {
                Icon(
                    Icons.Default.FolderOpen,
                    contentDescription = null,
                    modifier = Modifier.size(24.dp),
                    tint = Color.White
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "CHOOSE CA LOG",
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

// Error screen
@Composable
fun ErrorScreen(message: String, onRetry: () -> Unit, onFileSelect: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(24.dp),
            modifier = Modifier.padding(32.dp)
        ) {
            Icon(
                Icons.Default.Warning,
                contentDescription = null,
                tint = VoltStarTheme.RacingRed,
                modifier = Modifier.size(80.dp)
            )
            Text(
                text = "ERROR",
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp,
                color = VoltStarTheme.RacingRed,
                letterSpacing = 3.sp
            )
            Text(
                text = message,
                fontFamily = FontFamily.Monospace,
                fontSize = 14.sp,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 16.dp)
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = VoltStarTheme.RacingOrange
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("RETRY", letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                }
                Button(
                    onClick = onFileSelect,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFFE91E63)
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.FolderOpen, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("NEW FILE", letterSpacing = 1.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
