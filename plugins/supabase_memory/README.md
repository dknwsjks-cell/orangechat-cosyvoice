# Supabase 外置记忆库

基于 Supabase 的外置记忆库，自动同步聊天记录。

## 功能

- 消息同步 - 自动将聊天记录同步到 Supabase
- Recall - 获取最近30条聊天记录
- 搜索 - 按关键词搜索聊天记录
- 写入 - 主动写入记忆内容

## 配置

| 字段 | 说明 |
|------|------|
| Supabase URL | 你的 Supabase 项目 URL |
| Supabase API Key | 你的 Supabase anon/public API Key |

## 工具

| 工具名 | 功能 |
|--------|------|
| memory_recall_recent | 获取最近30条聊天记录 |
| memory_search | 按关键词搜索聊天记录 |
| memory_write | 主动写入记忆内容 |

## 数据库

在 Supabase SQL Editor 中执行 `supabase_schema.sql` 创建表。