package com.abdulhayee.voltstar.ui.theme

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color

// web app colors baby - copied straight from css
object VoltStarTheme {
    val BgPrimary = Color(0xFF0A0E1A)
    val BgSecondary = Color(0xFF151932)
    val BgTertiary = Color(0xFF1E2642)
    val BgCard = Color(0xFF1E2642).copy(alpha = 0.8f)
    val BorderColor = Color(0xFF2D3454)
    val TextPrimary = Color(0xFFE2E8F0)
    val TextSecondary = Color(0xFF94A3B8)
    val TextMuted = Color(0xFF64748B)
    val ColorPrimary = Color(0xFF00D9FF) // that electric cyan
    val ColorSecondary = Color(0xFFFF006E) // hot pink
    val ColorSuccess = Color(0xFF00FF88) // neon green
    val ColorWarning = Color(0xFFFFAA00) // orange
    val ColorDanger = Color(0xFFFF3366) // red
    val ColorAccent = Color(0xFF7C3AED) // purple

    val PrimaryGradient = Brush.horizontalGradient(
        listOf(ColorPrimary, ColorAccent)
    )
}