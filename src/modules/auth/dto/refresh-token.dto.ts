import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token from sign-in or the last refresh',
  })
  @IsString()
  @Length(20, 200)
  refreshToken: string;
}
