// Bangladeshi mobile numbers, stored as +8801XXXXXXXXX. Accepts the ways people type them:
// 01712345678, 8801712345678, +880 1712-345678.
export const BD_PHONE_PATTERN = /^\+8801[3-9]\d{8}$/;

export const normalizeBdPhone = (input: string): string | null => {
  const compact = input.replace(/[\s().-]/g, '');
  const match = /^(?:\+?88)?(01[3-9]\d{8})$/.exec(compact);
  return match ? `+88${match[1]}` : null;
};
