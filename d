import pathlib

p = pathlib.Path(r'd:\a6\orangechat\app\src\main\java\me\rerere\rikkahub\plugin\ui\PluginViewModel.kt')
c = p.read_text(encoding='utf-8')

# Add import
c = c.replace(
    'import me.rerere.rikkahub.plugin.model.PluginInfo',
    'import me.rerere.rikkahub.plugin.model.PluginFolder\nimport me.rerere.rikkahub.plugin.model.PluginInfo',
    1
)

# Add folders field
c = c.replace(
    '    val isLoading: StateFlow<Boolean> = pluginManager.isLoading\n',
    '    val isLoading: StateFlow<Boolean> = pluginManager.isLoading\n\n    val folders: StateFlow<List<PluginFolder>> = pluginManager.folders\n'
)

# Add folder methods before the ImportState sealed class
folder_methods = '''
    // ==================== 文件夹管理 ====================

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

'''

c = c.replace(
    '    /**\n     * 导入状态\n     */',
    folder_methods + '    /**\n     * 导入状态\n     */'
)

p.write_text(c, encoding='utf-8')
print('PluginViewModel.kt updated successfully')
print('Contains folders:', 'val folders' in c)
print('Contains createFolder:', 'fun createFolder' in c)