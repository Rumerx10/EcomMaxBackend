import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../../common/utils/password.js';
import { IsBdPhone } from '../../../common/validators/is-bd-phone.decorator.js';

// Sign in with `login` (a phone number or a username) or with `phone`.
export class LoginDto {
  @ApiPropertyOptional({
    example: 'nextpower',
    description: 'A phone number or a username',
  })
  @ValidateIf((dto: LoginDto) => dto.phone === undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Enter your phone number or username' })
  @MinLength(3, { message: 'Enter your phone number or username' })
  @MaxLength(100)
  login?: string;

  @ApiPropertyOptional({ example: '01712345678' })
  @IsOptional()
  @IsBdPhone()
  phone?: string;

  @ApiProperty({ example: 'correct horse battery' })
  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
