// ParserService — ETL 解析阶段：UA 设备识别、IP 内外网判断、URL 路径提取、extra 序列化
import { Injectable } from '@nestjs/common';
import { RawEvent, CleanedEvent } from '../../shared/types';

@Injectable()
export class ParserService {
  parseDevice(ua: string): 'desktop' | 'mobile' | 'tablet' {
    const u = ua.toLowerCase();
    if (/tablet|ipad|playbook|silk/.test(u)) return 'tablet';
    if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(u)) return 'mobile';
    return 'desktop';
  }

  parseCity(ip: string): string {
    if (!ip || ip === 'unknown') return '未知';
    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|::1|fc|fe80)/i.test(ip)) {
      return '内网';
    }
    return '未知';
  }

  parsePath(url: string): string {
    try {
      return new URL(url).pathname || '/';
    } catch {
      return url.startsWith('/') ? url : '/';
    }
  }

  cleanEvent(raw: RawEvent): CleanedEvent {
    return {
      app_id: 0,
      event_type: raw.event_type,
      url: raw.url,
      ua: raw.ua,
      ip: raw.ip,
      extra: raw.extra ? JSON.stringify(raw.extra) : 'null',
      device_type: this.parseDevice(raw.ua),
      city: this.parseCity(raw.ip),
      page_path: this.parsePath(raw.url),
      created_at: raw.created_at,
    };
  }
}
