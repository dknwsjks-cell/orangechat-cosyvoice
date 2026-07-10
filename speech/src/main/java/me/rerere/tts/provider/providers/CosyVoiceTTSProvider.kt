package me.rerere.tts.provider.providers

import android.content.Context
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import me.rerere.tts.model.AudioChunk
import me.rerere.tts.model.AudioFormat
import me.rerere.tts.model.TTSRequest
import me.rerere.tts.provider.TTSProvider
import me.rerere.tts.provider.TTSProviderSetting
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "CosyVoiceTTSProvider"
private const val WEB_SOCKET_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/"

class CosyVoiceTTSProvider : TTSProvider<TTSProviderSetting.CosyVoice> {
    private val httpClient = OkHttpClient.Builder()
        .readTimeout(120, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .connectTimeout(30, TimeUnit.SECONDS)
        .build()

    override fun generateSpeech(
        context: Context,
        providerSetting: TTSProviderSetting.CosyVoice,
        request: TTSRequest
    ): Flow<AudioChunk> = flow {
        val audioFuture = CompletableFuture<Pair<ByteArray, Boolean>?>()
        val errorFuture = CompletableFuture<String>()
        val isTaskStarted = AtomicBoolean(false)
        val isFinished = AtomicBoolean(false)

        val runTaskPayload = JSONObject().apply {
            put("task_id", "tts_${System.currentTimeMillis()}")
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("model", providerSetting.model)
                put("language", providerSetting.language)
                put("voice", providerSetting.voice)
                put("sample_rate", providerSetting.sampleRate)
                put("format", "pcm")
            })
        }

        val continueTaskPayload = JSONObject().apply {
            put("task_id", runTaskPayload.getString("task_id"))
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("action", "continue")
                put("text", request.text)
            })
        }

        val finishTaskPayload = JSONObject().apply {
            put("task_id", runTaskPayload.getString("task_id"))
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("action", "finish")
            })
        }

        Log.i(TAG, "Connecting to CosyVoice WebSocket...")

        val wsRequest = Request.Builder()
            .url(WEB_SOCKET_URL)
            .addHeader("Authorization", "Bearer ${providerSetting.apiKey}")
            .addHeader("Content-Type", "application/json")
            .build()

        var webSocket: WebSocket? = null

        try {
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

            webSocket = httpClient.newWebSocket(wsRequest, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.i(TAG, "WebSocket connected, sending run-task")
                    webSocket.send(runTaskPayload.toString())
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    try {
                        val json = JSONObject(text)
                        val eventType = json.optString("event_type", "")

                        when (eventType) {
                            "task-started" -> {
                                Log.i(TAG, "Task started, sending text")
                                isTaskStarted.set(true)
                                webSocket.send(continueTaskPayload.toString())
                            }
                            "task-finished" -> {
                                Log.i(TAG, "Task finished")
                                isFinished.set(true)
                                audioFuture.complete(null)
                                webSocket.close(1000, "Task finished")
                            }
                            "error" -> {
                                val errorMsg = json.optString("error_message", "Unknown error")
                                Log.e(TAG, "CosyVoice error: $errorMsg")
                                errorFuture.complete(errorMsg)
                            }
                            else -> {
                                Log.d(TAG, "Unknown event: $text")
                            }
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to parse message: $text", e)
                    }
                }

                override fun onMessage(webSocket: WebSocket, bytes: okhttp3.ByteString) {
                    try {
                        val audioData = bytes.toByteArray()
                        emit(
                            AudioChunk(
                                data = audioData,
                                format = AudioFormat.PCM,
                                sampleRate = providerSetting.sampleRate,
                                isLast = false,
                                metadata = mapOf(
                                    "provider" to "cosyvoice",
                                    "model" to providerSetting.model,
                                    "voice" to providerSetting.voice,
                                    "sampleRate" to providerSetting.sampleRate.toString(),
                                    "channels" to "1",
                                    "bitDepth" to "16"
                                )
                            )
                        )
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to emit audio chunk", e)
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.e(TAG, "WebSocket failure: ${t.message}", t)
                    errorFuture.complete(t.message ?: "WebSocket connection failed")
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.i(TAG, "WebSocket closed: code=$code, reason=$reason")
                    if (!isFinished.get() && !errorFuture.isDone) {
                        audioFuture.complete(null)
                    }
                }
            })

            var elapsed = 0L
            while (!isTaskStarted.get() && elapsed < 30000) {
                delay(100)
                elapsed += 100
                if (!scope.isActive) {
                    break
                }
            }

            if (!isTaskStarted.get()) {
                webSocket.close(1002, "Timeout waiting for task-started")
                throw Exception("Timeout waiting for task-started event")
            }

            var finishElapsed = 0L
            while (!isFinished.get() && !errorFuture.isDone && finishElapsed < 120000) {
                delay(100)
                finishElapsed += 100
                if (!scope.isActive) {
                    break
                }
            }

            if (finishElapsed >= 120000) {
                webSocket.close(1002, "Timeout")
                throw Exception("Timeout waiting for audio")
            }

            if (errorFuture.isDone) {
                throw Exception(errorFuture.get())
            }

        } finally {
            webSocket?.close(1000, "Done")
        }
    }

    fun testConnection(
        apiKey: String,
        model: String,
        voice: String,
        language: String,
        callback: (Boolean, String) -> Unit
    ) {
        val runTaskPayload = JSONObject().apply {
            put("task_id", "test_${System.currentTimeMillis()}")
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("model", model)
                put("language", language)
                put("voice", voice)
                put("sample_rate", 24000)
                put("format", "pcm")
            })
        }

        val continueTaskPayload = JSONObject().apply {
            put("task_id", runTaskPayload.getString("task_id"))
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("action", "continue")
                put("text", "测试连接")
            })
        }

        val finishTaskPayload = JSONObject().apply {
            put("task_id", runTaskPayload.getString("task_id"))
            put("instruction", JSONObject().apply {
                put("task_type", "tts")
                put("action", "finish")
            })
        }

        val wsRequest = Request.Builder()
            .url(WEB_SOCKET_URL)
            .addHeader("Authorization", "Bearer $apiKey")
            .addHeader("Content-Type", "application/json")
            .build()

        var webSocket: WebSocket? = null

        webSocket = httpClient.newWebSocket(wsRequest, object : WebSocketListener() {
            private val startTime = System.currentTimeMillis()

            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(runTaskPayload.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val json = JSONObject(text)
                    val eventType = json.optString("event_type", "")

                    when (eventType) {
                        "task-started" -> {
                            webSocket.send(continueTaskPayload.toString())
                        }
                        "task-finished" -> {
                            val duration = System.currentTimeMillis() - startTime
                            webSocket.close(1000, "Test passed")
                            callback(true, "连接成功! 耗时: ${duration}ms")
                        }
                        "error" -> {
                            val errorMsg = json.optString("error_message", "Unknown error")
                            val errorCode = json.optString("code", "")
                            webSocket.close(1011, "Error")
                            callback(false, "错误代码: $errorCode\n错误信息: $errorMsg")
                        }
                    }
                } catch (e: Exception) {
                    webSocket.close(1011, "Parse error")
                    callback(false, "解析响应失败: ${e.message}")
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: okhttp3.ByteString) {
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                webSocket.close(1011, "Failure")
                callback(false, "连接失败: ${t.message}")
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (code != 1000) {
                    callback(false, "连接关闭: code=$code, reason=$reason")
                }
            }
        })

        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            delay(15000)
            if (webSocket?.send(finishTaskPayload.toString()) == false) {
                callback(false, "发送finish指令失败")
            }
        }
    }
}