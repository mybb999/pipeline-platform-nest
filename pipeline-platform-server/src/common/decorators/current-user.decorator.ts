// @CurrentUser() 参数装饰器 — 从 request.user 提取当前登录用户的 JWT Payload
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../shared/types';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
