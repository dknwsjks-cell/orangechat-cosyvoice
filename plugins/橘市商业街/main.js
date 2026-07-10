// 橘市商业街插件
// 功能：基于 Supabase 的商业街经营社区，支持开店、商品管理、交易、AI到访、每日事件等

// ==================== 配置 ====================

const SUPABASE_URL = 'https://nvkcztwjlbszvwkvbetf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UEd2Pn0kR2sau1Xsfk2TQw_oHC8pRhS';

const SHOP_TYPES = {
  // 虚拟经营区
  oden:     { name: '关东煮烤肠店', icon: '🍢', area: 'virtual', basePrice: [10, 30] },
  coffee:   { name: '咖啡店',       icon: '☕', area: 'virtual', basePrice: [30, 80] },
  bookstore:{ name: '书店',         icon: '📚', area: 'virtual', basePrice: [20, 60] },
  arcade:   { name: '电玩城',       icon: '🎮', area: 'virtual', basePrice: [20, 50] },
  milktea:  { name: '奶茶店',       icon: '🧋', area: 'virtual', basePrice: [15, 50] },
  // 真实资源区
  persona:  { name: '人设商店',     icon: '🎭', area: 'real', basePrice: [50, 500] },
  font:     { name: '字体商店',     icon: '🔤', area: 'real', basePrice: [30, 300] },
  custom:   { name: '自定义商店',   icon: '🏪', area: 'real', basePrice: [10, 999] },
};

// AI人设关键词 → 偏好店铺类型
const PERSONA_PREFERENCES = {
  '文艺': ['bookstore', 'coffee'], '安静': ['bookstore', 'coffee'], '书': ['bookstore', 'coffee'],
  '阅读': ['bookstore', 'coffee'], '诗意': ['bookstore', 'coffee'],
  '活泼': ['arcade', 'milktea'], '社牛': ['arcade', 'milktea'], '游戏': ['arcade', 'milktea'],
  '开朗': ['arcade', 'milktea'], '热情': ['arcade', 'milktea'],
  '温柔': ['coffee', 'oden'], '治愈': ['coffee', 'oden'], '暖心': ['coffee', 'oden'],
  '关心': ['coffee', 'oden'], '体贴': ['coffee', 'oden'],
  '理性': ['bookstore', 'custom'], '实用': ['custom'], '分析': ['bookstore'],
  '逻辑': ['bookstore'], '技术': ['custom'],
  '创意': ['persona', 'custom'], '感性': ['persona'],
  '角色': ['persona'], '人设': ['persona'], '扮演': ['persona'], 'rp': ['persona'],
  '字体': ['font'], '手写': ['font'], '书法': ['font'],
  '故事': ['bookstore'], '剧本': ['persona'], '哄睡': ['coffee'],
};

// 跨店联动定义
const CROSS_SHOP_SYNERGIES = [
  { shops: ['coffee', 'bookstore'], name: '文艺下午茶', effect: '满意度+20%，双方收入+20%', incomeBonus: 0.2 },
  { shops: ['oden', 'arcade'], name: '深夜食堂', effect: '夜间收入翻倍', timeRange: [20, 2], incomeBonus: 1.0 },
  { shops: ['milktea'], name: '甜蜜加成', effect: '随机触发5星好评', incomeBonus: 0.1 },
  { shops: ['coffee', 'milktea'], name: '饮品联盟', effect: '流量+15%', incomeBonus: 0.15 },
  { shops: ['bookstore', 'arcade'], name: '文理双修', effect: '新客+30%', incomeBonus: 0.3 },
];

const DAILY_BONUS = 50;
const AI_PURCHASE_DISCOUNT = 0.7;
const MAX_AI_DAILY_PURCHASES = 3;

// ==================== 配置获取 ====================

function getConfig() {
  return {
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    userNickname: config.user_nickname || '用户',
    aiNickname: config.ai_nickname || 'AI',
  };
}

function getUserId() {
  return 'user_' + getConfig().userNickname;
}

function getAiUserId() {
  return 'ai_' + getConfig().aiNickname;
}

// ==================== toUTC ====================

function toUTC(ts) {
  if (!ts) return new Date().toISOString();
  if (typeof ts === 'string' && ts.endsWith('Z')) return ts;
  return new Date(ts).toISOString();
}

// ==================== Supabase REST API ====================

async function supabaseRequest(table, method, data, query) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${query || ''}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': ['POST', 'PATCH', 'DELETE'].includes(method) ? 'return=representation' : ''
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

async function ensureUser() {
  const cfg = getConfig();
  const userId = getUserId();

  try {
    const users = await supabaseRequest('market_users', 'GET', null,
      `?id=eq.${encodeURIComponent(userId)}`);
    if (!users || users.length === 0) {
      await supabaseRequest('market_users', 'POST', {
        id: userId,
        nickname: cfg.userNickname,
        ai_name: cfg.aiNickname,
        coins: 500,
      });
    } else {
      await supabaseRequest('market_users', 'PATCH', {
        nickname: cfg.userNickname,
        ai_name: cfg.aiNickname,
        last_online: new Date().toISOString(),
      }, `?id=eq.${encodeURIComponent(userId)}`);
    }
  } catch (error) {
    console.error('Failed to ensure user:', error);
  }
}

async function getUserCoins(userId) {
  const users = await supabaseRequest('market_users', 'GET', null,
    `?id=eq.${encodeURIComponent(userId)}&select=coins`);
  return users && users.length > 0 ? users[0].coins : 0;
}

