import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client.js';

// The fields of a user that may leave the API. Never includes passwordHash.
export const USER_PUBLIC_FIELDS = {
  id: true,
  sellerId: true,
  role: true,
  name: true,
  phone: true,
  username: true,
  email: true,
  avatarUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UserResponseDto {
  @ApiProperty({ example: '0192f3c4-7b2a-7c3d-9e4f-5a6b7c8d9e0f' })
  id: string;

  @ApiProperty({ example: '0192f3c4-0000-7000-8000-000000000001' })
  sellerId: string;

  @ApiProperty({ enum: Role, example: Role.CUSTOMER })
  role: Role;

  @ApiProperty({ example: 'Tanvir Hasan' })
  name: string;

  @ApiProperty({ example: '+8801712345678' })
  phone: string;

  @ApiProperty({ example: 'nextpower', nullable: true, type: String })
  username: string | null;

  @ApiProperty({ example: 'tanvir@example.com', nullable: true, type: String })
  email: string | null;

  @ApiProperty({ example: null, nullable: true, type: String })
  avatarUrl: string | null;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
