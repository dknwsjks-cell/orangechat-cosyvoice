package me.rerere.rikkahub.data.datastore

import kotlinx.serialization.Serializable

@Serializable
data class ProactiveMessageSetting(
    val enabled: Boolean = false,
    val minIntervalMinutes: Int = 30,
    val maxIntervalMinutes: Int = 90,
    val assistantId: String = "",
    // 是否允许 AI 根据上下文判断后强制跳转屏幕到聊天界面
    val allowForceJump: Boolean = false,
    val jumpIdleThresholdMinutes: Int = 120, // 用户多久没回复(分钟)才允许跳转屏幕，默认2小时
)
