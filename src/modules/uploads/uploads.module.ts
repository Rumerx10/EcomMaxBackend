import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TenantPrismaService } from '../../tenant/tenant-prisma.service.js';
import { NoTenant } from '../../tenant/tenant.decorators.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const UPLOAD_PATH = '/api/v1/uploads/';

// What the file's first bytes say it is; the declared type alone can't be trusted.
const sniff = (data: Buffer): string | null => {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  )
    return 'image/webp';
  return null;
};

export class UploadImageDto {
  @ApiProperty({
    description: 'The image as a data URL: data:image/webp;base64,...',
  })
  @IsString()
  @MaxLength(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 100)
  dataUrl: string;
}

export class UploadDto {
  @ApiProperty()
  id: string;

  @ApiProperty({
    example: '/api/v1/uploads/0192f3c4-...',
    description: 'Use this as the image URL',
  })
  url: string;

  @ApiProperty({ example: 'image/webp' })
  contentType: string;

  @ApiProperty()
  size: number;
}

// Images kept in Postgres until there is object storage (PLAN.md step 7). The client already
// shrinks images before sending them, so a review photo is a few hundred kilobytes.
@Injectable()
export class UploadsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  async save(dataUrl: string): Promise<UploadDto> {
    const match = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(
      dataUrl,
    );
    if (!match)
      throw new BadRequestException('Send the image as a base64 data URL');
    const data = Buffer.from(match[1], 'base64');
    if (data.length === 0 || data.length > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Images can be at most 2 MB');
    }
    const contentType = sniff(data);
    if (!contentType)
      throw new BadRequestException('Use a JPEG, PNG or WebP image');

    const upload = await this.tenantPrisma.db.upload.create({
      data: {
        sellerId: this.tenantPrisma.sellerId,
        contentType,
        size: data.length,
        data,
      },
      select: { id: true, contentType: true, size: true },
    });
    return { ...upload, url: `${UPLOAD_PATH}${upload.id}` };
  }

  // Public and store-independent: <img> tags can't send X-Seller-Host, and ids can't be guessed.
  find(id: string) {
    return this.prisma.upload.findUnique({
      where: { id },
      select: { contentType: true, data: true },
    });
  }
}

@ApiTags('Uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Upload an image (signed in); returns the URL to use',
  })
  @ApiCreatedResponse({ type: UploadDto })
  upload(@Body() dto: UploadImageDto): Promise<UploadDto> {
    return this.uploads.save(dto.dataUrl);
  }

  @Get(':id')
  @Public()
  @NoTenant()
  @ApiOperation({ summary: 'An uploaded image' })
  async get(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const upload = await this.uploads.find(id);
    if (!upload) throw new NotFoundException('Image not found');
    res
      .setHeader('Content-Type', upload.contentType)
      .setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      .setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(Buffer.from(upload.data));
  }
}

@Module({ providers: [UploadsService], controllers: [UploadsController] })
export class UploadsModule {}
