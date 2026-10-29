package com.netmate.app
import android.app.Application
/** Both processes deliberately initialize only platform Application state. */
class MainApplication : Application() {
    override fun onCreate() { super.onCreate() }
}
