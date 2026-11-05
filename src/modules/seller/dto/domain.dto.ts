import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class AddDomainDto {
  @ApiProperty({ example: 'shop.nextpower.com.bd' })
  @IsString()
  @MaxLength(253)
  hostname: string;
}

export class DomainResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'shop.nextpower.com.bd' })
  hostname: string;

  @ApiProperty({ description: 'The address the store links to' })
  isPrimary: boolean;

  @ApiProperty({
    nullable: true,
    type: Date,
    description: 'null until the DNS record is found',
  })
  verifiedAt: Date | null;

  @ApiProperty({
    example: {
      type: 'TXT',
      name: '_store-verification.shop.nextpower.com.bd',
      value: 'store-verification=…',
    },
    description: 'The DNS record to create to prove the domain is yours',
  })
  verification: { type: 'TXT'; name: string; value: string };

  @ApiProperty()
  createdAt: Date;
}
