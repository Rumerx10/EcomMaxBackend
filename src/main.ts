import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { configureApp, setupSwagger } from './app.setup.js';
import type { EnvironmentVariables } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
  });
  configureApp(app);

  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== 'production')
    setupSwagger(app);

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(
    `API on http://localhost:${port}/api/v1 (docs at /api/docs)`,
    'Bootstrap',
  );
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    'The server failed to start',
    error instanceof Error ? error.stack : error,
  );
  process.exit(1);
});
