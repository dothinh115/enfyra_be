import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const RESERVED_KEYWORDS = new Set([
  'constructor',
  'prototype',
  'class',
  'function',
  'default',
  'super',
  'extends',
  'await',
  'import',
  'return',
  'let',
  'var',
  'const',
  'enum',
  '__proto__',
]);

export function IsSafeIdentifier(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isSafeIdentifier',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          return (
            typeof value === 'string' &&
            /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value) &&
            !RESERVED_KEYWORDS.has(value)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `Tên "${args.value}" không hợp lệ: không được bắt đầu bằng số, chứa ký tự đặc biệt hoặc là từ khóa JavaScript.`;
        },
      },
    });
  };
}
