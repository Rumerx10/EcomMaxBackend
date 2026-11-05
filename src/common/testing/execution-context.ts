import type { ExecutionContext } from '@nestjs/common';

// A minimal ExecutionContext for guard tests: one handler on one controller class, with the
// metadata a decorator would have set and a plain request object.
export const fakeContext = (
  request: Record<string, any>,
  metadata: Record<string, unknown> = {},
): ExecutionContext => {
  const handler = () => undefined;
  class TestController {}
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

export const fakeRequest = (headers: Record<string, string> = {}) => ({
  header: (name: string) => headers[name.toLowerCase()],
});
