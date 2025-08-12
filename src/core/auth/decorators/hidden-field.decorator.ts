import { HIDDEN_FIELD_KEY } from "../../../shared/utils/constant";

export function HiddenField(): PropertyDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(HIDDEN_FIELD_KEY, true, target, propertyKey);
  };
}
