// ========== 共读阅读器 ==========
// 全局状态
var state = {
  book: '',
  chapter: 1,
  currentPage: 0,
  totalPages: 1,
  pages: [],
  annotations: [],
  touchStartX: 0,
  touchStartY: 0,
  touchStartTime: 0,
  selectedText: '',
  chatOpen: false,
  replyToId: null,
  longPressTimer: null
};

// ========== Bridge等待机制 ==========
function waitForBridge(cb, maxWait) {
  var start = Date.now();
  maxWait = maxWait || 5000;
  (function check() {
    if (window.Bridge) return cb();
    if (Date.now() - start > maxWait) return console.error('Bridge timeout');
    setTimeout(check, 100);
  })();
}

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', function() {
  waitForBridge(function() {
    loadPluginConfig();
    initEventListeners();
    initTouchHandlers();
    initTextSelection();
    restoreReadingState();
  });
});

async function loadPluginConfig() {
  try {
    var config = await Bridge.getPluginConfig();
    if (config.font_size) {
      document.documentElement.style.setProperty('--font-size', config.font_size + 'px');
    }
    if (config.line_height) {
      document.documentElement.style.setProperty('--line-height', String(config.line_height));
    }
  } catch(e) {
    console.error('loadPluginConfig error', e);
  }
}

// ========== 事件绑定 ==========
function initEventListeners() {
  // 顶栏按钮
  document.getElementById('btnImport').addEventListener('click', importBook);

  // 底栏按钮
  document.getElementById('btnChat').addEventListener('click', toggleChatPanel);

  // 聊天面板内AI阅读按钮
  document.getElementById('btnAiReadInline').addEventListener('click', aiReadCurrentPage);

  // 页码相关
  document.getElementById('pageInfo').addEventListener('click', showPageJump);
  document.getElementById('pageSliderInput').addEventListener('input', onSliderInput);
  document.getElementById('pageSliderInput').addEventListener('change', onSliderChange);

  // 聊天面板
  document.getElementById('btnCloseChat').addEventListener('click', closeChatPanel);
  document.getElementById('chatOverlay').addEventListener('click', closeChatPanel);
  document.getElementById('btnSend').addEventListener('click', sendMessage);
  document.getElementById('btnRemoveQuote').addEventListener('click', clearQuote);
  document.getElementById('btnRemoveReply').addEventListener('click', clearReply);

  // 聊天输入框回车发送 & 自动调高
  var chatInput = document.getElementById('chatInput');
  chatInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener('input', autoResizeInput);

  // 弹窗关闭
  document.getElementById('btnCloseBookList').addEventListener('click', function() {
    toggleModal('bookListModal', false);
  });
  document.getElementById('btnClosePageJump').addEventListener('click', function() {
    toggleModal('pageJumpModal', false);
  });
  document.getElementById('btnPageJump').addEventListener('click', doPageJump);
  document.getElementById('pageJumpInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doPageJump();
  });

  // 点击弹窗背景关闭
  document.getElementById('bookListModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('bookListModal', false);
  });
  document.getElementById('pageJumpModal').addEventListener('click', function(e) {
    if (e.target === this) toggleModal('pageJumpModal', false);
  });
}

// ========== 滑动翻页 ==========
function initTouchHandlers() {
  var container = document.getElementById('readerArea');
  if (!container) return;

  container.addEventListener('touchstart', function(e) {
    state.touchStartX = e.touches[0].clientX;
    state.touchStartY = e.touches[0].clientY;
    state.touchStartTime = Date.now();
  }, {passive: true});

  container.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - state.touchStartX;
    var dy = e.changedTouches[0].clientY - state.touchStartY;
    var dt = Date.now() - state.touchStartTime;

    // 水平滑动超过50px，且大于垂直滑动，且时间合理
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && dt < 500) {
      if (dx < 0 && state.currentPage < state.totalPages - 1) {
        goToPage(state.currentPage + 1);
      } else if (dx > 0 && state.currentPage > 0) {
        goToPage(state.currentPage - 1);
      }
    }
  }, {passive: true});
}

// ========== 文字选择 ==========
function initTextSelection() {
  var readerArea = document.getElementById('readerArea');
  if (!readerArea) return;

  document.addEventListener('mouseup', onTextSelect);
  document.addEventListener('touchend', function() {
    setTimeout(onTextSelect, 300);
  });
}