async function updateUserCoins(userId, delta) {
  // 使用 RPC 或直接更新
  const users = await supabaseRequest('market_users', 'GET', null,
    `?id=eq.${encodeURIComponent(userId)}&select=coins`);
  if (!users || users.length === 0) throw new Error('用户不存在');

  const newCoins = Math.max(0, users[0].coins + delta);
  await supabaseRequest('market_users', 'PATCH', {
    coins: newCoins
  }, `?id=eq.${encodeURIComponent(userId)}`);

  return newCoins;
}

// ==================== 事件倍率计算 ====================

// 获取今日某店铺类型的收入倍率（考虑所有活跃事件）
async function getEventMultiplier(shop_type) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const events = await supabaseRequest('daily_events', 'GET', null,
      `?event_date=eq.${today}`);
    if (!events || events.length === 0) return { multiplier: 1.0, eventDetails: [] };

    let totalMultiplier = 1.0;
    const eventDetails = [];

    for (const evt of events) {
      let apply = false;
      let mult = 1.0;

      switch (evt.event_type) {
        case 'market_day': // 赶集日：全街收入×2
          apply = true; mult = 2.0;
          break;
        case 'festival': // 节日：双倍收入
          apply = true; mult = 2.0;
          break;
        case 'rain': // 暴雨：奶茶/关东煮+50%，其余-20%
          if (shop_type === 'milktea' || shop_type === 'oden') {
            apply = true; mult = 1.5;
          } else {
            apply = true; mult = 0.8;
          }
          break;
        case 'viral': // 网红探店：影响目标店铺（target_shop_id）
          if (evt.target_shop_id) {
            // 需要外部传入 shop_id 来判断，这里标记 universal
            apply = true; mult = 1.0; // viral 通过 target_shop_id 单独处理
          }
          break;
        case 'blackout': // 断电：影响目标店铺
          // 断电通过 is_open 状态控制，不影响倍率
          break;
        case 'mystery_rich': // 神秘土豪：随机大额消费，不改变倍率
          break;
        case 'supply_sale': // 进货打折：影响上架成本（-50%），收入不变
          break;
        case 'stray_cat': // 流浪猫：好评+5%，不影响收入
          break;
        case 'mystery_gift': // 神秘礼盒：不影响收入
          break;
        default:
          break;
      }

      if (apply && mult !== 1.0) {
        totalMultiplier *= mult;
        eventDetails.push({ type: evt.event_type, description: evt.description, mult: mult });
      }
    }

    return { multiplier: Math.round(totalMultiplier * 100) / 100, eventDetails };
  } catch (e) {
    return { multiplier: 1.0, eventDetails: [] };
  }
}

// ==================== 工具：获取店铺状态 ====================

