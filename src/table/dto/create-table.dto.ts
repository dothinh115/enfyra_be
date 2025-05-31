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

export class CreateColumnDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
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

  @IsString()
  @IsNotEmpty()
  targetTable: string;

  @IsOptional()
  @IsBoolean()
  index?: boolean;

  @IsString()
  @IsOptional()
  inversePropertyName?: string;

  @IsIn(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many'])
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';

  @IsString()
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
  @IsString()
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
