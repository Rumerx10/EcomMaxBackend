import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  PLATFORM_DOMAIN: 'myplatform.com',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('fills defaults and converts numbers', () => {
    const env = validateEnv({ ...valid, PORT: '8080' });
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe('development');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.CORS_EXTRA_ORIGINS).toBe('');
  });

  it('names every missing or bad variable', () => {
    expect(() =>
      validateEnv({
        PLATFORM_DOMAIN: 'Not A Domain',
        JWT_ACCESS_SECRET: 'short',
      }),
    ).toThrow(/DATABASE_URL[\s\S]*PLATFORM_DOMAIN[\s\S]*JWT_ACCESS_SECRET/);
  });

  it('rejects a short platform API key', () => {
    expect(() =>
      validateEnv({ ...valid, PLATFORM_API_KEY: 'too-short' }),
    ).toThrow(/PLATFORM_API_KEY/);
  });
});
