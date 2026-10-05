import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { emptyToUndefined, toBoolean } from '../../common/dto-transform';

export class SaveQeshmondiSqlConnectionDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(128)
  databaseName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(128)
  username!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(256)
  password?: string;

  @Transform(({ value }) => toBoolean(value, true))
  @IsBoolean()
  encrypt!: boolean;

  @Transform(({ value }) => toBoolean(value, true))
  @IsBoolean()
  trustServerCertificate!: boolean;
}
