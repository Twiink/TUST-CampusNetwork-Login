package com.netmate.app.auth
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
/** OS-managed fallback executes in :network, preserving a single engine owner. */
class AutoAuthWorker : JobService() {
    companion object {
        const val TRIGGER = "worker"
        private const val ID = 4712
        fun schedule(context: Context) { context.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(ID, ComponentName(context, AutoAuthWorker::class.java)).setPeriodic(15 * 60_000L).setPersisted(true).build()) }
        fun cancel(context: Context) { context.getSystemService(JobScheduler::class.java).cancel(ID) }
    }
    private var active: JobParameters? = null
    private var task: java.util.concurrent.Future<AutoAuthResult?>? = null
    private var waiter: Thread? = null
    private val main = android.os.Handler(android.os.Looper.getMainLooper())
    override fun onStartJob(params: JobParameters): Boolean {
        active = params
        val work = AutoAuthEngine.checkForJob(applicationContext)
        task = work
        waiter = Thread({
            val retry = runCatching { work.get() }.isFailure
            main.post { if (active === params) { active=null; task=null; waiter=null; jobFinished(params,retry) } }
        }, "netmate-job").apply { start() }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean {
        active=null; task?.cancel(true); task=null; waiter?.interrupt(); waiter=null
        return true
    }
    override fun onDestroy() { active=null; task?.cancel(true); waiter?.interrupt(); main.removeCallbacksAndMessages(null); super.onDestroy() }
}
