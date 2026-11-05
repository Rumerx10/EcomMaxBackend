import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CursorQueryDto } from '../../../common/dto/cursor-query.dto.js';
import { Role } from '../../../generated/prisma/client.js';
import { RegisterDto } from '../../auth/dto/register.dto.js';
import { UserResponseDto } from './user-response.dto.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' || value === true
    ? true
    : value === 'false' || value === false
      ? false
      : value;

export class UserQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'A phone number (exact) or part of a name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  data: UserResponseDto[];

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Pass as cursor for the next page',
  })
  nextCursor: string | null;
}

// A manager account, created by the owner. Same fields as a customer sign-up.
export class CreateManagerDto extends RegisterDto {}

// What the owner or a manager may change about another user.
export class UpdateUserByStaffDto {
  @ApiPropertyOptional({
    enum: [Role.MANAGER, Role.CUSTOMER],
    description: 'Owner only. Ownership itself cannot be handed over here.',
  })
  @IsOptional()
  @IsIn([Role.MANAGER, Role.CUSTOMER])
  role?: 'MANAGER' | 'CUSTOMER';

  @ApiPropertyOptional({
    description: 'false signs the user out and blocks sign-in',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