function onTextSelect() {
  try {
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    var text = sel.toString().trim();
    if (!text) return;

    // 检查选择是否在阅读区内
    var readerArea = document.getElementById('readerArea');
    if (!readerArea) return;
    var range = sel.getRangeAt(0);
    if (!readerArea.contains(range.commonAncestorContainer)) return;

    state.selectedText = text;

    // 如果聊天面板已打开，自动填入引用
    if (state.chatOpen) {
      showQuotePreview(text);
    }
  } catch(e) {
    // 忽略选择错误
  }
}

function showQuotePreview(text) {
  var preview = document.getElementById('quotePreview');
  var quoteText = document.getElementById('quoteText');
  if (preview && quoteText) {
    quoteText.textContent = text.length > 100 ? text.substring(0, 100) + '...' : text;
    preview.style.display = 'flex';
  }
}

function clearQuote() {
  state.selectedText = '';
  var preview = document.getElementById('quotePreview');
  if (preview) preview.style.display = 'none';
  var quoteText = document.getElementById('quoteText');
  if (quoteText) quoteText.textContent = '';
}

function showReplyPreview(annId) {
  var parent = state.annotations.find(function(a) { return a.id === annId; });
  if (!parent) return;

  state.replyToId = annId;
  var preview = document.getElementById('replyPreview');
  var nameEl = document.getElementById('replyName');
  var snippetEl = document.getElementById('replySnippet');

  if (preview && nameEl && snippetEl) {
    nameEl.textContent = parent.role === 'ai' ? 'AI' : '我';
    snippetEl.textContent = (parent.note || parent.quote || '').substring(0, 50);
    preview.style.display = 'flex';
  }

  // 聚焦输入框
  var chatInput = document.getElementById('chatInput');
  if (chatInput) chatInput.focus();
}

function clearReply() {
  state.replyToId = null;
  var preview = document.getElementById('replyPreview');
  if (preview) preview.style.display = 'none';
}

function autoResizeInput() {
  var input = document.getElementById('chatInput');
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

// ========== 分页 ==========
function paginateContent(text) {
  var TARGET = 1000;
  var MIN = 600;
  var pages = [];
  var remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TARGET) {
      pages.push(remaining);
      break;
    }

    var chunk = remaining.substring(0, TARGET);
    var breakPoint = -1;

    // 优先在换行符处断开
    var nlPos = chunk.lastIndexOf('\n');
    if (nlPos >= MIN) {
      breakPoint = nlPos;
    } else {
      // 其次在句号处断开
      var periodPos = chunk.lastIndexOf('。');
      if (periodPos >= MIN) {
        breakPoint = periodPos + 1;
      } else {
        // 再次在逗号处断开
        var commaPos = chunk.lastIndexOf('，');
        if (commaPos >= MIN) {
          breakPoint = commaPos + 1;
        } else {
          // 最后在感叹号/问号处断开
          var exclaPos = Math.max(chunk.lastIndexOf('！'), chunk.lastIndexOf('？'));
          if (exclaPos >= MIN) {
            breakPoint = exclaPos + 1;
          }
        }
      }
    }

    if (breakPoint < MIN) {
      breakPoint = TARGET; // 实在找不到好断点，硬切
    }

    var pageText = remaining.substring(0, breakPoint);
    pages.push(pageText);
    remaining = remaining.substring(breakPoint);
  }

  return pages.length > 0 ? pages : [''];
}

function renderPages() {
  var slider = document.getElementById('pageSlider');
  if (!slider) return;
  slider.innerHTML = '';
  state.pages.forEach(function(text, idx) {
    var div = document.createElement('div');
    div.className = 'page';
    div.id = 'page-' + idx;
    var content = document.createElement('div');
    content.className = 'page-content';
    content.textContent = text;
    div.appendChild(content);
    slider.appendChild(div);
  });
  updateSliderPosition();
  updatePageIndicator();
  updatePageSliderInput();
  applyHighlights();
}

function updateSliderPosition() {
  var slider = document.getElementById('pageSlider');
  if (slider) {
    slider.style.transform = 'translateX(-' + (state.currentPage * 100) + '%)';
  }
}

