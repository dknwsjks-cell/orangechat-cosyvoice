package me.rerere.rikkahub.data.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import me.rerere.rikkahub.CHAT_COMPLETED_NOTIFICATION_CHANNEL_ID
import me.rerere.rikkahub.data.datastore.SettingsStore
import okhttp3.OkHttpClient
import okhttp3.Request
import org.koin.core.context.GlobalContext
import java.util.concurrent.TimeUnit

/**
 * 网关轮询服务
 *
 * 解决"云端网关访问不到手机橘瓣内网"的网络拓扑问题：让橘瓣每隔 15 分钟主动向
 * 网关的 [GET /api/proactive/poll] 查询"当前是否有该主动说话的信号"。
 *
 * - 定时权仍在网关（网关心跳决定 MSG 时刻）；
 * - 橘瓣只是每 15 分钟来问一次，网关回答"该/不该"；
 * - 网关说"该"（pending=true）时，橘瓣启动 [ProactiveMessageTriggerService] 走自己的
 *   完整聊天流程（MCP/插件/搜索/生图等工具全在线），产物留在橘瓣会话里。
 *
 * 调度模式照抄 [SupabaseSyncService]：纯 AlarmManager + BroadcastReceiver（同时处理
 * alarm 触发和 ACTION_BOOT_COMPLETED 重排），app 被杀后系统到点仍能拉起。
 */
class GatewayPollService : Service() {

