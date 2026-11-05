import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

// Every setting the API reads, checked once at startup so a missing or malformed value stops
// the process instead of failing on the first request. .env.example documents each one.
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 5000;

  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  // Database connections per API instance (read by PrismaService).
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_SIZE: number = 10;

  // Stores live at <slug>.PLATFORM_DOMAIN unless they use a verified custom domain.
  @Matches(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    {
      message:
        'PLATFORM_DOMAIN must be a lowercase domain such as myplatform.com',
    },
  )
  PLATFORM_DOMAIN: string;

  // Comma-separated origins allowed besides the store domains, e.g. local frontends.
  @IsString()
  CORS_EXTRA_ORIGINS: string = '';

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters',
  })
  JWT_ACCESS_SECRET: string;

  @IsInt()
  @Min(60)
  @Max(86_400)
  JWT_ACCESS_TTL_SECONDS: number = 900;

  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS: number = 30;

  // Guards the platform routes (seller onboarding) until there is a platform admin.
  @IsOptional()
  @IsString()
  @MinLength(32, { message: 'PLATFORM_API_KEY must be at least 32 characters' })
  PLATFORM_API_KEY?: string;

  // Express "trust proxy" value when the API runs behind a load balancer, e.g. "1".
  // Rate limits and session IPs read the client address through it.
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;
}

export const validateEnv = (
  config: Record<string, unknown>,
): EnvironmentVariables => {
  const env = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    excludeExtraneousValues: false,
  });
  const errors = validateSync(env, { whitelist: false });
  if (errors.length > 0) {
    const lines = errors.map(
      (error) =>
        `- ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    );
    throw new Error(
      `Invalid environment variables (see .env.example):\n${lines.join('\n')}`,
    );
  }
  return env;
};