function updatePageIndicator() {
  var el = document.getElementById('pageInfo');
  if (el) el.textContent = '第 ' + (state.currentPage + 1) + ' / ' + state.totalPages + ' 页';
}

function updatePageSliderInput() {
  var slider = document.getElementById('pageSliderInput');
  if (slider) {
    slider.max = state.totalPages;
    slider.value = state.currentPage + 1;
  }
}

// ========== 翻页 ==========
function goToPage(idx) {
  if (idx < 0 || idx >= state.totalPages) return;
  state.currentPage = idx;
  updateSliderPosition();
  updatePageIndicator();
  updatePageSliderInput();
  notifyPageTurn();
  saveReadingState();

  // 翻页时更新聊天面板范围和消息
  if (state.chatOpen) {
    updateChatRangeInputs();
    renderChatMessages();
  }
}

function notifyPageTurn() {
  try {
    Bridge.notifyHook('onPageTurn', JSON.stringify({
      book: state.book,
      chapter: state.chapter,
      page: state.currentPage + 1
    }));
  } catch(e) {
    console.error('notifyPageTurn error', e);
  }
}

// ========== 页码滑块 ==========
var sliderDebounce = null;

function onSliderInput(e) {
  var val = parseInt(e.target.value, 10);
  if (isNaN(val) || val < 1 || val > state.totalPages) return;

  // 更新页码显示但不触发翻页动画
  var el = document.getElementById('pageInfo');
  if (el) el.textContent = '第 ' + val + ' / ' + state.totalPages + ' 页';

  // 防抖跳转
  clearTimeout(sliderDebounce);
  sliderDebounce = setTimeout(function() {
    goToPage(val - 1);
  }, 150);
}

function onSliderChange(e) {
  var val = parseInt(e.target.value, 10);
  if (!isNaN(val) && val >= 1 && val <= state.totalPages) {
    goToPage(val - 1);
  }
}

// ========== 页码跳转弹窗 ==========
function showPageJump() {
  var input = document.getElementById('pageJumpInput');
  if (input) {
    input.value = state.currentPage + 1;
    input.max = state.totalPages;
  }
  toggleModal('pageJumpModal', true);
  setTimeout(function() {
    if (input) input.focus();
  }, 300);
}

function doPageJump() {
  var input = document.getElementById('pageJumpInput');
  var val = parseInt(input ? input.value : '', 10);
  if (!isNaN(val) && val >= 1 && val <= state.totalPages) {
    goToPage(val - 1);
    toggleModal('pageJumpModal', false);
  }
}

// ========== 弹窗控制 ==========
function toggleModal(id, show) {
  var el = document.getElementById(id);
  console.log('toggleModal:', id, 'show:', show, 'element:', !!el);
  if (el) {
    if (show) {
      el.classList.add('open');
      // Force visible via cssText to bypass any cached CSS
      el.style.cssText = 'display:flex!important;opacity:1!important;position:fixed!important;z-index:9999!important;top:0!important;left:0!important;right:0!important;bottom:0!important;background:rgba(0,0,0,0.4)!important;align-items:center!important;justify-content:center!important;';
      console.log('modal forced visible, cssText:', el.style.cssText.substring(0, 100));
    } else {
      el.classList.remove('open');
      el.style.cssText = 'display:none;';
    }
  }
}

// ========== 聊天面板 ==========
function toggleChatPanel() {
  if (state.chatOpen) {
    closeChatPanel();
  } else {
    openChatPanel();
  }
}

function openChatPanel() {
  state.chatOpen = true;
  var panel = document.getElementById('chatPanel');
  var overlay = document.getElementById('chatOverlay');
  if (panel) panel.classList.add('open');
  if (overlay) overlay.classList.add('open');
  updateChatRangeInputs();
  renderChatMessages();

  // 如果有选中的文字，自动填入引用
  if (state.selectedText) {
    showQuotePreview(state.selectedText);
  }
}

