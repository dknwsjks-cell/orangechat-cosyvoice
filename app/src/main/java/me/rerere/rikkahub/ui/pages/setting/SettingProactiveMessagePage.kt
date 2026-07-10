package me.rerere.rikkahub.ui.pages.setting

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.rerere.rikkahub.ui.components.nav.BackButton
import me.rerere.rikkahub.ui.components.ui.CardGroup
import me.rerere.rikkahub.ui.context.LocalNavController
import me.rerere.rikkahub.data.service.ProactiveMessageService
import me.rerere.rikkahub.data.service.ProactiveMessageWorker
import org.koin.compose.koinInject
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingProactiveMessagePage(vm: SettingVM = koinInject()) {
    val context = LocalContext.current
    val navController = LocalNavController.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text("主动消息") },
                navigationIcon = { BackButton() },
                scrollBehavior = scrollBehavior,
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            item {
                CardGroup {
                    item(
                        headlineContent = { Text("启用主动消息") },
                        supportingContent = { Text("开启后AI立即主动发一条消息，之后按设定间隔循环") },
                        trailingContent = {
                            Switch(
                                checked = settings.proactiveMessageSetting.enabled,
                                onCheckedChange = { enabled ->
                                    val newSetting = settings.proactiveMessageSetting.copy(enabled = enabled)
                                    vm.updateSettings(settings.copy(proactiveMessageSetting = newSetting))
                                    if (enabled) {
                                        ProactiveMessageService.triggerNow(context, newSetting)
                                    } else {
                                        ProactiveMessageService.cancel(context)
                                    }
                                }
                            )
                        }
                    )
                    if (settings.proactiveMessageSetting.enabled) {
                        var nextTime by remember { mutableStateOf(ProactiveMessageService.getNextTriggerTime(context)) }
                        LaunchedEffect(settings.proactiveMessageSetting) {
                            nextTime = ProactiveMessageService.getNextTriggerTime(context)
                            while (true) {
                                kotlinx.coroutines.delay(10_000L)
                                nextTime = ProactiveMessageService.getNextTriggerTime(context)
                            }
                        }
                        item(
                            headlineContent = { Text("下次触发时间") },
                            supportingContent = {
                                val currentTime = System.currentTimeMillis()
                                val triggerTime = nextTime
                                if (triggerTime != null && triggerTime > currentTime) {
                                    val remaining = triggerTime - currentTime
                                    val remainMinutes = remaining / 60_000
                                    val remainSeconds = (remaining % 60_000) / 1000
                                    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.getDefault())
                                    Text("🕐 ${sdf.format(java.util.Date(triggerTime))}（剩余 ${remainMinutes}分${remainSeconds}秒）")
                                } else {
                                    Text("等待调度中...")
                                }
                            }
                        )
                    }
                }
            }
            item {
                CardGroup {
                    item(
                        headlineContent = { Text("最小间隔 (分钟)") },
                        supportingContent = {
                            OutlinedTextField(
                                value = settings.proactiveMessageSetting.minIntervalMinutes.toString(),
                                onValueChange = { value ->
                                    val minutes = value.toIntOrNull()
                                    if (minutes != null && minutes > 0) {
                                        vm.updateSettings(
                                            settings.copy(
                                                proactiveMessageSetting = settings.proactiveMessageSetting.copy(
                                                    minIntervalMinutes = minutes
                                                )
                                            )
                                        )
                                    }
                                },
                                placeholder = { Text("30") },
                                singleLine = true,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        },
                    )
                    item(
                        headlineContent = { Text("最大间隔 (分钟)") },
                        supportingContent = {
                            OutlinedTextField(
                                value = settings.proactiveMessageSetting.maxIntervalMinutes.toString(),
                                onValueChange = { value ->
                                    val minutes = value.toIntOrNull()
                                    if (minutes != null && minutes >= settings.proactiveMessageSetting.minIntervalMinutes) {
                                        vm.updateSettings(
                                            settings.copy(
                                                proactiveMessageSetting = settings.proactiveMessageSetting.copy(
                                                    maxIntervalMinutes = minutes
                                                )
                                            )
                                        )
                                    }
                                },
                                placeholder = { Text("90") },
                                singleLine = true,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                        },
                    )
                }
            }
            // 跳转时间阈值（仅当 allowForceJump 开启时显示）
            if (settings.proactiveMessageSetting.allowForceJump) {
                item {
                    CardGroup {
                        item(
                            headlineContent = { Text("跳转时间阈值 (分钟)") },
                            supportingContent = {
                                OutlinedTextField(
                                    value = settings.proactiveMessageSetting.jumpIdleThresholdMinutes.toString(),
                                    onValueChange = { value ->
                                        val minutes = value.toIntOrNull()
                                        if (minutes != null && minutes > 0) {
                                            vm.updateSettings(
                                                settings.copy(
                                                    proactiveMessageSetting = settings.proactiveMessageSetting.copy(
                                                        jumpIdleThresholdMinutes = minutes
                                                    )
                                                )
                                            )
                                        }
                                    },
                                    placeholder = { Text("120") },
                                    singleLine = true,
                                    modifier = Modifier.padding(top = 8.dp),
                                )
                                Text("用户多久没回复(分钟)时，AI 可以选择跳转屏幕。默认120分钟(2小时)。不到此时间不会跳转。结合AI判断+助手提示词。")
                            },
                        )
                    }
                }
            }

            item {
                CardGroup {
                    item(
                        headlineContent = { Text("允许强制跳转屏幕") },
                        supportingContent = {
                            Text("开启后，AI 会根据距离上次聊天的时间、消息重要程度、记忆等综合判断。当判断这条消息需要你立即看到时（如长时间未回复、重要提醒、你在等的内容），会直接把橘瓣聊天界面拉到屏幕最前面，而不只是发通知。\n\nAI 只在必要时才会跳转，一般闲聊不会打扰你。")
                        },
                        trailingContent = {
                            Switch(
                                checked = settings.proactiveMessageSetting.allowForceJump,
                                onCheckedChange = { enabled ->
                                    vm.updateSettings(
                                        settings.copy(
                                            proactiveMessageSetting = settings.proactiveMessageSetting.copy(
                                                allowForceJump = enabled
                                            )
                                        )
                                    )
                                }
                            )
                        }
                    )
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                item {
                    val hasExactAlarm = ProactiveMessageWorker.canScheduleExactAlarms(context)
                    CardGroup {
                        item(
                            headlineContent = { Text("精确闹钟权限") },
                            supportingContent = {
                                if (hasExactAlarm) {
                                    Text("已授予精确闹钟权限，定时触发将更准确")
                                } else {
                                    Text("未授予精确闹钟权限，触发时间可能不精确。已自动使用 WorkManager 作为备用方案。")
                                }
                            },
                            onClick = if (!hasExactAlarm) {
                                {
                                    try {
                                        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                            data = Uri.fromParts("package", context.packageName, null)
                                        }
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        val intent = Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS)
                                        context.startActivity(intent)
                                    }
                                }
                            } else null
                        )
                    }
                }
            }
            item {
                val isIgnoring = ProactiveMessageWorker.isIgnoringBatteryOptimizations(context)
                CardGroup {
                    item(
                        headlineContent = { Text("电池优化") },
                        supportingContent = {
                            if (isIgnoring) {
                                Text("已忽略电池优化，后台触发更稳定")
                            } else {
                                Text("未忽略电池优化，系统可能限制后台活动导致消息无法准时触发。建议关闭电池优化。")
                            }
                        },
                        onClick = if (!isIgnoring) {
                            {
                                try {
                                    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                                        data = Uri.fromParts("package", context.packageName, null)
                                    }
                                    context.startActivity(intent)
                                } catch (e: Exception) {
                                    val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                                    context.startActivity(intent)
                                }
                            }
                        } else null
                    )
                }
            }
            item {
                CardGroup {
                    item(
                        headlineContent = { Text("说明") },
                        supportingContent = {
                            Text("启用后，AI 会在设定的最小和最大间隔之间随机一个时间点主动给你发消息。你回复后计时器重置，重新开始随机计时；不回复则继续循环发消息。AI 可以自己思考选择要不要回复，如果觉得没什么好说的可以跳过。\n\n提示：同时使用 AlarmManager + WorkManager 双重调度，确保消息能准时触发。\n\n强制跳转：开启后 AI 会自行判断是否需要拉起屏幕。")
                        },
                    )
                }
            }
        }
    }
}
