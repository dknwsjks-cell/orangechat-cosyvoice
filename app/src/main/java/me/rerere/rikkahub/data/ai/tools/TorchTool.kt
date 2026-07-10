package me.rerere.rikkahub.data.ai.tools

import android.content.Context
import android.hardware.camera2.CameraManager
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import me.rerere.ai.core.InputSchema
import me.rerere.ai.core.Tool
import me.rerere.ai.ui.UIMessagePart
import me.rerere.common.android.Logging

fun createTorchTool(context: Context): Tool = Tool(
    name = "set_torch",
    description = "Turn the device flashlight/torch on or off.",
    parameters = {
        InputSchema.Obj(
            properties = buildJsonObject {
                putJsonObject("on") {
                    put("type", "boolean")
                    put("description", "True to turn torch on, false to turn off.")
                }
            },
            required = listOf("on")
        )
    },
    execute = { args ->
        val params = args.jsonObject
        val on = params["on"]?.jsonPrimitive?.content?.toBooleanStrictOrNull()
        if (on == null) {
            return@Tool listOf(UIMessagePart.Text(
                buildJsonObject {
                    put("success", false)
                    put("error", "Missing or invalid required parameter 'on' (boolean)")
                }.toString()
            ))
        }

        try {
            val cameraManager = context.getSystemService(CameraManager::class.java)
            if (cameraManager == null) {
                Logging.log("TorchTool", "CameraManager unavailable")
                return@Tool listOf(UIMessagePart.Text(
                    buildJsonObject {
                        put("success", false)
                        put("error", "CameraManager unavailable")
                    }.toString()
                ))
            }

            var flashId: String? = null
            for (id in cameraManager.cameraIdList) {
                try {
                    if (cameraManager.getCameraCharacteristics(id)
                            .get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                    ) {
                        flashId = id
                        break
                    }
                } catch (e: Exception) {
                    Logging.log("TorchTool", "Error checking camera $id: ${e.message}")
                }
            }

            if (flashId == null) {
                Logging.log("TorchTool", "No camera with flash found")
                return@Tool listOf(UIMessagePart.Text(
                    buildJsonObject {
                        put("success", false)
                        put("error", "No flashlight available on this device")
                    }.toString()
                ))
            }

            cameraManager.setTorchMode(flashId!!, on)

            listOf(UIMessagePart.Text(
                buildJsonObject {
                    put("success", true)
                    put("torch_on", on)
                    put("message", "Torch ${if (on) "turned on" else "turned off"}")
                }.toString()
            ))
        } catch (e: android.hardware.camera2.CameraAccessException) {
            Logging.log("TorchTool", "CameraAccessException: ${e.message}\n${e.stackTraceToString()}")
            listOf(UIMessagePart.Text(
                buildJsonObject {
                    put("success", false)
                    put("error", "Camera access error: ${e.message}")
                }.toString()
            ))
        } catch (e: Exception) {
            Logging.log("TorchTool", "Unexpected error: ${e.message}\n${e.stackTraceToString()}")
            listOf(UIMessagePart.Text(
                buildJsonObject {
                    put("success", false)
                    put("error", e.message ?: "Unknown error")
                }.toString()
            ))
        }
    }
)