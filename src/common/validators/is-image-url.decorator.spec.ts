import { describe, expect, it } from 'vitest';
import { isImageUrl } from './is-image-url.decorator.js';

describe('isImageUrl', () => {
  it('accepts uploaded images and https links', () => {
    expect(
      isImageUrl('/api/v1/uploads/0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f'),
    ).toBe(true);
    expect(isImageUrl('https://en.goodwe.com/Public/Uploads/a.png')).toBe(true);
  });

  it('rejects other URLs and paths', () => {
    expect(isImageUrl('http://example.com/a.png')).toBe(false);
    expect(isImageUrl('/api/v1/uploads/not-an-id')).toBe(false);
    expect(isImageUrl('/etc/passwd')).toBe(false);
    expect(isImageUrl('javascript:alert(1)')).toBe(false);
    expect(isImageUrl(42)).toBe(false);
  });
});
