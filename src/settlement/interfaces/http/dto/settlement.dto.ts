import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreatePayoutDto {
  /** In cents; defaults to the whole available balance. */
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;
}

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ListReceivablesQueryDto extends ListQueryDto {
  /** true: already released; false: still scheduled. */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  released?: boolean;
}
