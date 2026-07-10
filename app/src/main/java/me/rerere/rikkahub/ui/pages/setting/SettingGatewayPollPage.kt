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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.rerere.rikkahub.ui.components.nav.BackButton
import me.rerere.rikkahub.ui.components.ui.CardGroup
import me.rerere.rikkahub.data.service.GatewayPollService
import org.koin.compose.koinInject

/**
 * 网关轮询设置页
 *
 * 解决"云端网关访问不到手机橘瓣内网"的问题：橘瓣每 15 分钟主动 poll 网关，
 * 网关心跳决定 MSG 时，橘瓣被唤醒走自己的完整聊天流程（MCP/插件/搜索/生图等工具全在线）。
 *
 * 定时权仍在网关（网关心跳决定几点醒），橘瓣只是每 15 分钟来问一次"现在该说话了吗"。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingGatewayPollPage(vm: SettingVM = koinInject()) {
    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    val scrollBehavior = TopAppBarDefaults.pinnedScrollBehavior()

    Scaffold(
        modifier = Modifier.nestedScroll(scrollBehavior.nestedScrollConnection),
        topBar = {
            LargeFlexibleTopAppBar(
                title = { Text("网关轮询") },
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
                        headlineContent = { Text("启用网关轮询") },
                        supportingContent = { Text("开启后橘瓣每 15 分钟主动向网关查询'是否该主动说话'。网关回答'该'时，橘瓣走自己的完整聊天流程（工具全在线），产物留在橘瓣会话里。") },
                        trailingContent = {
                            Switch(
                                checked = settings.gatewayPollEnabled,
                                onCheckedChange = { enabled ->
                                    vm.updateSettings(settings.copy(gatewayPollEnabled = enabled))
                                    if (enabled) {
                                        GatewayPollService.scheduleNext(context)
                                    } else {
                                        GatewayPollService.cancel(context)
                                    }
                                }
                            )
                        }
                    )
                    if (settings.gatewayPollEnabled) {
                        item(
                            headlineContent = { Text("立即轮询一次") },
                            supportingContent = { Text("手动触发一次 poll（不用等 15 分钟）。用于测试链路是否通。") },
                            onClick = {
                                // 立即触发一次完整链路：先 poll 网关，若 pending=true 再强制启动 TriggerService
                                GatewayPollService.triggerNow(context)
                            }
                        )
                    }
                }
            }
            item {
                CardGroup {
                    item(
                        headlineContent = { Text("网关地址") },
                        supportingContent = {
                            OutlinedTextField(
                                value = settings.gatewayPollUrl,
                                onValueChange = { value ->
                                    vm.updateSettings(settings.copy(gatewayPollUrl = value.trim()))
                                },
                                placeholder = { Text("https://silas.zeabur.app") },
                                singleLine = true,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                            Text("网关的公网域名或 IP（不带末尾斜杠）。即你的 mcp-gateway 部署地址。")
                        },
                    )
                    item(
                        headlineContent = { Text("API 密钥") },
                        supportingContent = {
                            OutlinedTextField(
                                value = settings.gatewayPollApiSecret,
                                onValueChange = { value ->
                                    vm.updateSettings(settings.copy(gatewayPollApiSecret = value.trim()))
                                },
                                placeholder = { Text("网关的 API_SECRET") },
                                singleLine = true,
                                modifier = Modifier.padding(top = 8.dp),
                            )
                            Text("网关环境变量 API_SECRET 的值。轮询请求会带 Authorization: Bearer <此密钥>。")
                        },
                    )
                }
            }
            if (settings.gatewayPollEnabled && settings.gatewayPollUrl.isNotBlank() && settings.gatewayPollApiSecret.isNotBlank()) {
                item {
                    CardGroup {
                        item(
                            headlineContent = { Text("轮询状态") },
                            supportingContent = {
                                Text("已启用。橘瓣每 15 分钟自动 poll 一次网关，App 被杀后系统到点也会拉起进程继续轮询。下一次 poll 会在最近一次触发后启动。")
                            },
                        )
                    }
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                item {
                    val am = context.getSystemService(android.content.Context.ALARM_SERVICE) as android.app.AlarmManager
                    val hasExactAlarm = am.canScheduleExactAlarms()
                    CardGroup {
                        item(
                            headlineContent = { Text("精确闹钟权限") },
                            supportingContent = {
                                if (hasExactAlarm) {
                                    Text("已授予精确闹钟权限，轮询触发将更准确")
                                } else {
                                    Text("未授予精确闹钟权限，触发时间可能不精确（已自动降级为 inexact）。建议开启以获得稳定周期。")
                                }
                            },
                            onClick = if (!hasExactAlarm) {
                                {
                                    try {
                                        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                                            data = Uri.fromParts("package", context.packageName, null)
                                        }
                                        context.startActivity(intent)
                                    } catch (e: Exception) {
                                        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                            data = Uri.fromParts("package", context.packageName, null)
                                        }
                                        context.startActivity(intent)
                                    }
                                }
                            } else null
                        )
                    }
                }
            }
            item {
                CardGroup {
                    item(
                        headlineContent = { Text("说明") },
                        supportingContent = {
                            Text("工作原理：网关跑在云端（Zeabur 等），手机在内网，公网访问不到内网。但手机可以主动访问公网网关（就像打开浏览器上网一样）。\n\n所以让橘瓣每 15 分钟主动向网关的 /api/proactive/poll 问一句'现在该主动说话吗'，网关回答'该'时橘瓣就用自己的工具和插件从零思考该说什么。\n\n定时权仍在网关——网关心跳决定几点该说话，橘瓣只是定期来取这个决定。最多有 15 分钟延迟。")
                        },
                    )
                }
            }
        }
    }
}
