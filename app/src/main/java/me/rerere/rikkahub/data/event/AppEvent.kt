package me.rerere.rikkahub.data.event

sealed class AppEvent {
    data class Speak(val text: String) : AppEvent()
    data class EmojiSelected(val emoji: String) : AppEvent()

    /**
     * AI 在文字聊天中主动请求发起语音通话.
     * 由 request_voice_call 工具发出, RouteActivity 监听后弹出来电界面.
     */
    data class RequestVoiceCall(val conversationId: String) : AppEvent()

    /** MCP OAuth 授权完成后经 deep link 回传的结果。 */
    data class McpOAuthCallback(
        val state: String?,
        val code: String?,
        val error: String?,
    ) : AppEvent()
}
