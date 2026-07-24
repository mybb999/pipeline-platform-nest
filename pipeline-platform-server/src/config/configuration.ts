// 配置加载函数 — 聚合 .env 环境变量为结构化配置对象（mysql / redis / jwt / bcrypt）
export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mysql: {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'pipeline',
    password: process.env.MYSQL_PASSWORD || 'pipeline_dev_2024',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_in_production',
    expiresIn: '7d',
  },
  bcrypt: {
    saltRounds: 10,
  },
});
