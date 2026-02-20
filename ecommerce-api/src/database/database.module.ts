import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

/**
 * Global module — import once in AppModule.
 * PrismaService and RedisService are available everywhere without re-importing.
 */
@Global()
@Module({
  providers: [PrismaService, RedisService],
  exports:   [PrismaService, RedisService],
})
export class DatabaseModule {}
