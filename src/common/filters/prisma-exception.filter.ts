import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';

// Fields that describe the tenant, not what the user typed; left out of conflict messages.
const HIDDEN_FIELDS = new Set(['sellerId']);

// The partial unique indexes in schema.prisma have their own names and rules.
const NAMED_CONSTRAINTS: Record<string, string> = {
  users_one_owner_per_seller: 'This store already has an owner',
  addresses_one_default_per_user: 'There is already a default address',
  seller_domains_one_primary: 'This store already has a primary domain',
};

interface UniqueViolation {
  fields: string[];
  index?: string;
}

// Which unique constraint failed. The classic engine reports meta.target; the pg driver
// adapter reports the index name, which Prisma builds as <table>_<field>_<field>_key.
const uniqueViolation = (
  error: Prisma.PrismaClientKnownRequestError,
): UniqueViolation => {
  const meta = error.meta as Record<string, any> | undefined;
  const cause = meta?.driverAdapterError?.cause;
  const listed: unknown = meta?.target ?? cause?.constraint?.fields;
  if (Array.isArray(listed)) return { fields: listed.map(String) };

  const index: string | undefined = cause?.constraint?.index;
  const table: string | undefined = cause?.table;
  if (
    index &&
    table &&
    index.startsWith(`${table}_`) &&
    index.endsWith('_key')
  ) {
    return {
      index,
      fields: index.slice(table.length + 1, -'_key'.length).split('_'),
    };
  }
  return { index, fields: [] };
};

// Maps Prisma's known errors to HTTP errors so a duplicate SKU is a 409, not a 500. Anything
// unexpected is logged and answered with a plain 500 that leaks no internals.
export const toHttpException = (
  error: Prisma.PrismaClientKnownRequestError,
): HttpException => {
  switch (error.code) {
    case 'P2002': {
      const violation = uniqueViolation(error);
      const named = violation.index && NAMED_CONSTRAINTS[violation.index];
      if (named) return new ConflictException(named);
      const fields = violation.fields.filter(
        (field) => !HIDDEN_FIELDS.has(field),
      );
      return new ConflictException(
        fields.length > 0
          ? `Another record already uses this ${fields.join(' and ')}`
          : 'This record already exists',
      );
    }
    case 'P2003':
    case 'P2014':
      return new ConflictException(
        'This change conflicts with related records, for example items that still use it',
      );
    case 'P2025':
      return new NotFoundException('Not found');
    case 'P2034':
      return new ConflictException(
        'The record changed while saving. Please try again.',
      );
    default:
      return new InternalServerErrorException();
  }
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const httpError = toHttpException(error);
    if (httpError.getStatus() >= 500) {
      this.logger.error(`Unhandled Prisma error ${error.code}`, error.stack);
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(httpError.getStatus())
      .json(httpError.getResponse());
  }
}
