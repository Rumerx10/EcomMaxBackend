import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { EnvironmentVariables } from './config/env.validation.js';
import { normalizeHost } from './tenant/host.js';
import { SELLER_HOST_HEADER } from './tenant/tenant.middleware.js';
import { TenantService } from './tenant/tenant.service.js';

export const API_PREFIX = 'api/v1';

// Everything about the HTTP app that main.ts and the e2e tests share.
export const configureApp = (app: NestExpressApplication) => {
  const config =
    app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const tenants = app.get(TenantService);

  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy)
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );

  app.use(helmet());
  app.useBodyParser('json', {
    limit: '4mb' /* image uploads arrive as base64 */,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  // A browser may call the API from any store domain, so allowed origins are worked out per
  // request: every active store host, the shared seller centre at admin.<PLATFORM_DOMAIN>
  // ("admin" is a reserved slug, so no store can take it), plus CORS_EXTRA_ORIGINS.
  // Server-side calls send no Origin and are not affected. No cookies are used, so
  // credentials stay off.
  const adminHost = `admin.${config.get('PLATFORM_DOMAIN', { infer: true })}`;
  const extraOrigins = new Set(
    config
      .get('CORS_EXTRA_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || extraOrigins.has(origin)) return callback(null, true);
      const host = normalizeHost(origin);
      if (!host) return callback(null, false);
      if (host === adminHost) return callback(null, true);
      tenants.resolve(host).then(
        (seller) =>
          callback(
            null,
            seller?.status === 'ACTIVE' || seller?.status === 'PENDING',
          ),
        (error: Error) => callback(error),
      );
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      SELLER_HOST_HEADER,
      'Idempotency-Key',
      'X-Guest-Token',
    ],
    // Content-Disposition carries the file name of downloads such as the sales report.
    exposedHeaders: ['X-Guest-Token', 'Content-Disposition'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      // Implicit conversion would turn ?isActive=false into true (Boolean("false")); DTOs
      // convert explicitly with @Type and @Transform instead.
      transformOptions: { enableImplicitConversion: false },
    }),
  );
};

export const setupSwagger = (app: NestExpressApplication) => {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Store platform API')
      .setDescription(
        'One API for every store. Store routes need the X-Seller-Host header ' +
          '(e.g. next-power.<platform domain>); signed-in routes need a Bearer access token.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT-auth',
      )
      .addGlobalParameters({
        name: 'X-Seller-Host',
        in: 'header',
        required: false,
        description:
          'Host of the store the request is for, e.g. next-power.myplatform.com',
        schema: { type: 'string' },
      })
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Store platform API',
  });
};
