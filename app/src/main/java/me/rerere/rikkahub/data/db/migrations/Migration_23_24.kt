package me.rerere.rikkahub.data.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

object Migration_23_24 : Migration(23, 24) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // 在 memory_bank 表中添加 embedding 字段
        db.execSQL("ALTER TABLE memory_bank ADD COLUMN embedding TEXT")
    }
}
