package me.rerere.rikkahub.data.db.migrations

import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * Migration from version 19 to 20: Add memory_bank and memory_vector tables
 */
val Migration_19_20 = object : Migration(19, 20) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // Create memory_bank table
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS `memory_bank` (
                `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                `content` TEXT NOT NULL,
                `type` TEXT NOT NULL,
                `role` TEXT,
                `assistant_id` TEXT,
                `conversation_id` TEXT,
                `date_group` TEXT,
                `vector_status` TEXT NOT NULL,
                `vector_retry_count` INTEGER NOT NULL,
                `created_at` INTEGER NOT NULL
            )
        """.trimIndent())

        // Create memory_vector table
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS `memory_vector` (
                `memory_id` INTEGER NOT NULL,
                `vector` TEXT NOT NULL,
                `dimensions` INTEGER NOT NULL,
                `model` TEXT NOT NULL,
                `created_at` INTEGER NOT NULL,
                PRIMARY KEY(`memory_id`)
            )
        """.trimIndent())
    }
}