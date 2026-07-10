// Supabase 外置记忆库插件
// 功能：消息同步到 Supabase

// ==================== 配置和状态 ====================

const CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};

// 初始化配置
function initConfig() {
  CONFIG.supabaseUrl = config.supabase_url || '';
  CONFIG.supabaseKey = config.supabase_key || '';
}

// Supabase REST API 请求
function supabaseRequest(table, method, data, query) {
  var url = CONFIG.supabaseUrl + '/rest/v1/' + table + (query || '');
  var headers = {
    'apikey': CONFIG.supabaseKey,
    'Authorization': 'Bearer ' + CONFIG.supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation' : ''
  };

  var response = fetch(url, {
    method: method,
    headers: headers,
    body: data ? JSON.stringify(data) : undefined
  });

  if (!response.ok) {
    throw new Error('Supabase error: ' + response.status);
  }

  return response.json();
}

// ==================== 事件处理 ====================

// 消息发送时
function onMessageSent(event) {
  initConfig();

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    return;
  }

  var message = {
    assistantId: event.assistant_id,
    conversationId: event.conversation_id,
    role: 'user',
    content: event.message,
    created_at: new Date().toISOString()
  };

  try {
    supabaseRequest('chat_messages', 'POST', message);
  } catch (error) {
    console.error('Failed to sync message:', error);
  }
}

// 消息接收时
function onMessageReceived(event) {
  initConfig();

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    return;
  }

  var message = {
    assistantId: event.assistant_id,
    conversationId: event.conversation_id,
    role: 'assistant',
    content: event.message,
    created_at: new Date().toISOString()
  };

  try {
    supabaseRequest('chat_messages', 'POST', message);
  } catch (error) {
    console.error('Failed to sync message:', error);
  }
}

// ==================== 工具函数 ====================

// 获取最近30条聊天记录
function memory_recall_recent(params) {
  initConfig();

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    return { success: false, error: 'Supabase not configured' };
  }

  var conversationId = params.conversation_id;
  if (!conversationId) {
    return { success: false, error: 'conversation_id is required' };
  }

  try {
    var query = '?conversation_id=eq.' + encodeURIComponent(conversationId) +
                '&order=created_at.desc&limit=30';
    var results = supabaseRequest('chat_messages', 'GET', null, query);

    // 按时间正序排列（最早的在前）
    results.reverse();

    return {
      success: true,
      data: results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 关键词搜索聊天记录
function memory_search(params) {
  initConfig();

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    return { success: false, error: 'Supabase not configured' };
  }

  var query = params.query || '';
  var conversationId = params.conversation_id;
  var limit = params.limit || 20;

  if (!query) {
    return { success: false, error: 'query is required' };
  }

  try {
    // 使用 Supabase ilike 进行全文搜索
    var urlQuery = '?content=ilike.*' + encodeURIComponent(query) + '*&limit=' + limit;
    if (conversationId) {
      urlQuery += '&conversation_id=eq.' + encodeURIComponent(conversationId);
    }
    urlQuery += '&order=created_at.desc';

    var results = supabaseRequest('chat_messages', 'GET', null, urlQuery);

    return {
      success: true,
      data: results
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// 主动写入记忆库
function memory_write(params) {
  initConfig();

  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    return { success: false, error: 'Supabase not configured' };
  }

  var content = params.content;
  var assistantId = params.assistant_id;
  var conversationId = params.conversation_id;

  if (!content) {
    return { success: false, error: 'content is required' };
  }

  try {
    var message = {
      assistantId: assistantId || 'manual',
      conversationId: conversationId || 'manual',
      role: 'system',
      content: content,
      created_at: new Date().toISOString()
    };

    var result = supabaseRequest('chat_messages', 'POST', message);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// ==================== 导出 ====================

exports.onMessageSent = onMessageSent;
exports.onMessageReceived = onMessageReceived;
exports.memory_recall_recent = memory_recall_recent;
exports.memory_search = memory_search;
exports.memory_write = memory_write;