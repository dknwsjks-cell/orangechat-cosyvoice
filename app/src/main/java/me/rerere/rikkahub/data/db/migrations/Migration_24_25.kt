package me.rerere.rikkahub.data.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object Migration_24_25 : Migration(24, 25) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 在 memory_bank 表中添加 embedding 字段（如果尚未存在）
        try {
            db.execSQL("ALTER TABLE memory_bank ADD COLUMN embedding TEXT")
        } catch (e: Exception) {
            // 列已存在则忽略
        }
    }
}
