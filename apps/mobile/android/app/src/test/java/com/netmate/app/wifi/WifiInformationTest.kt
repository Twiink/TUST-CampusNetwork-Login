package com.netmate.app.wifi
import com.netmate.app.auth.WifiFacts
import org.junit.Assert.assertEquals
import org.junit.Test
class WifiInformationTest {
    @Test fun channelsCoverAllThreeBandsAndUnknownValues() {
        for ((frequency, channel) in listOf(2412 to 1, 2484 to 14, 5180 to 36, 5935 to 2, 5955 to 1, 7115 to 233, 0 to 0)) assertEquals(channel, WifiFacts.channel(frequency))
    }
}
