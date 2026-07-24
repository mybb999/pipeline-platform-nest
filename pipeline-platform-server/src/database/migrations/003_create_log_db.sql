-- pipeline_log 库：原始事件日志 + 模板表
CREATE DATABASE IF NOT EXISTS pipeline_log
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE pipeline_log;

-- 模板表：建真正的 events_YYYYMMDD 表时复制它的结构
CREATE TABLE IF NOT EXISTS events_template (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_id     INT NOT NULL,
  event_type VARCHAR(20) NOT NULL,
  url        VARCHAR(500),
  ua         VARCHAR(500),
  ip         VARCHAR(45),
  extra      JSON,
  device_type VARCHAR(10) DEFAULT 'desktop',
  city       VARCHAR(50) DEFAULT '未知',
  page_path  VARCHAR(300) DEFAULT '/',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_app_time (app_id, created_at)
) ENGINE=InnoDB;
