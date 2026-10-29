package com.netmate.app.auth
object WifiFacts {
    fun channel(frequency: Int): Int = when {
        frequency == 2484 -> 14
        frequency in 2412..2472 -> (frequency - 2407) / 5
        frequency == 5935 -> 2
        frequency in 5955..7115 -> (frequency - 5950) / 5
        frequency in 5000..5900 -> (frequency - 5000) / 5
        else -> 0
    }
}
