# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ============================================================
# React Native 核心（React Native Gradle Plugin 已附带大部分规则，
# 各三方库通过 consumer-rules.pro 自动注入；此处补充应用自身与保险起见的 keep）
# ============================================================

# 保留 React Native 桥接相关注解与方法，避免 R8 误删 @ReactMethod 等
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod <methods>;
}
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ============================================================
# 应用自身原生模块（通过 ReactPackage 反射/注册加载，须完整保留）
# 对应 WifiModule / AutoStartModule / BootReceiver / BackgroundService 等
# ============================================================
-keep class com.mobile.** { *; }

# BootReceiver 等 Android 组件由系统按类名反射实例化，必须保留
-keep class * extends android.content.BroadcastReceiver { *; }
-keep class * extends android.app.Service { *; }

# ============================================================
# Hermes（若使用）
# ============================================================
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
