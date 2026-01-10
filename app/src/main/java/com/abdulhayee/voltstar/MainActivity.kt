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
import androidx.compose.foundation.border
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

                    if (currentSize < lastFileSize) {
                        Log.d(Constants.TAG, "File reset detected (was: $lastFileSize, now: $currentSize)")
                        lastFileSize = 0L
                    }

                    if (currentSize > lastFileSize) {
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
                        Log.d(Constants.TAG, "Parsed $parsedCount valid data points from ${lines.size} lines")
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
                        Log.d(Constants.TAG, "✓ Batch sent successfully: ${batch.size} items")
                    }
                } catch (e: Exception) {
                    retries++
                    _connectionState.value = false
                    Log.e(Constants.TAG, "✗ Failed to send batch (attempt $retries): ${e.message}", e)

                    if (retries < 3) {
                        delay(1000L * retries)
                    } else {
                        throw e
                    }
                }
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

        cache[trimmed]?.let {
            return it
        }

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

            if (data.voltage < 0 || data.voltage > 100) {
                Log.w(Constants.TAG, "Invalid voltage: ${data.voltage}")
                return null
            }
            if (data.current < -100 || data.current > 100) {
                Log.w(Constants.TAG, "Invalid current: ${data.current}")
                return null
            }

            if (cache.size < Constants.MAX_LOG_ENTRIES) {
                cache[trimmed] = data
            }

            if (Constants.DEBUG) {
                Log.d(Constants.TAG, "✓ Parsed: V=${data.voltage}V, A=${data.current}A, Speed=${data.speed}km/h")
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

        Log.d(Constants.TAG, "=== File monitoring started ===")
    }

    private suspend fun monitoringLoop(context: Context) {
        coroutineScope {
            while (isActive) {
                try {
                    val newDataList = repository.readNewData(context)

                    if (newDataList.isNotEmpty()) {
                        val latestData = newDataList.last()
                        _uiState.value = UiState.Success(latestData)

                        dataBuffer.addAll(newDataList)
                        totalLinesProcessed += newDataList.size

                        val now = System.currentTimeMillis()
                        if (dataBuffer.size >= Constants.BATCH_SIZE || (now - lastBatchSend) >= 5000) {
                            repository.sendBatchToFirebase(dataBuffer.toList())
                            dataBuffer.clear()
                            lastBatchSend = now

                            if (Constants.DEBUG) {
                                Log.d(Constants.TAG, "✓ Processed: ${newDataList.size} new lines (Total: $totalLinesProcessed)")
                            }
                        }
                    }

                    delay(Constants.MONITORING_INTERVAL_MS)

                } catch (e: CancellationException) {
                    if (dataBuffer.isNotEmpty()) {
                        repository.sendBatchToFirebase(dataBuffer.toList())
                    }
                    throw e
                } catch (e: Exception) {
                    Log.e(Constants.TAG, "Monitoring error: ${e.message}", e)
                    _uiState.value = UiState.Error("File error: ${e.message}")
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
object DashboardTheme {
    val MainBlack = Color(0xFF0D0D0D)
    val CardBlack = Color(0xFF1A1A1A)
    val Red = Color(0xFFFF3B30)
    val Yellow = Color(0xFFFFCC00)
    val Green = Color(0xFF34C759)
    val Blue = Color(0xFF007AFF)
    val TextPrimary = Color(0xFFFFFFFF)
    val TextSecondary = Color(0xFF8E8E93)
}

// Main Activity
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE

        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    background = DashboardTheme.MainBlack,
                    surface = DashboardTheme.CardBlack,
                    primary = DashboardTheme.Blue,
                    secondary = DashboardTheme.Green
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
                ModernDashboard(
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

// Modern Dashboard (No Scrolling)
@Composable
fun ModernDashboard(
    data: CycleData,
    isConnected: Boolean,
    onStop: () -> Unit,
    onRefresh: () -> Unit
) {
    val speedColor = DashboardTheme.Green
    val voltageColor = remember(data.voltage) {
        when {
            data.voltage < Constants.VOLTAGE_MIN -> DashboardTheme.Red
            data.voltage > Constants.VOLTAGE_MAX -> DashboardTheme.Red
            data.voltage < Constants.VOLTAGE_WARNING -> DashboardTheme.Yellow
            else -> DashboardTheme.Green
        }
    }
    val currentColor = remember(data.current) {
        when {
            data.current.absoluteValue > Constants.CURRENT_WARNING -> DashboardTheme.Red
            data.current < 0 -> DashboardTheme.Green
            else -> DashboardTheme.Yellow
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DashboardTheme.MainBlack)
    ) {
        Row(
            modifier = Modifier
                .fillMaxSize()
                .padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Column(
                modifier = Modifier
                    .weight(0.4f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                PrimaryMetricCard(
                    label = "SPEED",
                    value = "%.0f".format(data.speed),
                    unit = "km/h",
                    color = speedColor,
                    modifier = Modifier.weight(1f)
                )

                PrimaryMetricCard(
                    label = "VOLTAGE",
                    value = "%.1f".format(data.voltage),
                    unit = "V",
                    color = voltageColor,
                    modifier = Modifier.weight(1f)
                )
            }

            Column(
                modifier = Modifier
                    .weight(0.35f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CompactMetricCard(
                    label = "CURRENT",
                    value = "%.1f".format(data.current),
                    unit = "A",
                    color = currentColor
                )
                CompactMetricCard(
                    label = "POWER",
                    value = "%.0f".format(data.power),
                    unit = "W",
                    color = DashboardTheme.Blue
                )
                CompactMetricCard(
                    label = "RPM",
                    value = "%.0f".format(data.rpm),
                    unit = "",
                    color = DashboardTheme.Blue
                )
            }

            Column(
                modifier = Modifier
                    .weight(0.25f)
                    .fillMaxHeight(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                CompactMetricCard(
                    label = "DISTANCE",
                    value = "%.2f".format(data.distance),
                    unit = "km",
                    color = DashboardTheme.Green
                )
                CompactMetricCard(
                    label = "Ah USED",
                    value = "%.2f".format(data.ah),
                    unit = "Ah",
                    color = DashboardTheme.Yellow
                )

                StatusControlCard(
                    timestamp = data.timestamp,
                    isConnected = isConnected,
                    onStop = onStop,
                    onRefresh = onRefresh,
                    modifier = Modifier.weight(1f)
                )
            }
        }

        TopBar()
    }
}

@Composable
fun TopBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .background(DashboardTheme.Blue, RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "VS",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
            Text(
                text = "VOLTSTAR",
                color = DashboardTheme.TextPrimary,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.sp
            )
        }
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
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = DashboardTheme.CardBlack),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                .padding(20.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = label,
                    color = DashboardTheme.TextSecondary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.5.sp
                )
                Text(
                    text = value,
                    color = color,
                    fontSize = 56.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
                Text(
                    text = unit,
                    color = DashboardTheme.TextSecondary,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    }
}

@Composable
fun CompactMetricCard(
    label: String,
    value: String,
    unit: String,
    color: Color
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .height(70.dp),
        colors = CardDefaults.cardColors(containerColor = DashboardTheme.CardBlack),
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .border(1.dp, color.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                .padding(horizontal = 16.dp, vertical = 8.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = label,
                    color = DashboardTheme.TextSecondary,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
                Row(
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = value,
                        color = color,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                    if (unit.isNotEmpty()) {
                        Text(
                            text = unit,
                            color = DashboardTheme.TextSecondary,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            fontFamily = FontFamily.Monospace,
                            modifier = Modifier.padding(bottom = 4.dp)
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun StatusControlCard(
    timestamp: Long,
    isConnected: Boolean,
    onStop: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier
) {
    val formatter = remember { SimpleDateFormat("HH:mm:ss", Locale.getDefault()) }
    val timeString = remember(timestamp) { formatter.format(Date(timestamp)) }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.4f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = DashboardTheme.CardBlack),
        shape = RoundedCornerShape(8.dp),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "TIME",
                    color = DashboardTheme.TextSecondary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = timeString,
                    color = Color.White,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .alpha(if (isConnected) alpha else 0.3f)
                        .background(
                            if (isConnected) DashboardTheme.Green else Color.Gray,
                            CircleShape
                        )
                )
                Text(
                    text = if (isConnected) "ONLINE" else "OFFLINE",
                    color = if (isConnected) DashboardTheme.Green else Color.Gray,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
            }

            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                IconButton(
                    onClick = onRefresh,
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp)
                        .background(
                            DashboardTheme.Yellow.copy(alpha = 0.15f),
                            RoundedCornerShape(6.dp)
                        )
                        .border(
                            1.dp,
                            DashboardTheme.Yellow.copy(alpha = 0.3f),
                            RoundedCornerShape(6.dp)
                        )
                ) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = "Refresh",
                        tint = DashboardTheme.Yellow,
                        modifier = Modifier.size(20.dp)
                    )
                }
                IconButton(
                    onClick = onStop,
                    modifier = Modifier
                        .weight(1f)
                        .height(40.dp)
                        .background(
                            DashboardTheme.Red.copy(alpha = 0.15f),
                            RoundedCornerShape(6.dp)
                        )
                        .border(
                            1.dp,
                            DashboardTheme.Red.copy(alpha = 0.3f),
                            RoundedCornerShape(6.dp)
                        )
                ) {
                    Icon(
                        Icons.Default.Stop,
                        contentDescription = "Stop",
                        tint = DashboardTheme.Red,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun FileSelectionScreen(onFileSelect: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DashboardTheme.MainBlack),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(32.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(DashboardTheme.Blue, RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "VS",
                    color = Color.White,
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
            Text(
                text = "VOLTSTAR",
                color = Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 4.sp
            )
            Button(
                onClick = onFileSelect,
                modifier = Modifier
                    .width(240.dp)
                    .height(56.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = DashboardTheme.Blue
                ),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(
                    Icons.Default.FolderOpen,
                    contentDescription = null,
                    tint = Color.White
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "LOAD CA FILE",
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 1.sp
                )
            }
        }
    }
}

@Composable
fun ErrorScreen(message: String, onRetry: () -> Unit, onFileSelect: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DashboardTheme.MainBlack),
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
                tint = DashboardTheme.Red,
                modifier = Modifier.size(64.dp)
            )
            Text(
                text = "ERROR",
                color = DashboardTheme.Red,
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                letterSpacing = 2.sp
            )
            Text(
                text = message,
                color = DashboardTheme.TextSecondary,
                fontSize = 14.sp,
                fontFamily = FontFamily.Monospace,
                textAlign = TextAlign.Center
            )
            Row(
                horizontalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Button(
                    onClick = onRetry,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DashboardTheme.Yellow
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(
                        Icons.Default.Refresh,
                        contentDescription = null,
                        tint = Color.Black
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "RETRY",
                        color = Color.Black,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
                Button(
                    onClick = onFileSelect,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = DashboardTheme.Blue
                    ),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.FolderOpen, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "NEW FILE",
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }
        }
    }
}