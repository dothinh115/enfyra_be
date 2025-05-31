import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsString,
} from 'class-validator';

export class CreateRouteDto {
  @IsIn(['GET', 'PATCH', 'POST', 'DELETE'])
  method: string;

  @IsNotEmpty()
  @IsString()
  path: string;

  @IsNotEmpty()
  @IsString()
  handler: string;

  @IsOptional()
  @IsArray()
  roles?: number[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
