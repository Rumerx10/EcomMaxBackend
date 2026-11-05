import { normalizeHost } from './host.js';

describe('normalizeHost', () => {
  it.each([
    ['next-power.myplatform.com', 'next-power.myplatform.com'],
    ['Next-Power.MyPlatform.com', 'next-power.myplatform.com'],
    ['shop.example.com:443', 'shop.example.com'],
    ['shop.example.com.', 'shop.example.com'],
    ['https://shop.example.com', 'shop.example.com'],
    ['http://localhost:3000', 'localhost'],
    ['  shop.example.com  ', 'shop.example.com'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeHost(raw)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '',
    'null',
    'not a host',
    'exa_mple.com',
    '-bad.com',
    'a..b',
  ])('rejects %s', (raw) => {
    expect(normalizeHost(raw)).toBeNull();
  });
});
