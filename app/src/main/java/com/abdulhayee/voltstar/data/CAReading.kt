package com.abdulhayee.voltstar.data

import java.text.SimpleDateFormat
import java.util.*

// data class for cycle analyst readings
data class CAReading(
    val ah: Double = 0.0,
    val voltage: Double = 0.0,
    val current: Double = 0.0,
    val speed: Double = 0.0,
    val distance: Double = 0.0,
    val timestamp: Long = System.currentTimeMillis()
) {
    val power: Double get() = voltage * current

    fun toFirebaseMap(): Map<String, Any> = mapOf(
        "ah" to ah,
        "voltage" to voltage,
        "current" to current,
        "speed" to speed,
        "distance" to distance,
        "power" to power,
        "timestamp" to timestamp,
        "deviceId" to "VoltStar_Android"
    )

    fun toCsvLine(): String =
        "${SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(timestamp))}," +
                "$ah,$voltage,$current,$speed,$distance,$power\n"
}