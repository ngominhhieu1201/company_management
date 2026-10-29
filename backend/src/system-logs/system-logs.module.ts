import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemLog } from './system-log.entity';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemLog])],
  controllers: [SystemLogsController],
  providers: [SystemLogsService],
  exports: [SystemLogsService],
})
export class SystemLogsModule {}
