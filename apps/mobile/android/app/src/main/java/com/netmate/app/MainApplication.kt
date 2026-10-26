package com.netmate.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.netmate.app.wifi.WifiPackage
import com.netmate.app.service.BackgroundServicePackage
import com.netmate.app.receiver.AutoStartPackage
import com.netmate.app.auth.AutoAuthPackage
import com.netmate.app.permission.PermissionPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(WifiPackage())
          add(BackgroundServicePackage())
          add(AutoStartPackage())
          add(AutoAuthPackage())
          add(PermissionPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
