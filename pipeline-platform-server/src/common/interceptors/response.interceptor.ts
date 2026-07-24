// 全局响应拦截器 — 将 controller 返回值统一包装为 { code: 0, message: 'ok', data }
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        // 如果 controller 已经返回了 { code, message, data } 格式，直接通过
        if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
          return data;
        }
        return {
          code: 0,
          message: 'ok',
          data,
        };
      }),
    );
  }
}
