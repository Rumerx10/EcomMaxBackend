import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Keyset pagination for lists that can reach millions of rows (customers, orders): each page
// continues after the last row of the previous one, so page 5,000 costs the same as page 1.
export class CursorQueryDto {
  @ApiPropertyOptional({
    description: 'The nextCursor value from the previous page',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

// Turns rows fetched with take: limit + 1 into one page and the cursor for the next.
export const toCursorPage = <T extends { id: string }>(
  rows: T[],
  limit: number,
) => {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? data[data.length - 1].id : null };
};
