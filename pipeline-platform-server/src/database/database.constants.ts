// 数据库注入令牌 & 库名映射 — 为 3 个 MySQL 数据库提供 DI Token 常量
export const DATABASE_USER = 'DATABASE_USER';
export const DATABASE_LOG = 'DATABASE_LOG';
export const DATABASE_STATS = 'DATABASE_STATS';

export const DB_NAMES = {
  [DATABASE_USER]: 'pipeline_user',
  [DATABASE_LOG]: 'pipeline_log',
  [DATABASE_STATS]: 'pipeline_stats',
} as const;
