import { Expose } from 'class-transformer';
import { IsIn, IsNotEmpty } from 'class-validator';

export class CreateRouteDto {
  @Expose()
  @IsIn(['GET', 'PATCH', 'POST', 'DELETE'])
  method: string;

  @Expose()
  @IsNotEmpty()
  path: string;

  @Expose()
  @IsNotEmpty()
  handler: string;
}
