-- pipeline_user 库：用户 + 应用元数据
CREATE DATABASE IF NOT EXISTS pipeline_user
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE pipeline_user;

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL COMMENT 'bcrypt(10) 哈希',
  created_at DATETIME DEFAULT NOW()
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS apps (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  app_key    CHAR(24) NOT NULL UNIQUE COMMENT 'crypto.randomBytes(12).toString(hex)',
  secret_key CHAR(32) NOT NULL UNIQUE COMMENT 'crypto.randomBytes(16).toString(hex)',
  domain     VARCHAR(255),
  status     TINYINT DEFAULT 1 COMMENT '1=启用 0=停用',
  created_at DATETIME DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;
