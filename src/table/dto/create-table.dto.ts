import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsSafeIdentifier } from '../../validator/is-safe-identifer.validator';

export class CreateColumnDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsSafeIdentifier()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsIn(['int', 'varchar', 'boolean', 'text', 'date', 'float', 'json'])
  type: string;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isGenerated?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isNullable?: boolean = true;

  @IsOptional()
  default?: any;

  @IsOptional()
  @IsBoolean()
  index?: boolean;
}

export class CreateRelationDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  @IsNotEmpty()
  targetTable: number;

  @IsOptional()
  @IsBoolean()
  index?: boolean;

  @IsSafeIdentifier()
  @IsOptional()
  inversePropertyName?: string;

  @IsIn(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'])
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

  @IsSafeIdentifier()
  @IsNotEmpty()
  propertyName: string;

  @IsString()
  @IsOptional()
  @IsIn(['CASCADE', 'SET NULL', 'NO ACTION', 'RESTRICT'])
  onDelete?: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT';

  @IsString()
  @IsOptional()
  @IsIn(['CASCADE', 'SET NULL', 'NO ACTION', 'RESTRICT'])
  onUpdate?: 'CASCADE' | 'SET NULL' | 'NO ACTION' | 'RESTRICT';

  @IsBoolean()
  @IsOptional()
  isEager?: boolean;

  @IsBoolean()
  @IsOptional()
  isNullable?: boolean;
}

export class CreateTableDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsSafeIdentifier()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsArray()
  index?: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateColumnDto)
  columns: CreateColumnDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRelationDto)
  @IsOptional()
  relations?: CreateRelationDto[];
}
