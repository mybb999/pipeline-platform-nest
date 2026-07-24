-- pipeline_stats 库：预聚合指标
CREATE DATABASE IF NOT EXISTS pipeline_stats
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE pipeline_stats;

CREATE TABLE IF NOT EXISTS pv_summary (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  app_id     INT NOT NULL,
  hour       DATETIME NOT NULL,
  pv         BIGINT DEFAULT 0,
  uv         BIGINT DEFAULT 0,
  INDEX idx_app_hour (app_id, hour)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS device_distribution (
  app_id     INT NOT NULL,
  date       DATE NOT NULL,
  device     VARCHAR(20) NOT NULL,
  count      BIGINT DEFAULT 0,
  PRIMARY KEY (app_id, date, device)
) ENGINE=InnoDB;
