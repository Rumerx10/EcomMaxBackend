import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global so feature modules can inject PrismaService without importing this
// module themselves. Import it once, in AppModule.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
