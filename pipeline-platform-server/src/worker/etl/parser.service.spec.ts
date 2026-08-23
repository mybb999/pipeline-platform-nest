// ParserService 单元测试 — UA 设备识别 / IP 城市解析 / 路径提取 / 事件清洗
import { ParserService } from './parser.service';

describe('ParserService', () => {
  const parser = new ParserService();

  describe('parseDevice（UA 识别设备）', () => {
    it('手机 UA → mobile', () => {
      expect(parser.parseDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe('mobile');
      expect(parser.parseDevice('Mozilla/5.0 (Linux; Android 13; Pixel 7)')).toBe('mobile');
    });

    it('平板 UA → tablet', () => {
      expect(parser.parseDevice('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('tablet');
    });

    it('桌面 UA → desktop', () => {
      expect(parser.parseDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    });

    it('空 UA 兜底为 desktop', () => {
      expect(parser.parseDevice('')).toBe('desktop');
    });
  });

  describe('parseCity（IP 城市解析）', () => {
    it('空值和 unknown 返回 未知', () => {
      expect(parser.parseCity('')).toBe('未知');
      expect(parser.parseCity('unknown')).toBe('未知');
    });

    it('内网 IP 段返回 内网', () => {
      expect(parser.parseCity('127.0.0.1')).toBe('内网');
      expect(parser.parseCity('192.168.1.5')).toBe('内网');
      expect(parser.parseCity('10.0.0.1')).toBe('内网');
      expect(parser.parseCity('172.16.0.1')).toBe('内网'); // 172.16-31.x 为内网段
      expect(parser.parseCity('172.31.255.9')).toBe('内网');
      expect(parser.parseCity('0.0.0.0')).toBe('内网');
      expect(parser.parseCity('::1')).toBe('内网');
      expect(parser.parseCity('::ffff:127.0.0.1')).toBe('内网'); // IPv4 映射的 IPv6 回环
    });

    it('公网 IP 解析出城市', () => {
      expect(parser.parseCity('120.25.122.243')).toBe('深圳市');
      expect(parser.parseCity('103.116.121.81')).toBe('北京市');
    });

    it('无城市数据时逐级回退（国家）', () => {
      expect(parser.parseCity('8.8.8.8')).toBe('美国'); // 库里有国家、无城市
    });

    it('非法 IP 返回 未知', () => {
      expect(parser.parseCity('not-an-ip')).toBe('未知');
    });
  });

  describe('parsePath（URL 提取路径）', () => {
    it('完整 URL 提取 pathname', () => {
      expect(parser.parsePath('https://ai-myhome.space/ai-agent?id=1')).toBe('/ai-agent');
    });

    it('根路径返回 /', () => {
      expect(parser.parsePath('https://ai-myhome.space/')).toBe('/');
    });

    it('裸路径原样返回', () => {
      expect(parser.parsePath('/ai-agent')).toBe('/ai-agent');
    });

    it('非法 URL 兜底为 /', () => {
      expect(parser.parsePath('not-a-url')).toBe('/');
    });
  });

  describe('cleanEvent（事件清洗）', () => {
    it('补充 device/city/page_path，extra 序列化为 JSON', () => {
      const cleaned = parser.cleanEvent({
        app_key: 'k',
        event_type: 'page_view',
        url: 'https://ai-myhome.space/ai-agent',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        ip: '120.25.122.243',
        extra: { title: '首页' },
        created_at: '2026-08-14T10:00:00.000Z',
      });
      expect(cleaned).toEqual({
        app_id: 0,
        event_type: 'page_view',
        url: 'https://ai-myhome.space/ai-agent',
        ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        ip: '120.25.122.243',
        extra: '{"title":"首页"}',
        device_type: 'mobile',
        city: '深圳市',
        page_path: '/ai-agent',
        created_at: '2026-08-14T10:00:00.000Z',
      });
    });

    it('无 extra 时序列化为 null 字符串', () => {
      const cleaned = parser.cleanEvent({
        app_key: 'k',
        event_type: 'page_view',
        url: '/',
        ua: '',
        ip: 'unknown',
        created_at: '2026-08-14T10:00:00.000Z',
      });
      expect(cleaned.extra).toBe('null');
      expect(cleaned.device_type).toBe('desktop');
      expect(cleaned.city).toBe('未知');
    });
  });
});
