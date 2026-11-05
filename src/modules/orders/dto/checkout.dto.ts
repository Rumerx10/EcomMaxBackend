import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/utils/password.js';
import { IsBdPhone } from '../../../common/validators/is-bd-phone.decorator.js';
import { PaymentMethod } from '../../../generated/prisma/client.js';
import { AddressInputDto } from '../../addresses/addresses.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Checkout needs no account. A guest gives name, phone and a password: the order creates their
// account (or, when the phone already has one, the password must match it) and signs them in.
export class CheckoutDto {
  @ApiPropertyOptional({ example: 'Rahim Uddin', description: 'Guests only' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name?: string;

  @ApiPropertyOptional({
    example: '01812345678',
    description: 'Guests only; becomes their sign-in',
  })
  @IsOptional()
  @IsBdPhone()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Guests only: the password for the new account',
  })
  @IsOptional()
  @IsString()
  @Length(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, {
    message: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
  })
  password?: string;

  @ApiPropertyOptional({
    example: 'rahim@example.com',
    description: 'Guests only, optional',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    description: 'Signed-in users: one of their saved addresses',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    type: AddressInputDto,
    description: 'A new delivery address',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressInputDto)
  address?: AddressInputDto;

  @ApiPropertyOptional({
    description:
      "Signed-in users: also save the new address to the address book (guests' always is)",
  })
  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean;

  @ApiProperty({ description: 'One of GET /shipping-rates' })
  @IsUUID()
  shippingRateId: string;

  @ApiPropertyOptional({ example: 'SAVE10' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(30)
  couponCode?: string;

  @ApiPropertyOptional({ description: "Add the store's installation service" })
  @IsOptional()
  @IsBoolean()
  installation?: boolean;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.COD })
  @IsOptional()
  @IsIn(Object.values(PaymentMethod))
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ example: 'Call before coming', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelOrderDto {
  @ApiProperty({ example: 'Ordered the wrong capacity' })
  @Transform(trim)
  @IsString()
  @Length(1, 300)
  reason: string;
}
