import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../shared/types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('未登录');
    }

    const token = header.slice(7);
    try {
      const user = this.jwtService.verify<JwtPayload>(token);
      (request as any).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Token 无效或已过期');
    }
  }
}
