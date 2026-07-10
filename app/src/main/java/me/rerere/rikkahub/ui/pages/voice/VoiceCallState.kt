package me.rerere.rikkahub.ui.pages.voice

/**
 * 语音通话状态机
 *
 * 状态流转:
 * Idle -> Listening -> Processing -> Speaking -> Listening -> ...
 *                                    |-> Error -> Idle
 */
enum class VoiceCallStatus {
    Idle,
    Listening,
    Processing,
    Speaking,
    Error
}

/**
 * 语音通话 UI 状态
 */
data class VoiceCallUiState(
    val status: VoiceCallStatus = VoiceCallStatus.Idle,
    val userTranscript: String = "",
    val assistantText: String = "",
    val errorMessage: String? = null,
    val amplitudes: List<Float> = emptyList(),
    val isMuted: Boolean = false,
    val autoSendEnabled: Boolean = true,
) {
    val isActive: Boolean
        get() = status != VoiceCallStatus.Idle
}