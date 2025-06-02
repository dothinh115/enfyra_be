import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { CreateColumnDto } from '../table/dto/create-table.dto';

export function PrimaryKeyValidCheck(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'hasOnlyOnePrimaryColumn',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(columns: CreateColumnDto[], args: ValidationArguments) {
          const primaryCount = columns.filter((c) => c.isPrimary).length;
          return primaryCount <= 1;
        },
        defaultMessage(args: ValidationArguments) {
          return 'Chỉ được phép có tối đa 1 cột isPrimary: true trong columns';
        },
      },
    });
  };
}
