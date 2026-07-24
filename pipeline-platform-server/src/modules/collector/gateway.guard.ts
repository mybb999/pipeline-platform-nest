import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GatewayGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const appKey = request.headers['x-appkey'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;
    const sign = request.headers['x-sign'] as string | undefined;

    if (!appKey || !timestamp || !sign) {
      throw new UnauthorizedException('缺少鉴权参数');
    }

    const now = Date.now();
    const reqTime = Number(timestamp);
    if (Math.abs(now - reqTime) > 5 * 60 * 1000) {
      throw new UnauthorizedException('请求已过期');
    }

    const app = await this.prisma.app.findUnique({
      where: { appKey },
      select: { id: true, secretKey: true, status: true },
    });

    if (!app) {
      throw new UnauthorizedException('无效的 AppKey');
    }

    if (app.status !== 1) {
      throw new ForbiddenException('应用已停用');
    }

    const body = JSON.stringify(request.body);
    const signData = body + timestamp;
    const expected = crypto
      .createHmac('sha256', app.secretKey)
      .update(signData)
      .digest('hex');

    if (sign !== expected) {
      throw new UnauthorizedException('签名验证失败');
    }

    (request as any).appId = app.id;
    return true;
  }
}
