package me.rerere.rikkahub.plugin.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import me.rerere.rikkahub.plugin.manager.PluginManager
import me.rerere.rikkahub.plugin.model.PluginFolder
import me.rerere.rikkahub.plugin.model.PluginInfo

/**
 * 插件ViewModel
 */
class PluginViewModel(
    private val pluginManager: PluginManager
) : ViewModel() {

    // 插件列表
    val plugins: StateFlow<List<PluginInfo>> = pluginManager.plugins

    // 加载状态
    val isLoading: StateFlow<Boolean> = pluginManager.isLoading

    val folders: StateFlow<List<PluginFolder>> = pluginManager.folders

    // 导入状态
    private val _importState = MutableStateFlow<ImportState>(ImportState.Idle)
    val importState: StateFlow<ImportState> = _importState.asStateFlow()

    // 操作状态
    private val _operationState = MutableStateFlow<OperationState>(OperationState.Idle)
    val operationState: StateFlow<OperationState> = _operationState.asStateFlow()

    /**
     * 刷新插件列表
     */
    fun refreshPlugins() {
        viewModelScope.launch {
            pluginManager.refreshPlugins()
        }
    }

    /**
     * 导入插件
     */
    fun importPlugin(uri: android.net.Uri) {
        viewModelScope.launch {
            _importState.value = ImportState.Loading
            try {
                val result = pluginManager.importPlugin(uri)
                _importState.value = if (result.isSuccess) {
                    ImportState.Success(result.getOrThrow())
                } else {
                    ImportState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
                }
            } catch (e: Exception) {
                _importState.value = ImportState.Error(e.message ?: "Unknown error")
            }
        }
    }

    /**
     * 获取指定插件
     */
    fun getPlugin(pluginId: String): PluginInfo? {
        return plugins.value.find { it.manifest.id == pluginId }
    }

    /**
     * 删除插件
     */
    fun deletePlugin(pluginId: String) {
        viewModelScope.launch {
            _operationState.value = OperationState.Loading
            try {
                val success = pluginManager.deletePlugin(pluginId)
                _operationState.value = if (success) {
                    OperationState.Success("Plugin deleted")
                } else {
                    OperationState.Error("Failed to delete plugin")
                }
            } catch (e: Exception) {
                _operationState.value = OperationState.Error(e.message ?: "Unknown error")
            }
        }
    }

    /**
     * 切换插件启用状态
     */
    fun togglePlugin(pluginId: String, enabled: Boolean) {
        viewModelScope.launch {
            pluginManager.togglePlugin(pluginId, enabled)
        }
    }

    /**
     * 更新插件配置
     */
    fun updatePluginConfig(pluginId: String, config: Map<String, JsonElement>) {
        viewModelScope.launch {
            pluginManager.updatePluginConfig(pluginId, config)
        }
    }

    /**
     * 获取插件目录
     */
    fun getPluginsDirectory() = pluginManager.getPluginsDirectory()

    /**
     * 重置导入状态
     */
    fun resetImportState() {
        _importState.value = ImportState.Idle
    }

    /**
     * 重置操作状态
     */
    fun resetOperationState() {
        _operationState.value = OperationState.Idle
    }

    fun createFolder(name: String) {
        viewModelScope.launch {
            _operationState.value = OperationState.Loading
            try {
                pluginManager.createFolder(name)
                _operationState.value = OperationState.Success("ok")
            } catch (e: Exception) {
                _operationState.value = OperationState.Error(e.message ?: "err")
            }
        }
    }

    fun renameFolder(folderId: String, newName: String) {
        viewModelScope.launch {
            _operationState.value = OperationState.Loading
            try {
                pluginManager.renameFolder(folderId, newName)
                _operationState.value = OperationState.Success("ok")
            } catch (e: Exception) {
                _operationState.value = OperationState.Error(e.message ?: "err")
            }
        }
    }

    fun deleteFolder(folderId: String) {
        viewModelScope.launch {
            _operationState.value = OperationState.Loading
            try {
                pluginManager.deleteFolder(folderId)
                _operationState.value = OperationState.Success("ok")
            } catch (e: Exception) {
                _operationState.value = OperationState.Error(e.message ?: "err")
            }
        }
    }

    fun movePluginToFolder(pluginId: String, folderId: String?) {
        viewModelScope.launch {
            pluginManager.movePluginToFolder(pluginId, folderId)
        }
    }

    fun importPlugin(uri: android.net.Uri, folderId: String?) {
        viewModelScope.launch {
            _importState.value = ImportState.Loading
            try {
                val result = pluginManager.importPlugin(uri, folderId)
                _importState.value = if (result.isSuccess) {
                    ImportState.Success(result.getOrThrow())
                } else {
                    ImportState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
                }
            } catch (e: Exception) {
                _importState.value = ImportState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun getPluginsByFolder(folderId: String?): List<PluginInfo> {
        return pluginManager.getPluginsByFolder(folderId)
    }

    /**
     * 导入状态
     */
    sealed class ImportState {
        data object Idle : ImportState()
        data object Loading : ImportState()
        data class Success(val plugin: PluginInfo) : ImportState()
        data class Error(val message: String) : ImportState()
    }

    /**
     * 操作状态
     */
    sealed class OperationState {
        data object Idle : OperationState()
        data object Loading : OperationState()
        data class Success(val message: String) : OperationState()
        data class Error(val message: String) : OperationState()
    }
}