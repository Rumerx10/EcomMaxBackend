import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL is not set. Copy and Paste the connection string in .env and fill it in.',
      );
    }
    // Connections each API instance keeps open (DATABASE_POOL_SIZE, checked at startup by
    // env.validation.ts). Instances × pool size must stay under the database's limit.
    const max = Number(process.env.DATABASE_POOL_SIZE) || 10;
    super({ adapter: new PrismaPg({ connectionString, max }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
