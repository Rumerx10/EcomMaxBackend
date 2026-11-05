import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsBdPhone } from '../../common/validators/is-bd-phone.decorator.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// A delivery address in Bangladesh, as checkout asks for it.
export class AddressInputDto {
  @ApiProperty({
    example: 'Tanvir Hasan',
    description: 'Who receives the parcel',
  })
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({ example: '01712345678' })
  @IsBdPhone()
  phone: string;

  @ApiProperty({ example: 'Dhaka' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  district: string;

  @ApiProperty({ example: 'Mirpur', description: 'Thana or upazila' })
  @Transform(trim)
  @IsString()
  @Length(2, 60)
  thana: string;

  @ApiProperty({
    example: 'Ward 6',
    description: 'Village, union or city ward',
  })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  villageOrWard: string;

  @ApiPropertyOptional({
    example: 'House 18, Road 7',
    description: 'House, road, area or a landmark',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional({ example: '1216' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(10)
  postCode?: string;
}

export class CreateAddressDto extends AddressInputDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  label?: string;

  @ApiPropertyOptional({
    description: 'Make it the default; the first address always is',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}

export class AddressDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true, type: String, example: 'Home' })
  label: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiProperty()
  district: string;

  @ApiProperty()
  thana: string;

  @ApiProperty()
  villageOrWard: string;

  @ApiProperty({ nullable: true, type: String })
  addressLine: string | null;

  @ApiProperty({ nullable: true, type: String })
  postCode: string | null;

  @ApiProperty()
  isDefault: boolean;
}