    companion object {
        private const val TAG = "GatewayPollService"
        const val ACTION_GATEWAY_POLL = "me.rerere.rikkahub.GATEWAY_POLL"
        private const val REQUEST_CODE = 10004
        private const val INTERVAL_MS = 15 * 60 * 1000L // 15 分钟（AlarmManager 推荐最小周期）

        fun scheduleNext(context: Context) {
            val triggerTime = System.currentTimeMillis() + INTERVAL_MS

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, GatewayPollReceiver::class.java).apply {
                action = ACTION_GATEWAY_POLL
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Android 12+ 需要 canScheduleExactAlarms 检查，否则降级为 inexact
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                if (alarmManager.canScheduleExactAlarms()) {
                    alarmManager.setExactAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                } else {
                    alarmManager.setAndAllowWhileIdle(
                        AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                    )
                }
            } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent
                )
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent)
            }

            Log.d(TAG, "Scheduled next gateway poll at ${java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(triggerTime))}")
        }

        fun cancel(context: Context) {
            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val intent = Intent(context, GatewayPollReceiver::class.java).apply {
                action = ACTION_GATEWAY_POLL
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                REQUEST_CODE,
                intent,
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            )
            pendingIntent?.let {
                alarmManager.cancel(it)
                Log.d(TAG, "Cancelled gateway poll alarm")
            }
        }

        /**
         * 立即触发一次轮询（用于测试/手动触发）。
         * 直接启动 Service，不经过广播，绕过华为系统对后台 startForegroundService 的限制。
         * 调用方必须处于前台（如用户在设置页点按钮）。
         */
        fun triggerNow(context: Context) {
            Log.d(TAG, "triggerNow: manually triggering a poll")
            // 注意：这是外部触发，真正跑 AI 生成的是 ProactiveMessageTriggerService。
            // 手动 poll 时强制触发 TriggerService 并跳过内部 minInterval 去重，避免被自己的定时器保护吞掉。
            val intent = Intent(context, GatewayPollService::class.java)
            try {
                context.startForegroundService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "triggerNow: startForegroundService failed", e)
            }
        }

        /**
         * 立即触发一次主动消息生成（用于网关轮询到 pending=true 时）。
         * 带 EXTRA_FORCE_TRIGGER，绕过 ProactiveMessageTriggerService 的 minInterval 去重。
         */
        fun triggerProactiveMessageNow(context: Context) {
            Log.d(TAG, "triggerProactiveMessageNow: force starting ProactiveMessageTriggerService")
            val intent = Intent(context, ProactiveMessageTriggerService::class.java).apply {
                putExtra(ProactiveMessageTriggerService.EXTRA_FORCE_TRIGGER, true)
            }
            try {
                context.startForegroundService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "triggerProactiveMessageNow: startForegroundService failed", e)
            }
        }

        fun rescheduleIfEnabled(context: Context) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val settingsStore = GlobalContext.get().get<SettingsStore>()
                    val settings = settingsStore.settingsFlowRaw.first()
                    if (settings.gatewayPollEnabled &&
                        settings.gatewayPollUrl.isNotBlank() &&
                        settings.gatewayPollApiSecret.isNotBlank()
                    ) {
                        scheduleNext(context)
                        Log.d(TAG, "Rescheduled gateway poll")
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to reschedule gateway poll", e)
                }
            }
        }
    }

    private val json = Json { ignoreUnknownKeys = true }

    // 短超时 client（轮询是轻量 GET，不要用 AI 流式的 10 分钟超时）
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notification = androidx.core.app.NotificationCompat.Builder(this, CHAT_COMPLETED_NOTIFICATION_CHANNEL_ID)
                .setContentTitle("检查中...")
                .setSmallIcon(me.rerere.rikkahub.R.drawable.small_icon)
                .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MIN)
                .build()
            startForeground(20004, notification)
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
            scheduleNext(this)
            stopSelf()
            return START_NOT_STICKY
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val settingsStore = GlobalContext.get().get<SettingsStore>()
                val settings = settingsStore.settingsFlowRaw.first()

                // 配置不全直接排下次（保持链不断），不报错
                if (!settings.gatewayPollEnabled ||
                    settings.gatewayPollUrl.isBlank() ||
                    settings.gatewayPollApiSecret.isBlank()
                ) {
                    Log.d(TAG, "Gateway poll disabled or config incomplete, skip")
                    return@launch
                }

                val baseUrl = settings.gatewayPollUrl.trimEnd('/')
                val url = "$baseUrl/api/proactive/poll"
                val request = Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer ${settings.gatewayPollApiSecret}")
                    .get()
                    .build()

                val response = httpClient.newCall(request).execute()
                val body = response.use { resp ->
                    if (!resp.isSuccessful) {
                        Log.w(TAG, "Poll returned ${resp.code}, body: ${resp.body?.string()?.take(200)}")
                        return@launch
                    }
                    resp.body?.string()
                } ?: return@launch

                val parsed = runCatching { json.parseToJsonElement(body).jsonObject }.getOrNull()
                val pending = runCatching {
                    parsed?.get("pending")?.jsonPrimitive?.boolean == true
                }.getOrDefault(false)
                Log.d(TAG, "Poll result: pending=$pending, body=${body.take(200)}")

                if (pending) {
                    // 网关说"该主动说话了"——启动橘瓣自己的主动消息流水线（工具全在线）
                    // 带 EXTRA_FORCE_TRIGGER 绕过内部 minInterval 去重，否则网关信号可能被自己的定时器保护吞掉
                    GatewayPollService.triggerProactiveMessageNow(this@GatewayPollService)
                    Log.d(TAG, "Started ProactiveMessageTriggerService from gateway poll")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Gateway poll error", e)
            } finally {
                // 无论成功失败都排下一次，保证链不断
                scheduleNext(this@GatewayPollService)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

class GatewayPollReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            GatewayPollService.ACTION_GATEWAY_POLL -> {
                Log.d("GatewayPollService", "Gateway poll alarm triggered")
                val serviceIntent = Intent(context, GatewayPollService::class.java)
                try {
                    context.startForegroundService(serviceIntent)
                } catch (e: Exception) {
                    Log.e("GatewayPollService", "Failed to start service from receiver", e)
                }
            }
            Intent.ACTION_BOOT_COMPLETED -> {
                Log.d("GatewayPollService", "Boot completed, rescheduling gateway poll")
                GatewayPollService.rescheduleIfEnabled(context)
            }
        }
    }
}
