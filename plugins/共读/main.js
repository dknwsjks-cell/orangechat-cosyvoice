/**
 * 共读插件 - AI共读交互
 * 功能：导入书籍、章节分割、批注管理、AI共读
 */

// ==================== 工具函数导出 ====================

/**
 * 导入一本书
 * @param {Object} params - 参数对象
 * @param {string} params.content - 书籍文本内容
 * @param {string} params.title - 书名
 * @returns {Object} 导入结果
 */
function import_book(params) {
    const { content, title } = params;
    if (!content || !title) {
        return { success: false, error: "缺少必要参数：content 或 title" };
    }

    // 分割章节
    const chapters = splitChapters(content);
    
    // 存储书籍信息
    const bookData = {
        title: title,
        totalChapters: chapters.length,
        importTime: new Date().toISOString(),
        chapters: chapters.map((ch, idx) => ({
            index: idx + 1,
            title: ch.title,
            charCount: ch.content.length
        }))
    };
    
    // 存储章节内容
    chapters.forEach((ch, idx) => {
        Bridge.setData(`chapter_${title}_${idx + 1}`, ch.content);
    });
    
    // 存储书籍元数据
    Bridge.setData(`book_${title}`, JSON.stringify(bookData));
    
    // 维护书名列表（供书架UI读取）
    const listStr = Bridge.getData('book_list');
    let nameList = [];
    try {
      if (listStr && listStr !== 'null' && listStr !== 'undefined') {
        nameList = JSON.parse(listStr);
        if (!Array.isArray(nameList)) nameList = [];
      }
    } catch(e) { nameList = []; }
    if (!nameList.includes(title)) {
      nameList.push(title);
      Bridge.setData('book_list', JSON.stringify(nameList));
    }
    
    return {
        success: true,
        book: bookData
    };
}

/**
 * 获取书籍章节列表
 * @param {Object} params - 参数对象
 * @param {string} params.title - 书名
 * @returns {Object} 章节列表
 */
function get_chapters(params) {
    const { title } = params;
    if (!title) {
        return { success: false, error: "缺少必要参数：title" };
    }
    
    const bookDataStr = Bridge.getData(`book_${title}`);
    if (!bookDataStr) {
        return { success: false, error: "书籍不存在" };
    }
    
    const bookData = JSON.parse(bookDataStr);
    return {
        success: true,
        chapters: bookData.chapters
    };
}

/**
 * 获取章节内容
 * @param {Object} params - 参数对象
 * @param {string} params.title - 书名
 * @param {number} params.chapter - 章节序号（从1开始）
 * @returns {Object} 章节内容
 */
function get_chapter_content(params) {
    const { title, chapter } = params;
    if (!title || !chapter) {
        return { success: false, error: "缺少必要参数：title 或 chapter" };
    }
    
    const content = Bridge.getData(`chapter_${title}_${chapter}`);
    if (!content) {
        return { success: false, error: "章节不存在" };
    }
    
    return {
        success: true,
        content: content
    };
}

// ==================== 章节分割逻辑 ====================

/**
 * 将书籍内容分割为章节
 * 支持多种章节标题格式
 */
function splitChapters(content) {
    const chapters = [];
    
    // 常见章节标题正则
    const chapterPatterns = [
        /^第[零一二三四五六七八九十百千万\d]+[章节回][\s\S]*$/gm,
        /^Chapter\s+\d+[\s\S]*$/gim,
        /^CHAPTER\s+\d+[\s\S]*$/gm,
        /^\d+[\s\S]*$/gm
    ];
    
    // 尝试匹配章节
    let matches = [];
    for (const pattern of chapterPatterns) {
        const found = [...content.matchAll(pattern)];
        if (found.length > 0) {
            matches = found;
            break;
        }
    }
    
    if (matches.length === 0) {
        // 无法识别章节，作为单章处理
        chapters.push({
            title: "全文",
            content: content.trim()
        });
    } else {
        // 按章节分割
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = i < matches.length - 1 ? matches[i + 1].index : content.length;
            const chapterContent = content.substring(start, end).trim();
            const title = matches[i][0].trim().split('\n')[0].trim();
            
            chapters.push({
                title: title,
                content: chapterContent
            });
        }
    }
    
    return chapters;
}

// ==================== Hook 回调函数 ====================

/**
 * 翻页事件回调（由 onPageTurn hook 触发）
 * @param {Object} context - 上下文信息
 */
function on_page_turn(context) {
    console.log("翻页事件:", context);
    // 可以在这里添加翻页后的逻辑，如：
    // - 记录阅读进度
    // - 触发AI总结
    // - 更新阅读统计等
    
    try {
        const ctx = typeof context === 'string' ? JSON.parse(context) : context;
        const { book, chapter, page } = ctx;
        
        // 保存阅读进度
        Bridge.setData(`progress_${book}`, JSON.stringify({
            chapter: chapter,
            page: page,
            time: new Date().toISOString()
        }));
    } catch (e) {
        console.error("on_page_turn error:", e);
    }
}

// ==================== 批注管理工具函数 ====================

/**
 * 获取书籍的所有批注
 * @param {string} book - 书名
 * @param {number} chapter - 章节序号（可选）
 * @returns {Array} 批注列表
 */
function getAnnotations(book, chapter) {
    const key = chapter 
        ? `annotations_${book}_${chapter}`
        : `annotations_${book}`;
    const data = Bridge.getData(key);
    return data ? JSON.parse(data) : [];
}

/**
 * 保存批注
 * @param {Object} annotation - 批注对象
 */
function saveAnnotation(annotation) {
    const { book, chapter } = annotation;
    const key = chapter 
        ? `annotations_${book}_${chapter}`
        : `annotations_${book}`;
    
    const annotations = getAnnotations(book, chapter);
    annotations.push(annotation);
    Bridge.setData(key, JSON.stringify(annotations));
    
    return { success: true, annotation };
}

/**
 * 删除批注
 * @param {string} annotationId - 批注ID
 * @param {string} book - 书名
 * @param {number} chapter - 章节序号
 */
function deleteAnnotation(annotationId, book, chapter) {
    const key = chapter 
        ? `annotations_${book}_${chapter}`
        : `annotations_${book}`;
    
    let annotations = getAnnotations(book, chapter);
    annotations = annotations.filter(a => a.id !== annotationId);
    Bridge.setData(key, JSON.stringify(annotations));
    
    return { success: true };
}

/**
 * 生成唯一ID
 */
function generateId() {
    return 'ann_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