function closeChatPanel() {
  state.chatOpen = false;
  clearQuote();
  clearReply();
  var panel = document.getElementById('chatPanel');
  var overlay = document.getElementById('chatOverlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('open');
}

function updateChatRangeInputs() {
  var startInput = document.getElementById('chatPageStart');
  var endInput = document.getElementById('chatPageEnd');
  if (startInput) { startInput.value = state.currentPage + 1; startInput.max = state.totalPages; }
  if (endInput) { endInput.value = state.currentPage + 1; endInput.max = state.totalPages; }
}

function getChatPageRange() {
  var startInput = document.getElementById('chatPageStart');
  var endInput = document.getElementById('chatPageEnd');
  var start = parseInt(startInput ? startInput.value : '', 10);
  var end = parseInt(endInput ? endInput.value : '', 10);
  if (isNaN(start) || start < 1) start = 1;
  if (isNaN(end) || end < 1) end = 1;
  if (start > end) { var tmp = start; start = end; end = tmp; }
  if (start > state.totalPages) start = state.totalPages;
  if (end > state.totalPages) end = state.totalPages;
  return { start: start, end: end };
}

// ========== 聊天消息渲染 ==========
function renderChatMessages() {
  var container = document.getElementById('chatMessages');
  if (!container) return;

  // 过滤当前范围的消息
  var range = getChatPageRange();
  var pageAnns = state.annotations.filter(function(a) {
    return a.page >= range.start && a.page <= range.end && a.chapter === state.chapter;
  });

  if (pageAnns.length === 0) {
    container.innerHTML = '<div class="chat-empty">暂无讨论，选一段文字或写点什么吧 ✨</div>';
    return;
  }

  container.innerHTML = '';
  pageAnns.forEach(function(ann) {
    var msgEl = createMessageElement(ann);
    container.appendChild(msgEl);
  });

  // 滚动到底部
  container.scrollTop = container.scrollHeight;
}

function createMessageElement(ann) {
  var msg = document.createElement('div');
  msg.className = 'message ' + ann.role;
  msg.dataset.id = ann.id;

  // 引用文字（在气泡上方）
  if (ann.quote) {
    var quoteEl = document.createElement('div');
    quoteEl.className = 'message-quote';
    quoteEl.textContent = '「' + ann.quote + '」';
    msg.appendChild(quoteEl);
  }

  // 回复引用条
  if (ann.replyTo) {
    var parent = state.annotations.find(function(a) { return a.id === ann.replyTo; });
    if (parent) {
      var replyEl = document.createElement('div');
      replyEl.className = 'message-reply-to';
      replyEl.textContent = (parent.role === 'ai' ? 'AI' : '我') + ': ' + (parent.note || parent.quote || '').substring(0, 30);
      msg.appendChild(replyEl);
    }
  }

  // 气泡主体
  var bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = ann.note || '';
  msg.appendChild(bubble);

  // 时间
  var timeEl = document.createElement('div');
  timeEl.className = 'message-time';
  timeEl.textContent = formatTime(ann.time);
  msg.appendChild(timeEl);

  // 操作按钮
  var actions = document.createElement('div');
  actions.className = 'message-actions';

  if (ann.role === 'ai') {
    var replyBtn = document.createElement('button');
    replyBtn.className = 'message-action-btn';
    replyBtn.textContent = '✏️回复';
    replyBtn.onclick = function() {
      showReplyPreview(ann.id);
    };
    actions.appendChild(replyBtn);
  } else if (ann.role === 'user') {
    var aiBtn = document.createElement('button');
    aiBtn.className = 'message-action-btn';
    aiBtn.textContent = '🤖请AI回应';
    aiBtn.onclick = function() {
      aiReplyAnnotation(ann.id);
    };
    actions.appendChild(aiBtn);
  }

  msg.appendChild(actions);
  return msg;
}

// ========== 发送消息 ==========
async function sendMessage() {
  var input = document.getElementById('chatInput');
  var note = input ? input.value.trim() : '';
  var quote = state.selectedText || '';

  if (!note && !quote) return;
  if (!state.book) {
    alert('请先导入书籍');
    return;
  }

  var ann = {
    id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
    role: 'user',
    page: state.currentPage + 1,
    chapter: state.chapter,
    book: state.book,
    quote: quote,
    note: note,
    replyTo: state.replyToId || null,
    time: new Date().toISOString()
  };

  state.annotations.push(ann);
  await saveAnnotations();

  // 清空输入
  if (input) input.value = '';
  if (input) input.style.height = 'auto';
  clearQuote();
  clearReply();

  renderChatMessages();
  applyHighlights();
}

// ========== 对话上下文构建 ==========
function buildConversationContext() {
  var range = getChatPageRange();
  var pageAnns = state.annotations.filter(function(a) {
    return a.page >= range.start && a.page <= range.end && a.chapter === state.chapter;
  });

  // 按时间排序
  pageAnns.sort(function(a, b) { return new Date(a.time) - new Date(b.time); });

  var lines = [];
  lines.push('【书籍】' + state.book);
  lines.push('【章节】第' + state.chapter + '章');
  lines.push('【讨论范围】第' + range.start + '-' + range.end + '页');
  lines.push('');

  if (pageAnns.length > 0) {
    lines.push('【之前的讨论记录】');
    pageAnns.forEach(function(ann) {
      var role = ann.role === 'ai' ? 'AI' : '用户';
      if (ann.quote) {
        lines.push(role + '（引用：「' + ann.quote.substring(0, 60) + '」）: ' + (ann.note || ''));
      } else {
        lines.push(role + ': ' + (ann.note || ''));
      }
    });
    lines.push('');
  }

  return lines.join('\n');
}

function buildReadingContext() {
  var range = getChatPageRange();
  var texts = [];
  for (var i = range.start - 1; i < range.end; i++) {
    if (state.pages[i]) texts.push('--- 第' + (i + 1) + '页 ---\n' + state.pages[i]);
  }
  return texts.join('\n\n');
}

// ========== AI阅读范围 ==========
var aiProcessing = false;

async function aiReadCurrentPage() {
  if (aiProcessing) return;
  if (!state.book) { alert('请先导入书籍'); return; }
  aiProcessing = true;

  var range = getChatPageRange();
  var readingText = buildReadingContext();
  var conversationCtx = buildConversationContext();

  setLoading(true, 'AI正在阅读第' + range.start + '-' + range.end + '页...');

  try {
    var prompt = '请阅读以下提供的书籍内容和讨论记录，写一段阅读笔记或感悟。要像聊天一样自然，可以引用原文、提出疑问、发表看法。';
    var ctx = JSON.stringify({
      book: state.book,
      chapter: String(state.chapter),
      page: range.start + '-' + range.end,
      content: readingText,
      annotations: conversationCtx
    });

    var result = await Bridge.callAI(prompt, ctx);

    if (result && result.success) {
      var ann = {
        id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        role: 'ai',
        page: range.start,
        chapter: state.chapter,
        book: state.book,
        quote: '',
        note: result.text,
        replyTo: null,
        time: new Date().toISOString()
      };

      state.annotations.push(ann);
      await saveAnnotations();
      renderChatMessages();
    } else {
      alert('AI阅读失败: ' + (result ? result.error || '未知错误' : '无响应'));
    }
  } catch(e) {
    alert('AI阅读失败: ' + e.message);
  } finally {
    setLoading(false);
    aiProcessing = false;
  }
}

// ========== AI回复批注 ==========
async function aiReplyAnnotation(annId) {
  if (aiProcessing) return;
  var parent = state.annotations.find(function(a) { return a.id === annId; });
  if (!parent) return;

  aiProcessing = true;
  var readingText = buildReadingContext();
  var conversationCtx = buildConversationContext();

  setLoading(true, 'AI正在回应...');

  try {
    var prompt = '请回应刚才用户说的话，结合之前的讨论上下文和正在读的内容，像正常聊天一样自然地回应。';
    var ctx = JSON.stringify({
      book: state.book,
      chapter: String(state.chapter),
      page: getChatPageRange().start + '-' + getChatPageRange().end,
      content: readingText,
      annotations: conversationCtx,
      quote: parent.quote || '',
      note: parent.note || ''
    });

    var result = await Bridge.callAI(prompt, ctx);

    if (result && result.success) {
      var ann = {
        id: 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        role: 'ai',
        page: parent.page,
        chapter: parent.chapter,
        book: parent.book,
        quote: '',
        note: result.text,
        replyTo: annId,
        time: new Date().toISOString()
      };

      state.annotations.push(ann);
      await saveAnnotations();
      renderChatMessages();
    } else {
      alert('AI回应失败: ' + (result ? result.error || '未知错误' : '无响应'));
    }
  } catch(e) {
    alert('AI回应失败: ' + e.message);
  } finally {
    setLoading(false);
    aiProcessing = false;
  }
}

// ========== 高亮标记 ==========
function applyHighlights() {
  state.pages.forEach(function(text, idx) {
    var pageEl = document.getElementById('page-' + idx);
    if (!pageEl) return;
    var contentEl = pageEl.querySelector('.page-content');
    if (!contentEl) return;

    var pageAnns = state.annotations.filter(function(a) {
      return a.page === idx + 1 && a.quote;
    });

    if (pageAnns.length === 0) {
      contentEl.textContent = text;
      return;
    }

    var html = escapeHtml(text);
    pageAnns.forEach(function(ann) {
      var q = escapeHtml(ann.quote);
      if (q && html.indexOf(q) !== -1) {
        html = html.split(q).join('<span class="highlight">' + q + '</span>');
      }
    });
    contentEl.innerHTML = html;
  });
}

// ========== 数据持久化 ==========
async function loadAnnotations() {
  try {
    var key = 'annotations_' + state.book + '_' + state.chapter;
    var data = await Bridge.getData(key);
    state.annotations = data ? JSON.parse(data) : [];
    renderChatMessages();
    applyHighlights();
  } catch(e) {
    console.error('loadAnnotations error', e);
  }
}

async function saveAnnotations() {
  try {
    var key = 'annotations_' + state.book + '_' + state.chapter;
    await Bridge.setData(key, JSON.stringify(state.annotations));
  } catch(e) {
    console.error('saveAnnotations error', e);
  }
}

async function saveReadingState() {
  try {
    await Bridge.setData('readingState', JSON.stringify({
      book: state.book,
      chapter: state.chapter,
      page: state.currentPage + 1
    }));
  } catch(e) {
    console.error('saveReadingState error', e);
  }
}

async function restoreReadingState() {
  try {
    var s = await Bridge.getData('readingState');
    if (s) {
      var saved = JSON.parse(s);
      if (saved.book) {
        await loadBook(saved.book, saved.chapter || 1);
        if (saved.page && saved.page > 0) {
          state.currentPage = saved.page - 1;
          updateSliderPosition();
          updatePageIndicator();
          updatePageSliderInput();
        }
      }
    }
  } catch(e) {
    console.error('restoreReadingState error', e);
  }
}

// ========== 书籍列表 ==========
async function showBookList() {
  await loadBookList();
  toggleModal('bookListModal', true);
}

async function loadBookList() {
  var container = document.getElementById('bookList');
  if (!container) return;

  setLoading(true, '加载书架...');

  try {
    // 获取所有 book_ 开头的数据
    var books = [];
    // 由于 Bridge.getData 只能获取单个 key，我们需要一种方式获取所有书籍
    // 这里假设有一个特殊 key 'book_list' 存储所有书名列表
    var bookListStr = await Bridge.getData('book_list');
    console.log('loadBookList: book_list raw =', JSON.stringify(bookListStr));
    var bookNames = [];
    try {
      if (bookListStr && bookListStr !== 'null' && bookListStr !== 'undefined') {
        bookNames = JSON.parse(bookListStr);
        if (!Array.isArray(bookNames)) bookNames = [];
      }
    } catch(e) { bookNames = []; console.error('book_list parse error:', e, 'raw:', bookListStr); }
    console.log('loadBookList: bookNames =', JSON.stringify(bookNames), 'count:', bookNames.length);

    for (var i = 0; i < bookNames.length; i++) {
      var name = bookNames[i];
      var bookStr = await Bridge.getData('book_' + name);
      console.log('loadBookList: book_' + name + ' =', bookStr ? bookStr.substring(0, 80) : 'NULL');
      if (bookStr) {
        try {
          var book = JSON.parse(bookStr);
          books.push(book);
        } catch(e2) {
          console.error('parse book data error for', name, e2);
        }
      }
    }
    console.log('loadBookList: total books loaded:', books.length);

    if (books.length === 0) {
      container.innerHTML = '<div class="book-list-empty">还没有导入书籍，点击📥导入吧</div>';
    } else {
      container.innerHTML = '';
      books.sort(function(a, b) {
        return new Date(b.importTime) - new Date(a.importTime);
      }).forEach(function(book) {
        var item = createBookItem(book);
        container.appendChild(item);
      });
    }
  } catch(e) {
    console.error('loadBookList error', e);
    container.innerHTML = '<div class="book-list-empty">加载失败</div>';
  } finally {
    setLoading(false);
  }
}

function createBookItem(book) {
  var item = document.createElement('div');
  item.className = 'book-item' + (book.title === state.book ? ' current' : '');

  var title = document.createElement('div');
  title.className = 'book-item-title';
  title.textContent = book.title;

  var meta = document.createElement('div');
  meta.className = 'book-item-meta';
  meta.innerHTML = '<span>📖 ' + (book.totalChapters || 1) + '章</span><span>' + formatDate(book.importTime) + '</span>';

  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'book-item-delete';
  deleteBtn.textContent = '🗑️';
  deleteBtn.onclick = function(e) {
    e.stopPropagation();
    deleteBook(book.title);
  };

  item.appendChild(title);
  item.appendChild(meta);
  item.appendChild(deleteBtn);

  // 点击加载书籍
  item.onclick = function() {
    loadBook(book.title, 1);
    toggleModal('bookListModal', false);
  };

  // 长按显示删除按钮
  var pressTimer = null;
  item.addEventListener('touchstart', function() {
    pressTimer = setTimeout(function() {
      item.classList.add('book-item-long-press');
    }, 500);
  }, {passive: true});
  item.addEventListener('touchend', function() {
    clearTimeout(pressTimer);
    setTimeout(function() {
      item.classList.remove('book-item-long-press');
    }, 2000);
  }, {passive: true});
  item.addEventListener('touchmove', function() {
    clearTimeout(pressTimer);
  }, {passive: true});

  return item;
}

async function deleteBook(title) {
  if (!confirm('确定要删除《' + title + '》吗？')) return;

  setLoading(true, '删除中...');

  try {
    // 获取书籍信息以删除所有章节
    var bookStr = await Bridge.getData('book_' + title);
    if (bookStr) {
      var book = JSON.parse(bookStr);
      for (var i = 1; i <= (book.totalChapters || 1); i++) {
        await Bridge.setData('chapter_' + title + '_' + i, '');
      }
    }

    // 删除书籍元数据
    await Bridge.setData('book_' + title, '');

    // 更新书名列表
    var bookListStr = await Bridge.getData('book_list');
    var bookNames = [];
    try {
      if (bookListStr && bookListStr !== 'null' && bookListStr !== 'undefined') {
        bookNames = JSON.parse(bookListStr);
        if (!Array.isArray(bookNames)) bookNames = [];
      }
    } catch(e) { bookNames = []; }
    bookNames = bookNames.filter(function(n) { return n !== title; });
    await Bridge.setData('book_list', JSON.stringify(bookNames));

    // 如果删除的是当前正在读的书
    if (title === state.book) {
      state.book = '';
      state.pages = [];
      state.totalPages = 1;
      state.currentPage = 0;
      state.annotations = [];
      renderPages();
      var titleEl = document.getElementById('bookTitle');
      if (titleEl) titleEl.textContent = '共读';
    }

    // 刷新列表
    await loadBookList();
  } catch(e) {
    alert('删除失败: ' + e.message);
  } finally {
    setLoading(false);
  }
}

// ========== 导入书籍 ==========
async function importBook() {
  setLoading(true, '正在选择文件...');

  try {
    var result = await Bridge.pickFile();
    if (result && result.success) {
      var fileName = result.fileName.replace(/\.(txt|md|markdown)$/i, '');
      await processImportedBook(fileName, result.content);
    } else {
      setLoading(false);
    }
  } catch(e) {
    setLoading(false);
    alert('导入失败: ' + e.message);
  }
}

async function processImportedBook(title, content) {
  setLoading(true, '正在导入...');

  try {
    var chapters = splitChapters(content, title);
    var bookData = {
      title: title,
      totalChapters: chapters.length,
      importTime: new Date().toISOString(),
      chapters: chapters.map(function(ch, idx) {
        return {
          index: idx + 1,
          title: ch.title,
          charCount: ch.content.length
        };
      })
    };

    // 存储章节内容
    for (var i = 0; i < chapters.length; i++) {
      await Bridge.setData('chapter_' + title + '_' + (i + 1), chapters[i].content);
    }

    // 存储书籍元数据
    await Bridge.setData('book_' + title, JSON.stringify(bookData));

    // 更新书名列表
    var bookListStr = await Bridge.getData('book_list');
    console.log('processImport: book_list raw =', JSON.stringify(bookListStr));
    var bookNames = [];
    try {
      if (bookListStr && bookListStr !== 'null' && bookListStr !== 'undefined') {
        bookNames = JSON.parse(bookListStr);
        if (!Array.isArray(bookNames)) bookNames = [];
      }
    } catch(e) { bookNames = []; }
    if (bookNames.indexOf(title) === -1) {
      bookNames.push(title);
    }
    console.log('processImport: saving book_list =', JSON.stringify(bookNames));
    await Bridge.setData('book_list', JSON.stringify(bookNames));

    // 加载刚导入的书
    await loadBook(title, 1);
  } catch(e) {
    alert('导入失败: ' + e.message);
  } finally {
    setLoading(false);
  }
}

function splitChapters(content, bookTitle) {
  var chapters = [];
  var patterns = [
    /^第[零一二三四五六七八九十百千万\d]+[章节回][\s\S]*$/gm,
    /^Chapter\s+\d+[\s\S]*$/gim,
    /^CHAPTER\s+\d+[\s\S]*$/gm
  ];

  var matches = [];
  for (var p = 0; p < patterns.length; p++) {
    patterns[p].lastIndex = 0;
    var all = [];
    var m;
    while ((m = patterns[p].exec(content)) !== null) {
      all.push(m);
    }
    if (all.length > 0) {
      matches = all;
      break;
    }
  }

  if (matches.length === 0) {
    chapters.push({
      title: bookTitle || '全文',
      content: content.trim()
    });
  } else {
    for (var i = 0; i < matches.length; i++) {
      var start = matches[i].index;
      var end = i < matches.length - 1 ? matches[i + 1].index : content.length;
      chapters.push({
        title: matches[i][0].trim().split('\n')[0].trim(),
        content: content.substring(start, end).trim()
      });
    }
  }

  return chapters.length > 0 ? chapters : [{title: '全文', content: content.trim()}];
}

// ========== 加载书籍 & 章节 ==========
async function loadBook(title, chapter) {
  state.book = title || '';
  state.chapter = chapter || 1;
  state.currentPage = 0;

  var titleEl = document.getElementById('bookTitle');
  if (titleEl) titleEl.textContent = title || '共读';

  // 加载书籍元数据
  try {
    var bookStr = await Bridge.getData('book_' + title);
    if (bookStr) {
      var book = JSON.parse(bookStr);
      if (titleEl) titleEl.textContent = book.title || title;
    }
  } catch(e) {
    console.error('loadBook metadata error', e);
  }

  await loadChapter(state.chapter);
  saveReadingState();
}

async function loadChapter(chapterNo) {
  state.chapter = chapterNo;
  state.currentPage = 0;

  try {
    var content = await Bridge.getData('chapter_' + state.book + '_' + chapterNo);
    if (content) {
      state.pages = paginateContent(content);
      state.totalPages = state.pages.length;
      renderPages();
      await loadAnnotations();
    }
  } catch(e) {
    console.error('loadChapter error', e);
  }
}

// ========== 工具函数 ==========
function escapeHtml(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    var d = new Date(isoStr);
    var month = d.getMonth() + 1;
    var date = d.getDate();
    var hours = d.getHours();
    var minutes = String(d.getMinutes()).padStart(2, '0');
    return month + '/' + date + ' ' + hours + ':' + minutes;
  } catch(e) {
    return '';
  }
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    var d = new Date(isoStr);
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  } catch(e) {
    return '';
  }
}

function setLoading(show, text) {
  var el = document.getElementById('loadingToast');
  if (el) {
    el.textContent = text || '加载中...';
    if (show) {
      el.classList.add('show');
    } else {
      el.classList.remove('show');
    }
  }
}

// ========== Hook回调 ==========
function on_page_turn(context) {
  console.log('翻页事件:', context);
}
