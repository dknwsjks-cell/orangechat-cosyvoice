// 朋友圈插件
// 功能：基于 Supabase 的朋友圈，支持发布动态、点赞、评论、查看动态流
// 用户手动发 = 用户身份，AI 调用工具发 = AI 身份

// ==================== 配置 ====================

const SUPABASE_URL = 'https://nvkcztwjlbszvwkvbetf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UEd2Pn0kR2sau1Xsfk2TQw_oHC8pRhS';

function getConfig() {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    userNickname: config.user_nickname || '用户',
    aiNickname: config.ai_nickname || 'AI',
  };
}

function getAiUserId() {
  const cfg = getConfig();
  return 'ai_' + cfg.aiNickname;
}

// ==================== Supabase REST API ====================

async function supabaseRequest(table, method, data, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query || ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'return=representation'
            : method === 'PATCH' ? 'return=representation'
            : method === 'DELETE' ? 'return=representation'
            : ''
  };

  const response = await fetch(url, {
    method: method,
    headers: headers,
    body: data ? JSON.stringify(data) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase error: ${response.status} - ${errorText}`);
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
}

// ==================== 用户管理 ====================

async function ensureAiUser() {
  const cfg = getConfig();
  const aiId = getAiUserId();

  try {
    const users = await supabaseRequest('moment_users', 'GET', null, `?id=eq.${encodeURIComponent(aiId)}`);
    if (!users || users.length === 0) {
      await supabaseRequest('moment_users', 'POST', {
        id: aiId,
        nickname: cfg.aiNickname
      });
    } else {
      await supabaseRequest('moment_users', 'PATCH', {
        nickname: cfg.aiNickname
      }, `?id=eq.${encodeURIComponent(aiId)}`);
    }
  } catch (error) {
    console.error('Failed to ensure AI user:', error);
  }
}

// ==================== 工具：发布动态（AI 身份）====================

async function moments_publish(params) {
  const { content, image_urls } = params;
  if (!content || content.trim() === '') {
    return { success: false, error: '动态内容不能为空' };
  }

  try {
    await ensureAiUser();
    const aiId = getAiUserId();

    const moment = await supabaseRequest('moments', 'POST', {
      user_id: aiId,
      content: content.trim()
    });

    if (image_urls) {
      const urls = image_urls.split(',').map(u => u.trim()).filter(u => u);
      for (let i = 0; i < urls.length; i++) {
        await supabaseRequest('moment_images', 'POST', {
          moment_id: moment[0].id,
          image_url: urls[i],
          sort_order: i
        });
      }
    }

    return {
      success: true,
      data: { id: moment[0].id, content: content, message: '朋友圈发布成功！' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：获取动态流 ====================

async function moments_feed(params) {
  const { limit = 5, offset = 0 } = params || {};

  try {
    const moments = await supabaseRequest('moments', 'GET', null,
      `?order=created_at.desc&limit=${limit}&offset=${offset}&select=*,moment_users(nickname,id)`
    );

    if (!moments || moments.length === 0) {
      return { success: true, data: [], message: '暂无动态' };
    }

    const enrichedMoments = [];
    for (const moment of moments) {
      const images = await supabaseRequest('moment_images', 'GET', null,
        `?moment_id=eq.${moment.id}&order=sort_order.asc`
      );
      const likes = await supabaseRequest('moment_likes', 'GET', null,
        `?moment_id=eq.${moment.id}&select=*,moment_users(nickname)`
      );
      const comments = await supabaseRequest('moment_comments', 'GET', null,
        `?moment_id=eq.${moment.id}&order=created_at.asc&select=*,moment_users(nickname,id)`
      );

      const cfg = getConfig();
      const userId = 'user_' + cfg.userNickname;
      const isLikedByMe = likes && likes.some(l => l.user_id === userId);

      enrichedMoments.push({
        id: moment.id,
        content: moment.content,
        createdAt: moment.created_at,
        user: moment.moment_users,
        images: images || [],
        likes: (likes || []).map(l => ({ user: l.moment_users, createdAt: l.created_at })),
        likeCount: (likes || []).length,
        isLikedByMe: isLikedByMe,
        comments: (comments || []).map(c => ({
          id: c.id,
          content: c.content,
          createdAt: c.created_at,
          user: c.moment_users
        }))
      });
    }

    return { success: true, data: enrichedMoments };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：点赞/取消点赞（AI 身份）====================

async function moments_like(params) {
  const { moment_id } = params;
  if (!moment_id) {
    return { success: false, error: '缺少 moment_id 参数' };
  }

  try {
    await ensureAiUser();
    const aiId = getAiUserId();

    const existing = await supabaseRequest('moment_likes', 'GET', null,
      `?moment_id=eq.${moment_id}&user_id=eq.${encodeURIComponent(aiId)}`
    );

    if (existing && existing.length > 0) {
      await supabaseRequest('moment_likes', 'DELETE', null,
        `?moment_id=eq.${moment_id}&user_id=eq.${encodeURIComponent(aiId)}`
      );
      return { success: true, data: { liked: false, message: '已取消点赞' } };
    } else {
      await supabaseRequest('moment_likes', 'POST', {
        moment_id: moment_id,
        user_id: aiId
      });
      return { success: true, data: { liked: true, message: '已点赞' } };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：评论（AI 身份）====================

async function moments_comment(params) {
  const { moment_id, content } = params;
  if (!moment_id || !content) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    await ensureAiUser();
    const aiId = getAiUserId();

    const comment = await supabaseRequest('moment_comments', 'POST', {
      moment_id: moment_id,
      user_id: aiId,
      content: content.trim()
    });

    return {
      success: true,
      data: { id: comment[0].id, message: '评论成功' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 导出 ====================

exports.moments_publish = moments_publish;
exports.moments_feed = moments_feed;
exports.moments_like = moments_like;
exports.moments_comment = moments_comment;