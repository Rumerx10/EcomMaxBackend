import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsImageUrl } from '../../../common/validators/is-image-url.decorator.js';

// What users may change about themselves. The phone number is the sign-in id, so changing it
// needs a verification step that doesn't exist yet.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Tanvir Hasan' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({
    example: 'tanvir@example.com',
    nullable: true,
    description: 'null removes it',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @ValidateIf((_, value) => value !== null)
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/avatars/1.jpg',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsImageUrl()
  avatarUrl?: string | null;
}