async function market_get_status() {
  try {
    await ensureUser();
    const userId = getUserId();
    const cfg = getConfig();

    // 获取用户信息
    const users = await supabaseRequest('market_users', 'GET', null,
      `?id=eq.${encodeURIComponent(userId)}`);
    if (!users || users.length === 0) {
      return { success: false, error: '用户未注册' };
    }
    const user = users[0];

    // 获取店铺信息
    const shops = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}`);

    let shopInfo = null;
    if (shops && shops.length > 0) {
      const shop = shops[0];

      // 今日收入
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const transactions = await supabaseRequest('transactions', 'GET', null,
        `?seller_id=eq.${encodeURIComponent(userId)}&created_at=gte.${toUTC(today.toISOString())}&select=amount`);
      const todayRevenue = (transactions || []).reduce((sum, t) => sum + t.amount, 0);

      // 未读到访
      const lastOnline = user.last_online || user.created_at;
      const visits = await supabaseRequest('ai_visits', 'GET', null,
        `?target_shop_id=eq.${shop.id}&created_at=gte.${toUTC(lastOnline)}&order=created_at.desc&limit=10`);

      const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };

      shopInfo = {
        id: shop.id,
        name: shop.shop_name,
        type: shop.shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        level: shop.level,
        exp: shop.exp,
        rating: Math.round(shop.rating * 10) / 10,
        visitCount: shop.visit_count,
        totalRevenue: shop.total_revenue,
        todayRevenue: todayRevenue,
        isOpen: shop.is_open,
        recentVisits: (visits || []).map(v => ({
          visitorAiName: v.visitor_ai_name,
          action: v.action,
          message: v.message,
          amount: v.amount,
          time: v.created_at,
        })),
      };
    }

    return {
      success: true,
      data: {
        userId: userId,
        nickname: user.nickname,
        coins: user.coins,
        aiName: user.ai_name,
        hasShop: shops && shops.length > 0,
        shop: shopInfo,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：浏览店铺 ====================

async function market_browse_shops(params) {
  const { shop_type, limit = 10 } = params || {};

  try {
    let query = `?is_open=eq.true&order=visit_count.desc&limit=${limit}&select=*,market_users(nickname)`;
    if (shop_type) {
      query = `?shop_type=eq.${shop_type}&is_open=eq.true&order=visit_count.desc&limit=${limit}&select=*,market_users(nickname)`;
    }

    const shops = await supabaseRequest('shops', 'GET', null, query);

    if (!shops || shops.length === 0) {
      return { success: true, data: [], message: '商业街上还没有店铺' };
    }

    const result = shops.map(shop => {
      const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };
      return {
        id: shop.id,
        name: shop.shop_name,
        type: shop.shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        ownerName: shop.owner_name,
        level: shop.level,
        rating: Math.round(shop.rating * 10) / 10,
        visitCount: shop.visit_count,
        description: shop.shop_description,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：访问店铺（AI身份）====================

async function market_visit_shop(params) {
  const { shop_id } = params;
  if (!shop_id) {
    return { success: false, error: '缺少 shop_id 参数' };
  }

  try {
    await ensureUser();
    const cfg = getConfig();
    const aiId = getAiUserId();

    // 获取店铺信息
    const shops = await supabaseRequest('shops', 'GET', null,
      `?id=eq.${shop_id}&select=*`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '店铺不存在' };
    }
    const shop = shops[0];

    // 获取商品列表
    const products = await supabaseRequest('products', 'GET', null,
      `?shop_id=eq.${shop_id}&is_hidden=eq.false&order=sort_order.asc`);

    // 记录AI到访
    const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };

    await supabaseRequest('ai_visits', 'POST', {
      visitor_ai_name: cfg.aiNickname,
      visitor_user_name: cfg.userNickname,
      visitor_user_id: aiId,
      target_shop_id: shop_id,
      action: 'browse',
      message: `${cfg.aiNickname} 来到了 ${shop.shop_name}`,
    });

    // 更新店铺访问量
    await supabaseRequest('shops', 'PATCH', {
      visit_count: shop.visit_count + 1
    }, `?id=eq.${shop_id}`);

    return {
      success: true,
      data: {
        id: shop.id,
        name: shop.shop_name,
        type: shop.shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        ownerName: shop.owner_name,
        aiName: shop.ai_name,
        level: shop.level,
        rating: Math.round(shop.rating * 10) / 10,
        description: shop.shop_description,
        products: (products || []).map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          isReal: p.is_real,
          stock: p.stock,
          resourceUrl: p.resource_url || null,
        })),
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：购买商品（AI身份）====================

async function market_buy_product(params) {
  const { shop_id, product_id } = params;
  if (!shop_id || !product_id) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    await ensureUser();
    const cfg = getConfig();
    const aiId = getAiUserId();

    // 检查今日购买次数（防刷）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPurchases = await supabaseRequest('transactions', 'GET', null,
      `?buyer_id=eq.${encodeURIComponent(aiId)}&shop_id=eq.${shop_id}&created_at=gte.${toUTC(today.toISOString())}`);
    if (todayPurchases && todayPurchases.length >= MAX_AI_DAILY_PURCHASES) {
      return { success: false, error: `今天已经在这家店消费${MAX_AI_DAILY_PURCHASES}次了，明天再来吧` };
    }

    // 获取商品信息
    const products = await supabaseRequest('products', 'GET', null,
      `?id=eq.${product_id}&shop_id=eq.${shop_id}`);
    if (!products || products.length === 0) {
      return { success: false, error: '商品不存在' };
    }
    const product = products[0];

    // 检查库存
    if (product.stock > 0) {
      // 减库存
      await supabaseRequest('products', 'PATCH', {
        stock: product.stock - 1
      }, `?id=eq.${product_id}`);
    } else if (product.stock === 0) {
      return { success: false, error: '商品已售罄' };
    }

    // AI消费打七折
    const actualAmount = Math.floor(product.price * AI_PURCHASE_DISCOUNT);

    // 获取买家（AI关联的用户）的余额
    const buyerCoins = await getUserCoins(aiId);
    if (buyerCoins < actualAmount) {
      return { success: false, error: `橘币不足，需要${actualAmount}，当前${buyerCoins}` };
    }

    // 获取卖家信息
    const shops = await supabaseRequest('shops', 'GET', null,
      `?id=eq.${shop_id}&select=owner_id,shop_name,shop_type`);
    const sellerId = shops[0].owner_id;

    // 获取今日事件倍率
    const { multiplier: eventMult, eventDetails } = await getEventMultiplier(shops[0].shop_type);
    const sellerIncome = Math.floor(actualAmount * eventMult);

    // 扣买家钱
    await updateUserCoins(aiId, -actualAmount);

    // 加卖家钱（应用事件倍率）
    await updateUserCoins(sellerId, sellerIncome);

    // 记录交易
    await supabaseRequest('transactions', 'POST', {
      buyer_id: aiId,
      seller_id: sellerId,
      shop_id: shop_id,
      product_id: product_id,
      amount: actualAmount,
      original_price: product.price,
      is_ai_purchase: true,
      ai_visitor_name: cfg.aiNickname,
    });

    // 记录AI到访
    await supabaseRequest('ai_visits', 'POST', {
      visitor_ai_name: cfg.aiNickname,
      visitor_user_name: cfg.userNickname,
      visitor_user_id: aiId,
      target_shop_id: shop_id,
      action: 'purchase',
      message: `${cfg.aiNickname} 购买了 ${product.name}（${actualAmount}橘币）`,
      product_id: product_id,
      amount: actualAmount,
    });

    // 更新店铺收入（用事件加成后的收入）
    await supabaseRequest('shops', 'PATCH', {
      total_revenue: shops[0].total_revenue + sellerIncome,
      visit_count: shops[0].visit_count + 1,
    }, `?id=eq.${shop_id}`);

    // 经验值增加
    const expGain = Math.max(1, Math.floor(sellerIncome / 10));
    const shopFull = (await supabaseRequest('shops', 'GET', null, `?id=eq.${shop_id}`))[0];
    await supabaseRequest('shops', 'PATCH', {
      exp: shopFull.exp + expGain,
    }, `?id=eq.${shop_id}`);

    const eventMsg = eventMult !== 1.0 ? `（今日事件×${eventMult}，店主实收${sellerIncome}橘币）` : '';

    return {
      success: true,
      data: {
        productName: product.name,
        originalPrice: product.price,
        paidAmount: actualAmount,
        sellerIncome: sellerIncome,
        eventMultiplier: eventMult,
        discount: 'AI七折优惠',
        message: `${cfg.aiNickname} 在 ${shops[0].shop_name} 购买了 ${product.name}，花费 ${actualAmount} 橘币（原价${product.price}，AI七折）${eventMsg}`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：评价店铺（AI身份）====================

async function market_review_shop(params) {
  const { shop_id, rating, content } = params;
  if (!shop_id || !rating || !content) {
    return { success: false, error: '缺少必要参数' };
  }

  const clampedRating = Math.max(1, Math.min(5, Math.floor(rating)));

  try {
    await ensureUser();
    const cfg = getConfig();
    const aiId = getAiUserId();

    // 检查是否已评价
    const existing = await supabaseRequest('reviews', 'GET', null,
      `?shop_id=eq.${shop_id}&reviewer_id=eq.${encodeURIComponent(aiId)}`);
    if (existing && existing.length > 0) {
      return { success: false, error: '你已经评价过这家店了' };
    }

    // 添加评价
    await supabaseRequest('reviews', 'POST', {
      shop_id: shop_id,
      reviewer_id: aiId,
      reviewer_name: cfg.aiNickname,
      rating: clampedRating,
      content: content.trim(),
      is_ai_review: true,
    });

    // 更新店铺评分
    const reviews = await supabaseRequest('reviews', 'GET', null,
      `?shop_id=eq.${shop_id}&select=rating`);
    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalRating / reviews.length;

    await supabaseRequest('shops', 'PATCH', {
      rating: Math.round(avgRating * 100) / 100,
      rating_count: reviews.length,
    }, `?id=eq.${shop_id}`);

    // 记录AI到访
    await supabaseRequest('ai_visits', 'POST', {
      visitor_ai_name: cfg.aiNickname,
      visitor_user_name: cfg.userNickname,
      visitor_user_id: aiId,
      target_shop_id: shop_id,
      action: 'review',
      message: `${cfg.aiNickname} 给了 ${clampedRating} 星好评：「${content}」`,
    });

    return {
      success: true,
      data: { rating: clampedRating, message: '评价成功' }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：和店员AI聊天 ====================

async function market_chat_with_shop(params) {
  const { shop_id, message } = params;
  if (!shop_id || !message) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    await ensureUser();
    const cfg = getConfig();
    const aiId = getAiUserId();

    // 获取店铺信息
    const shops = await supabaseRequest('shops', 'GET', null,
      `?id=eq.${shop_id}&select=*`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '店铺不存在' };
    }
    const shop = shops[0];
    const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };

    // 记录AI到访聊天
    await supabaseRequest('ai_visits', 'POST', {
      visitor_ai_name: cfg.aiNickname,
      visitor_user_name: cfg.userNickname,
      visitor_user_id: aiId,
      target_shop_id: shop_id,
      action: 'browse',
      message: `${cfg.aiNickname} 对 ${shop.ai_name} 说：「${message}」`,
    });

    // 返回店铺信息，让调用方AI根据店主人设生成回复
    return {
      success: true,
      data: {
        shopName: shop.shop_name,
        shopType: shopType.name,
        shopIcon: shopType.icon,
        shopAiName: shop.ai_name,
        shopAiPersona: shop.ai_persona || '热情的店员',
        shopLevel: shop.level,
        visitorMessage: message,
        hint: `你是${shop.shop_name}的店员AI「${shop.ai_name}」，请根据你的人设回复这位客人「${cfg.aiNickname}」的话。`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：获取每日事件 ====================

async function market_get_daily_events() {
  try {
    const today = new Date().toISOString().split('T')[0];
    let events = await supabaseRequest('daily_events', 'GET', null,
      `?event_date=eq.${today}`);

    // 如果今天还没有事件，生成
    if (!events || events.length === 0) {
      const allEvents = [
        { event_type: 'market_day', description: '🏪 赶集日！全街客流量×3', multiplier: 3.0 },
        { event_type: 'mystery_rich', description: '💰 神秘土豪出没！随机一店单笔巨额消费', multiplier: 1.0 },
        { event_type: 'rain', description: '🌧️ 暴雨天！奶茶/关东煮+50%，其余-20%', multiplier: 1.5 },
        { event_type: 'festival', description: '🎉 节日活动！双倍收入', multiplier: 2.0 },
        { event_type: 'viral', description: '🔥 网红探店！随机一店流量+200%', multiplier: 3.0 },
        { event_type: 'supply_sale', description: '📦 进货打折！原材料今日半价', multiplier: 0.5 },
        { event_type: 'stray_cat', description: '🐱 流浪猫到访！收养后好评率+5%', multiplier: 1.0 },
        { event_type: 'blackout', description: '⚡ 断电事件！随机一店停业2小时', multiplier: 0.0 },
        { event_type: 'mystery_gift', description: '🎁 神秘礼盒！前3个点击的用户得随机奖励', multiplier: 1.0 },
      ];

      // 随机选1-3个事件
      const count = Math.floor(Math.random() * 3) + 1;
      const shuffled = allEvents.sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, count);

      for (const evt of selected) {
        await supabaseRequest('daily_events', 'POST', {
          event_date: today,
          event_type: evt.event_type,
          description: evt.description,
          multiplier: evt.multiplier,
        });
      }

      events = await supabaseRequest('daily_events', 'GET', null,
        `?event_date=eq.${today}`);
    }

    return {
      success: true,
      data: (events || []).map(e => ({
        type: e.event_type,
        description: e.description,
        multiplier: e.multiplier,
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：领取每日橘币 ====================

async function market_claim_daily_bonus() {
  try {
    await ensureUser();
    const userId = getUserId();

    const users = await supabaseRequest('market_users', 'GET', null,
      `?id=eq.${encodeURIComponent(userId)}`);
    if (!users || users.length === 0) {
      return { success: false, error: '用户未注册' };
    }

    const user = users[0];
    const lastClaim = user.last_daily_claim;
    const now = new Date();

    // 检查今天是否已领取
    if (lastClaim) {
      const lastDate = new Date(lastClaim);
      if (lastDate.toDateString() === now.toDateString()) {
        return { success: false, error: '今天已经领取过了', data: { alreadyClaimed: true, coins: user.coins } };
      }
    }

    // 发放奖励
    const newCoins = await updateUserCoins(userId, DAILY_BONUS);
    await supabaseRequest('market_users', 'PATCH', {
      last_daily_claim: now.toISOString()
    }, `?id=eq.${encodeURIComponent(userId)}`);

    return {
      success: true,
      data: {
        claimed: DAILY_BONUS,
        totalCoins: newCoins,
        message: `领取成功！+${DAILY_BONUS} 橘币 🍊`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：管理商品 ====================

async function market_manage_products(params) {
  const { action, name, description, price, product_id, resource_url } = params;
  if (!action) {
    return { success: false, error: '缺少 action 参数' };
  }

  try {
    await ensureUser();
    const userId = getUserId();

    // 获取用户店铺
    const shops = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '你还没有开店，请先在商业街页面开店' };
    }
    const shop = shops[0];
    const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };

    if (action === 'add') {
      if (!name || !price) {
        return { success: false, error: '添加商品需要 name 和 price' };
      }

      // 检查商品数量上限（等级限制）
      const currentProducts = await supabaseRequest('products', 'GET', null,
        `?shop_id=eq.${shop.id}&is_hidden=eq.false`);
      const maxProducts = 3 + Math.floor(shop.level / 5) * 2; // 等级5解锁额外槽位
      if (currentProducts && currentProducts.length >= maxProducts) {
        return { success: false, error: `商品槽已满（${maxProducts}个），升级店铺解锁更多` };
      }

      const product = await supabaseRequest('products', 'POST', {
        shop_id: shop.id,
        name: name.trim(),
        description: description || '',
        price: Math.max(1, price),
        is_real: shopType.area === 'real',
        stock: -1,
        sort_order: (currentProducts || []).length,
        resource_url: resource_url || null,
      });

      return {
        success: true,
        data: {
          id: product[0].id,
          name: name,
          price: price,
          message: `商品「${name}」已上架，定价 ${price} 橘币`,
        }
      };

    } else if (action === 'update') {
      if (!product_id) {
        return { success: false, error: '修改商品需要 product_id' };
      }

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (description !== undefined) updateData.description = description;
      if (price) updateData.price = Math.max(1, price);

      await supabaseRequest('products', 'PATCH', updateData,
        `?id=eq.${product_id}&shop_id=eq.${shop.id}`);

      return {
        success: true,
        data: { message: '商品已更新' }
      };

    } else if (action === 'remove') {
      if (!product_id) {
        return { success: false, error: '下架商品需要 product_id' };
      }

      await supabaseRequest('products', 'PATCH', {
        is_hidden: true
      }, `?id=eq.${product_id}&shop_id=eq.${shop.id}`);

      return {
        success: true,
        data: { message: '商品已下架' }
      };

    } else {
      return { success: false, error: `未知操作：${action}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：注册开店 ====================

async function market_register_shop(params) {
  const { shop_type, shop_name } = params;
  if (!shop_type || !shop_name) {
    return { success: false, error: '缺少 shop_type 或 shop_name 参数' };
  }

  if (!SHOP_TYPES[shop_type]) {
    return { success: false, error: '无效的店铺类型，可选：' + Object.keys(SHOP_TYPES).join('/') };
  }

  try {
    await ensureUser();
    const userId = getUserId();
    const cfg = getConfig();

    // 检查是否已有店铺
    const existing = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}`);
    if (existing && existing.length > 0) {
      return { success: false, error: '你已经有一家店了', data: { shopId: existing[0].id } };
    }

    const shopType = SHOP_TYPES[shop_type];
    const shop = await supabaseRequest('shops', 'POST', {
      owner_id: userId,
      owner_name: cfg.userNickname,
      ai_name: cfg.aiNickname,
      ai_persona: '',
      shop_type: shop_type,
      shop_name: shop_name.trim(),
      shop_description: `欢迎来到${shop_name}！${shopType.icon} ${shopType.name}`,
      level: 1,
      exp: 0,
      rating: 5.0,
      rating_count: 0,
      visit_count: 0,
      total_revenue: 0,
      is_open: true,
    });

    return {
      success: true,
      data: {
        id: shop[0].id,
        name: shop_name,
        type: shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        message: `恭喜！你的${shopType.icon}${shopType.name}「${shop_name}」开业了！`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：真人购买商品 ====================

async function market_human_buy(params) {
  const { shop_id, product_id } = params;
  if (!shop_id || !product_id) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    await ensureUser();
    const userId = getUserId();
    const cfg = getConfig();

    // 获取商品
    const products = await supabaseRequest('products', 'GET', null,
      `?id=eq.${product_id}&shop_id=eq.${shop_id}`);
    if (!products || products.length === 0) {
      return { success: false, error: '商品不存在' };
    }
    const product = products[0];

    // 不能买自己的
    const shops = await supabaseRequest('shops', 'GET', null,
      `?id=eq.${shop_id}&select=owner_id,shop_name,shop_type,total_revenue,visit_count`);
    if (shops[0].owner_id === userId) {
      return { success: false, error: '不能买自己店铺的商品' };
    }

    // 获取今日事件倍率
    const { multiplier: eventMult } = await getEventMultiplier(shops[0].shop_type);

    // 检查库存
    if (product.stock === 0) {
      return { success: false, error: '商品已售罄' };
    }
    if (product.stock > 0) {
      await supabaseRequest('products', 'PATCH', { stock: product.stock - 1 }, `?id=eq.${product_id}`);
    }

    // 真人全价
    const price = product.price;
    const buyerCoins = await getUserCoins(userId);
    if (buyerCoins < price) {
      return { success: false, error: `橘币不足，需要${price}，当前${buyerCoins}` };
    }

    const sellerId = shops[0].owner_id;
    const sellerIncome = Math.floor(price * eventMult);

    await updateUserCoins(userId, -price);
    await updateUserCoins(sellerId, sellerIncome);

    // 记录交易
    await supabaseRequest('transactions', 'POST', {
      buyer_id: userId,
      seller_id: sellerId,
      shop_id: shop_id,
      product_id: product_id,
      amount: price,
      original_price: price,
      is_ai_purchase: false,
    });

    // 更新店铺收入（用事件加成后的收入）
    await supabaseRequest('shops', 'PATCH', {
      total_revenue: shops[0].total_revenue + sellerIncome,
      visit_count: shops[0].visit_count + 1,
    }, `?id=eq.${shop_id}`);

    const eventMsg = eventMult !== 1.0 ? `（今日事件×${eventMult}，店主实收${sellerIncome}橘币）` : '';

    return {
      success: true,
      data: {
        productName: product.name,
        paidAmount: price,
        sellerIncome: sellerIncome,
        eventMultiplier: eventMult,
        message: `购买了「${product.name}」，花费 ${price} 橘币${eventMsg}`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：获取自己店铺商品 ====================

async function market_get_own_products() {
  try {
    await ensureUser();
    const userId = getUserId();

    const shops = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '你还没有开店' };
    }

    const products = await supabaseRequest('products', 'GET', null,
      `?shop_id=eq.${shops[0].id}&is_hidden=eq.false&order=sort_order.asc`);

    return {
      success: true,
      data: {
        shopId: shops[0].id,
        shopName: shops[0].shop_name,
        products: (products || []).map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          isReal: p.is_real,
          stock: p.stock,
          resourceUrl: p.resource_url || null,
        })),
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：获取某店铺详情+商品（真人浏览）====================

async function market_get_shop_detail(params) {
  const { shop_id } = params;
  if (!shop_id) return { success: false, error: '缺少 shop_id' };

  try {
    const shops = await supabaseRequest('shops', 'GET', null, `?id=eq.${shop_id}`);
    if (!shops || shops.length === 0) return { success: false, error: '店铺不存在' };
    const shop = shops[0];
    const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };

    const products = await supabaseRequest('products', 'GET', null,
      `?shop_id=eq.${shop_id}&is_hidden=eq.false&order=sort_order.asc`);

    const reviews = await supabaseRequest('reviews', 'GET', null,
      `?shop_id=eq.${shop_id}&order=created_at.desc&limit=5`);

    return {
      success: true,
      data: {
        id: shop.id,
        name: shop.shop_name,
        type: shop.shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        area: shopType.area,
        ownerName: shop.owner_name,
        aiName: shop.ai_name,
        level: shop.level,
        rating: Math.round(shop.rating * 10) / 10,
        visitCount: shop.visit_count,
        totalRevenue: shop.total_revenue,
        description: shop.shop_description,
        isOpen: shop.is_open,
        products: (products || []).map(p => ({
          id: p.id, name: p.name, description: p.description,
          price: p.price, isReal: p.is_real, stock: p.stock,
          resourceUrl: p.resource_url || null,
        })),
        reviews: (reviews || []).map(r => ({
          reviewerName: r.reviewer_name, rating: r.rating,
          content: r.content, isAi: r.is_ai_review, time: r.created_at,
        })),
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：AI人设偏好推荐店铺 ====================

async function market_get_recommended_shops(params) {
  const { persona_text, limit = 5 } = params || {};
  if (!persona_text) {
    return { success: false, error: '缺少 persona_text 参数（AI的人设/system prompt文本）' };
  }

  try {
    // 从人设文本中提取匹配的关键词，累计各店铺类型的偏好分数
    const scores = {};
    const text = persona_text.toLowerCase();
    for (const [keyword, types] of Object.entries(PERSONA_PREFERENCES)) {
      if (text.includes(keyword.toLowerCase())) {
        for (const type of types) {
          scores[type] = (scores[type] || 0) + 1;
        }
      }
    }

    // 按分数排序偏好类型
    const preferredTypes = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([type]) => type);

    // 如果没有匹配到偏好，返回所有类型
    const allTypes = Object.keys(SHOP_TYPES);
    const searchTypes = preferredTypes.length > 0 ? preferredTypes : allTypes;

    // 获取在线店铺，按偏好排序
    const shops = await supabaseRequest('shops', 'GET', null,
      `?is_open=eq.true&order=visit_count.desc&limit=50`);

    if (!shops || shops.length === 0) {
      return { success: true, data: [], message: '商业街上还没有店铺' };
    }

    // 按偏好类型排序店铺
    const sorted = shops.sort((a, b) => {
      const aIdx = searchTypes.indexOf(a.shop_type);
      const bIdx = searchTypes.indexOf(b.shop_type);
      // 偏好类型靠前的排前面，未匹配的排后面
      const aScore = aIdx === -1 ? 999 : aIdx;
      const bScore = bIdx === -1 ? 999 : bIdx;
      return aScore - bScore;
    });

    const result = sorted.slice(0, limit).map(shop => {
      const shopType = SHOP_TYPES[shop.shop_type] || { name: shop.shop_type, icon: '🏪' };
      const prefScore = scores[shop.shop_type] || 0;
      return {
        id: shop.id,
        name: shop.shop_name,
        type: shop.shop_type,
        typeName: shopType.name,
        typeIcon: shopType.icon,
        ownerName: shop.owner_name,
        aiName: shop.ai_name,
        level: shop.level,
        rating: Math.round(shop.rating * 10) / 10,
        preferenceScore: prefScore,
        reason: prefScore > 0 ? `人设偏好匹配（${Object.keys(PERSONA_PREFERENCES).filter(k => text.includes(k.toLowerCase()) && PERSONA_PREFERENCES[k].includes(shop.shop_type)).join('、')}）` : '热门店铺',
      };
    });

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：离线收益结算 ====================

async function market_claim_offline_earnings() {
  try {
    await ensureUser();
    const userId = getUserId();
    const cfg = getConfig();

    // 获取用户店铺
    const shops = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '你还没有开店' };
    }
    const shop = shops[0];

    // 获取用户最后在线时间
    const users = await supabaseRequest('market_users', 'GET', null,
      `?id=eq.${encodeURIComponent(userId)}&select=last_online,coins`);
    if (!users || users.length === 0) {
      return { success: false, error: '用户不存在' };
    }
    const user = users[0];
    const lastOnline = new Date(user.last_online || user.created_at || Date.now());
    const now = new Date();

    // 计算离线时长（小时）
    const offlineHours = Math.max(0, (now.getTime() - lastOnline.getTime()) / (1000 * 60 * 60));

    if (offlineHours < 0.5) {
      return { success: false, error: '离线时间不足30分钟，没有离线收益', data: { offlineMinutes: Math.floor(offlineHours * 60) } };
    }

    // 离线收益公式：每小时 = 店铺等级 × 20 橘币（上限）
    const maxPerHour = shop.level * 20;
    const offlineCoins = Math.floor(Math.min(offlineHours, 24) * maxPerHour); // 最多24小时

    if (offlineCoins <= 0) {
      return { success: false, error: '离线收益为0', data: { offlineHours: Math.floor(offlineHours * 10) / 10 } };
    }

    // 获取离线期间的AI到访记录
    const visits = await supabaseRequest('ai_visits', 'GET', null,
      `?target_shop_id=eq.${shop.id}&created_at=gte.${toUTC(lastOnline.toISOString())}&order=created_at.desc&limit=20`);

    const aiVisitSummary = (visits || []).map(v => ({
      aiName: v.visitor_ai_name,
      action: v.action,
      message: v.message,
      amount: v.amount || 0,
      time: v.created_at,
    }));

    // 发放离线收益
    const newCoins = await updateUserCoins(userId, offlineCoins);

    // 记录到离线收益表
    await supabaseRequest('offline_earnings', 'POST', {
      shop_id: shop.id,
      total_amount: offlineCoins,
      visit_count: (visits || []).length,
      ai_visits: JSON.stringify(aiVisitSummary.slice(0, 10)),
      period_start: lastOnline.toISOString(),
      period_end: now.toISOString(),
      claimed: true,
    });

    // 更新用户最后在线时间
    await supabaseRequest('market_users', 'PATCH', {
      last_online: now.toISOString()
    }, `?id=eq.${encodeURIComponent(userId)}`);

    return {
      success: true,
      data: {
        offlineHours: Math.floor(offlineHours * 10) / 10,
        earnedCoins: offlineCoins,
        totalCoins: newCoins,
        aiVisitCount: (visits || []).length,
        aiVisits: aiVisitSummary,
        message: `🍊 离线${Math.floor(offlineHours)}小时，收获 ${offlineCoins} 橘币！期间有 ${(visits || []).length} 次AI到访`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：AI相遇事件检测 ====================

async function market_detect_ai_encounter(params) {
  const { shop_id } = params;
  if (!shop_id) {
    return { success: false, error: '缺少 shop_id 参数' };
  }

  try {
    await ensureUser();
    const cfg = getConfig();
    const aiId = getAiUserId();

    // 查找最近5分钟内在此店铺的其他AI到访（不包括自己）
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentVisits = await supabaseRequest('ai_visits', 'GET', null,
      `?target_shop_id=eq.${shop_id}&visitor_user_id=neq.${encodeURIComponent(aiId)}&created_at=gte.${toUTC(fiveMinAgo)}&order=created_at.desc&limit=10`);

    if (!recentVisits || recentVisits.length === 0) {
      return { success: true, data: { encounter: false, message: '当前没有其他AI在店里' } };
    }

    // 有其他AI在店里，触发相遇事件
    const otherAis = [];
    const seen = new Set();
    for (const v of recentVisits) {
      if (!seen.has(v.visitor_ai_name)) {
        seen.add(v.visitor_ai_name);
        otherAis.push({
          aiName: v.visitor_ai_name,
          ownerName: v.visitor_user_name,
          action: v.action,
          message: v.message,
        });
      }
    }

    // 获取店铺信息
    const shops = await supabaseRequest('shops', 'GET', null, `?id=eq.${shop_id}&select=shop_name,shop_type,owner_id,visit_count`);
    if (!shops || shops.length === 0) {
      return { success: false, error: '店铺不存在' };
    }
    const shop = shops[0];

    // 触发AI相遇：店铺当日流量+20%
    const bonusVisits = Math.max(1, Math.floor(shop.visit_count * 0.2));
    await supabaseRequest('shops', 'PATCH', {
      visit_count: shop.visit_count + bonusVisits,
    }, `?id=eq.${shop_id}`);

    return {
      success: true,
      data: {
        encounter: true,
        shopName: shop.shop_name,
        shopType: shop.shop_type,
        myAiName: cfg.aiNickname,
        otherAis: otherAis,
        bonusVisits: bonusVisits,
        message: `🎉 AI相遇事件！${cfg.aiNickname} 和 ${otherAis.map(a => a.aiName).join('、')} 在 ${shop.shop_name} 碰面了！店铺流量+${bonusVisits}`,
        hint: `你的AI「${cfg.aiNickname}」和${otherAis.map(a => '「' + a.aiName + '」').join('、')}在${shop.shop_name}相遇了。请根据各自人设，生成一段简短有趣的对话互动（1-3句话即可），让它们自然地交流。`,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 工具：获取AI到访通知（前端轮询）====================

async function market_get_recent_visits(params) {
  const { since, limit = 10 } = params || {};

  try {
    await ensureUser();
    const userId = getUserId();

    const shops = await supabaseRequest('shops', 'GET', null,
      `?owner_id=eq.${encodeURIComponent(userId)}&select=id`);
    if (!shops || shops.length === 0) {
      return { success: true, data: { visits: [], encounterEvents: [] } };
    }
    const shopId = shops[0].id;

    let query = `?target_shop_id=eq.${shopId}&order=created_at.desc&limit=${limit}`;
    if (since) {
      query += `&created_at=gte.${toUTC(since)}`;
    }

    const visits = await supabaseRequest('ai_visits', 'GET', null, query);

    // 检测AI相遇事件（同一店铺5分钟内有2个以上不同AI）
    const now = Date.now();
    const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const recentForEncounter = await supabaseRequest('ai_visits', 'GET', null,
      `?target_shop_id=eq.${shopId}&created_at=gte.${toUTC(fiveMinAgo)}&order=created_at.desc&limit=20`);

    let encounterEvents = [];
    if (recentForEncounter && recentForEncounter.length >= 2) {
      const uniqueAis = new Set(recentForEncounter.map(v => v.visitor_ai_name));
      if (uniqueAis.size >= 2) {
        const aiNames = Array.from(uniqueAis);
        encounterEvents.push({
          type: 'ai_encounter',
          aiNames: aiNames,
          shopId: shopId,
          message: `🎉 ${aiNames.join(' 和 ')} 在你的店里碰面了！`,
          time: new Date().toISOString(),
        });
      }
    }

    return {
      success: true,
      data: {
        visits: (visits || []).map(v => ({
          aiName: v.visitor_ai_name,
          ownerName: v.visitor_user_name,
          action: v.action,
          message: v.message,
          amount: v.amount || 0,
          time: v.created_at,
        })),
        encounterEvents: encounterEvents,
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== 导出 ====================

exports.market_get_status = market_get_status;
exports.market_browse_shops = market_browse_shops;
exports.market_visit_shop = market_visit_shop;
exports.market_buy_product = market_buy_product;
exports.market_review_shop = market_review_shop;
exports.market_chat_with_shop = market_chat_with_shop;
exports.market_get_daily_events = market_get_daily_events;
exports.market_claim_daily_bonus = market_claim_daily_bonus;
exports.market_manage_products = market_manage_products;
exports.market_register_shop = market_register_shop;
exports.market_human_buy = market_human_buy;
exports.market_get_own_products = market_get_own_products;
exports.market_get_shop_detail = market_get_shop_detail;
exports.market_get_recommended_shops = market_get_recommended_shops;
exports.market_claim_offline_earnings = market_claim_offline_earnings;
exports.market_detect_ai_encounter = market_detect_ai_encounter;
exports.market_get_recent_visits = market_get_recent_visits;
