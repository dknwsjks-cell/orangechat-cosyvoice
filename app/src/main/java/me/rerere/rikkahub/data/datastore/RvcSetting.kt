package me.rerere.rikkahub.data.datastore

import kotlinx.serialization.Serializable

@Serializable
data class RvcSetting(
    val enabled: Boolean = false,
)