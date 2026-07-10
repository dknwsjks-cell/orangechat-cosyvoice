-- 橘市商业街插件 Supabase 数据库表结构
-- 在 Supabase SQL Editor 中执行以下 SQL

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==================== 用户表 ====================
CREATE TABLE IF NOT EXISTS market_users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '匿名用户',
  ai_name TEXT NOT NULL DEFAULT 'AI',
  ai_persona TEXT,
  coins INTEGER NOT NULL DEFAULT 500,
  last_daily_claim TIMESTAMPTZ,
  last_online TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== 店铺表 ====================
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id TEXT NOT NULL REFERENCES market_users(id) ON DELETE CASCADE,
  owner_name TEXT NOT NULL,
  ai_name TEXT NOT NULL DEFAULT 'AI',
  ai_persona TEXT,
  shop_type TEXT NOT NULL, -- 'oden' | 'coffee' | 'bookstore' | 'arcade' | 'milktea' | 'persona' | 'beautify' | 'tools' | 'content'
  shop_name TEXT NOT NULL,
  shop_description TEXT DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  rating FLOAT NOT NULL DEFAULT 5.0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  total_revenue INTEGER NOT NULL DEFAULT 0,
  decoration JSONB DEFAULT '{}',
  is_open BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id)
);

-- ==================== 商品表 ====================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  is_real BOOLEAN NOT NULL DEFAULT false, -- true=真实资源, false=虚拟商品
  stock INTEGER NOT NULL DEFAULT -1, -- -1=无限
  category TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  resource_url TEXT, -- 真实资源下载链接
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== 交易记录表 ====================
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id TEXT NOT NULL REFERENCES market_users(id),
  seller_id TEXT NOT NULL REFERENCES market_users(id),
  shop_id UUID NOT NULL REFERENCES shops(id),
  product_id UUID REFERENCES products(id),
  amount INTEGER NOT NULL, -- 实际支付金额
  original_price INTEGER NOT NULL, -- 商品原价
  is_ai_purchase BOOLEAN NOT NULL DEFAULT false,
  ai_visitor_name TEXT, -- AI到访者名称
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== 评价表 ====================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES market_users(id),
  reviewer_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT DEFAULT '',
  is_ai_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== AI到访记录（Realtime推送）====================
CREATE TABLE IF NOT EXISTS ai_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_ai_name TEXT NOT NULL,
  visitor_user_name TEXT NOT NULL,
  visitor_user_id TEXT NOT NULL,
  target_shop_id UUID NOT NULL REFERENCES shops(id),
  action TEXT NOT NULL DEFAULT 'browse', -- 'browse' | 'purchase' | 'review'
  message TEXT,
  product_id UUID,
  amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== 每日事件表 ====================
CREATE TABLE IF NOT EXISTS daily_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  event_type TEXT NOT NULL, -- 'market_day' | 'mystery_rich' | 'rain' | 'festival' | 'viral' | 'supply_sale' | 'stray_cat' | 'blackout' | 'mystery_gift'
  description TEXT NOT NULL,
  target_shop_id UUID, -- 某些事件针对特定店铺
  multiplier FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_date, event_type)
);

-- ==================== 离线收益表 ====================
CREATE TABLE IF NOT EXISTS offline_earnings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  total_amount INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  ai_visits TEXT DEFAULT '[]', -- JSON: [{aiName, action, amount}]
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==================== 索引 ====================
CREATE INDEX IF NOT EXISTS idx_shops_type ON shops(shop_type);
CREATE INDEX IF NOT EXISTS idx_shops_open ON shops(is_open);
CREATE INDEX IF NOT EXISTS idx_products_shop ON products(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_shop ON transactions(shop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_shop ON reviews(shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_visits_shop ON ai_visits(target_shop_id);
CREATE INDEX IF NOT EXISTS idx_ai_visits_created ON ai_visits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_events_date ON daily_events(event_date);

-- ==================== 开启 RLS ====================
ALTER TABLE market_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_earnings ENABLE ROW LEVEL SECURITY;

-- 允许 anon 用户读写
CREATE POLICY "Allow all for anon" ON market_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON shops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON reviews FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ai_visits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON daily_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON offline_earnings FOR ALL USING (true) WITH CHECK (true);

-- ==================== Realtime ====================
ALTER PUBLICATION supabase_realtime ADD TABLE ai_visits;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
