import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/utils/password.js';
import { IsBdPhone } from '../../../common/validators/is-bd-phone.decorator.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Tanvir Hasan', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    example: '01712345678',
    description: 'Bangladeshi mobile number; signs in with it',
  })
  @IsBdPhone()
  phone: string;

  // Length is what makes a password strong; composition rules mostly make people write them
  // down. Common-password checks can come later.
  @ApiProperty({
    example: 'correct horse battery',
    minLength: PASSWORD_MIN_LENGTH,
  })
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
  })
  password: string;

  @ApiPropertyOptional({ example: 'tanvir@example.com' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email?: string;
}
