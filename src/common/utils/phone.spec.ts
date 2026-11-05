import { normalizeBdPhone } from './phone.js';

describe('normalizeBdPhone', () => {
  it.each([
    ['01712345678', '+8801712345678'],
    ['8801712345678', '+8801712345678'],
    ['+8801712345678', '+8801712345678'],
    ['+880 1712-345678', '+8801712345678'],
    ['(017) 1234 5678', '+8801712345678'],
    ['01312345678', '+8801312345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBdPhone(input)).toBe(expected);
  });

  it.each([
    '0171234567',
    '017123456789',
    '01212345678',
    '+9101712345678',
    'abc',
    '',
  ])('rejects %s', (input) => {
    expect(normalizeBdPhone(input)).toBeNull();
  });
});
