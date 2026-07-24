import { Controller, Get, Post, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AppsService } from './apps.service';
import { CreateAppDto } from './dto/create-app.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../shared/types';

@ApiTags('应用管理')
@ApiBearerAuth()
@Controller('apps')
@UseGuards(AuthGuard)
export class AppsController {
  constructor(private readonly appsService: AppsService) {}

  @ApiOperation({ summary: '创建应用' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateAppDto) {
    return this.appsService.createApp(user.id, dto.name, dto.domain);
  }

  @ApiOperation({ summary: '获取应用列表' })
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.appsService.listApps(user.id);
  }

  @ApiOperation({ summary: '删除应用' })
  @Delete(':id')
  delete(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.appsService.deleteApp(user.id, Number(id));
  }
}
