import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto.js';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Short-lived JWT; send it as "Authorization: Bearer <token>"',
  })
  accessToken: string;

  @ApiProperty({
    example: 900,
    description: 'Seconds until the access token expires',
  })
  expiresIn: number;

  @ApiProperty({
    description:
      'Opaque token for POST /auth/refresh. Each refresh returns a new one and retires the old; ' +
      'reusing a retired token signs out every device of that user.',
  })
  refreshToken: string;

  @ApiProperty({ type: UserResponseDto })
  user: UserResponseDto;
}
