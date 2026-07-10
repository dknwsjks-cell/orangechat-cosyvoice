package me.rerere.rikkahub.data.model

import kotlinx.serialization.Serializable
import kotlin.uuid.Uuid

/**
 * 外置记忆库配置（进阶记忆）
 * 每个记忆库对应一个 Supabase 数据库
 */
@Serializable
data class ExternalMemory(
    val id: Uuid = Uuid.random(),
    val name: String = "",
    val supabaseUrl: String = "",
    val supabaseKey: String = "",
    val tableName: String = "chat_messages",
    val summariesTableName: String = "memory_summaries",
    val enabled: Boolean = true,
    val autoSaveMessages: Boolean = true,
    val autoSaveDiarySummary: Boolean = false,
    val recallCount: Int = 5,
    val embeddingModelId: Uuid? = null,
)
