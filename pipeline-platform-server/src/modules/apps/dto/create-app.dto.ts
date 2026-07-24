import { IsString, IsOptional } from 'class-validator';

export class CreateAppDto {
  @IsString({ message: '应用名不能为空' })
  name: string;

  @IsOptional()
  @IsString()
  domain?: string;
}
