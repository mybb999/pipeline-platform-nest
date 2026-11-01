#!/bin/bash
# MySQL 每日备份:导出 pipeline 三个库,压缩后落到 /opt/backups/mysql,保留约 7 天。
# 依赖 Docker 容器 pipeline-mysql;密码走容器内 MYSQL_ROOT_PASSWORD(MYSQL_PWD 环境变量),
# 不出现在命令行参数、进程列表或日志里。
set -uo pipefail

CONTAINER=pipeline-mysql
DIR=/opt/backups/mysql
KEEP_DAYS=7
DBS="pipeline_user pipeline_log pipeline_stats"

mkdir -p "$DIR" || { echo "[$(date '+%F %T')] 无法创建 $DIR"; exit 1; }

# 根分区余量不足 2G 时不备份,避免写满磁盘拖垮整机
AVAIL=$(df -Pk "$DIR" | awk 'NR==2 {print $4}')
if [ "${AVAIL:-0}" -lt 2097152 ]; then
  echo "[$(date '+%F %T')] 磁盘剩余不足 2G,跳过备份"
  exit 1
fi

TS=$(date +%Y%m%d-%H%M%S)
OUT="$DIR/pipeline-$TS.sql.gz"
TMP="$OUT.tmp"

# --single-transaction: 不锁表;--quick: 逐行流式导出,不把结果集读进内存
if docker exec "$CONTAINER" sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --quick --routines --triggers --events --databases '"$DBS"' 2>/dev/null' \
  | gzip > "$TMP"; then
  if gzip -t "$TMP" && [ "$(zcat "$TMP" | grep -c 'CREATE TABLE')" -gt 0 ]; then
    mv "$TMP" "$OUT"
    echo "[$(date '+%F %T')] 备份完成 $(du -h "$OUT" | cut -f1) $OUT"
  else
    rm -f "$TMP"
    echo "[$(date '+%F %T')] 备份校验失败,已删除"
    exit 1
  fi
else
  rm -f "$TMP"
  echo "[$(date '+%F %T')] mysqldump 失败"
  exit 1
fi

find "$DIR" -type f -name 'pipeline-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "[$(date '+%F %T')] 清理完成,当前 $(find "$DIR" -name 'pipeline-*.sql.gz' -type f | wc -l) 份"
