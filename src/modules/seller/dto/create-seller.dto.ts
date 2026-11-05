import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SLUG_PATTERN } from '../../../common/utils/slug.js';
import { SellerStatus } from '../../../generated/prisma/client.js';
import { RegisterDto } from '../../auth/dto/register.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// The store owner's sign-in: same rules as a customer sign-up.
export class StoreOwnerDto extends RegisterDto {}

export class CreateSellerDto {
  @ApiProperty({ example: 'NextPower' })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    example: 'next-power',
    description:
      'The store subdomain: next-power.<platform domain>. 3 to 40 characters.',
  })
  @Transform(lower)
  @Matches(SLUG_PATTERN, {
    message: 'Use lowercase letters, digits and dashes, like next-power',
  })
  @Length(3, 40)
  slug: string;

  @ApiProperty({
    example: 'support@nextpower.com.bd',
    description: 'The store contact email',
  })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({
    example: '+8809612345678',
    description: 'The store contact phone',
  })
  @Transform(trim)
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'Enter a phone number' })
  phone: string;

  @ApiPropertyOptional({ example: 'House 42, Road 11, Banani, Dhaka 1213' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional({
    enum: [SellerStatus.PENDING, SellerStatus.ACTIVE],
    default: SellerStatus.PENDING,
    description:
      'PENDING lets only the owner and managers in until the store opens',
  })
  @IsOptional()
  @IsIn([SellerStatus.PENDING, SellerStatus.ACTIVE])
  status?: 'PENDING' | 'ACTIVE';

  @ApiProperty({ type: StoreOwnerDto })
  @ValidateNested()
  @Type(() => StoreOwnerDto)
  owner: StoreOwnerDto;
}

export class UpdateSellerStatusDto {
  @ApiProperty({ enum: SellerStatus })
  @IsIn(Object.values(SellerStatus))
  status: SellerStatus;
}
