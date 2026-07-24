import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppInfo } from '../../shared/types';

@Injectable()
export class AppsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateKeys() {
    return {
      appKey: crypto.randomBytes(12).toString('hex'),
      secretKey: crypto.randomBytes(16).toString('hex'),
    };
  }

  async createApp(userId: number, name: string, domain?: string): Promise<AppInfo> {
    const { appKey, secretKey } = this.generateKeys();

    const app = await this.prisma.app.create({
      data: {
        userId,
        name,
        appKey,
        secretKey,
        domain: domain ?? null,
      },
    });

    return {
      id: app.id,
      name: app.name,
      app_key: app.appKey,
      secret_key: app.secretKey,
      domain: app.domain,
      status: app.status,
      created_at: app.createdAt.toISOString(),
    };
  }

  async listApps(userId: number): Promise<AppInfo[]> {
    const apps = await this.prisma.app.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return apps.map((app) => ({
      id: app.id,
      name: app.name,
      app_key: app.appKey,
      secret_key: app.secretKey,
      domain: app.domain,
      status: app.status,
      created_at: app.createdAt.toISOString(),
    }));
  }

  async deleteApp(userId: number, appId: number): Promise<boolean> {
    const existing = await this.prisma.app.findUnique({
      where: { id: appId },
    });

    if (!existing || existing.userId !== userId) {
      throw new HttpException('应用不存在', HttpStatus.NOT_FOUND);
    }

    await this.prisma.app.delete({ where: { id: appId } });
    return true;
  }
}
