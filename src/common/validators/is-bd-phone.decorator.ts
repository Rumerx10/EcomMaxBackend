import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';
import { BD_PHONE_PATTERN, normalizeBdPhone } from '../utils/phone.js';

// Accepts a Bangladeshi mobile number in any common format and stores it as +8801XXXXXXXXX.
export const IsBdPhone = () =>
  applyDecorators(
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? (normalizeBdPhone(value) ?? value) : value,
    ),
    Matches(BD_PHONE_PATTERN, {
      message: 'Enter a Bangladeshi mobile number, for example 01712345678',
    }),
  );
