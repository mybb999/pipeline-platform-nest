import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../shared/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpException('邮箱已被注册', HttpStatus.CONFLICT);
    }

    const saltRounds = this.config.get<number>('bcrypt.saltRounds', 10);
    const hashed = await bcrypt.hash(password, saltRounds);

    const user = await this.prisma.user.create({
      data: { email, password: hashed },
    });

    const token = this.jwtService.sign({ id: user.id, email });

    return { id: user.id, email, token };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new HttpException('邮箱或密码错误', HttpStatus.UNAUTHORIZED);
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw new HttpException('邮箱或密码错误', HttpStatus.UNAUTHORIZED);
    }

    const token = this.jwtService.sign({ id: user.id, email: user.email });

    return { id: user.id, email: user.email, token };
  }

  verifyToken(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }
}
