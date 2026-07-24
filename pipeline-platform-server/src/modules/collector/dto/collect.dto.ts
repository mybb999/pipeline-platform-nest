import { IsString, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';

export class IncomingEventDto {
  @IsString()
  event_type: string;

  @IsString()
  url: string;

  @IsString()
  ua: string;

  @IsString()
  ip: string;

  extra?: Record<string, unknown>;
}

export class CollectDto {
  @IsString()
  appKey: string;

  @IsArray()
  @ArrayMinSize(1, { message: '至少需要一条事件' })
  @Type(() => IncomingEventDto)
  events: IncomingEventDto[];
}
