import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator.js';
import {
  AddressDto,
  CreateAddressDto,
  UpdateAddressDto,
} from './addresses.dto.js';
import { AddressesService } from './addresses.service.js';

@ApiTags('Addresses')
@ApiBearerAuth('JWT-auth')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'Your saved addresses, the default first' })
  @ApiOkResponse({ type: [AddressDto] })
  list(@GetUser('id') userId: string): Promise<AddressDto[]> {
    return this.addresses.list(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Save an address' })
  @ApiCreatedResponse({ type: AddressDto })
  create(
    @GetUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change an address or make it the default' })
  @ApiOkResponse({ type: AddressDto })
  update(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<AddressDto> {
    return this.addresses.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an address; another one becomes the default',
  })
  @ApiNoContentResponse()
  async remove(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.addresses.remove(userId, id);
  }
}
