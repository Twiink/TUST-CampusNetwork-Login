package com.netmate.app.auth

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * WorkManager 周期兜底：前台服务被系统或厂商省电策略杀掉后，
 * 仍能以系统允许的最短间隔（15 分钟）检查并补登。WorkManager 任务在重启后自动恢复。
 */
class AutoAuthWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

    companion object {
        private const val UNIQUE_NAME = "netmate-auto-auth-periodic"
        const val TRIGGER = "worker"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<AutoAuthWorker>(15, TimeUnit.MINUTES).build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context.applicationContext).cancelUniqueWork(UNIQUE_NAME)
        }
    }

    override fun doWork(): Result {
        AutoAuthEngine.checkBlocking(applicationContext, TRIGGER)
        // 检查本身的失败（未认证、密码错误）由引擎退避处理，周期任务始终视为成功
        return Result.success()
    }
}
