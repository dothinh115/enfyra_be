"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HiddenField = HiddenField;
const constant_1 = require("../utils/constant");
function HiddenField() {
    return (target, propertyKey) => {
        Reflect.defineMetadata(constant_1.HIDDEN_FIELD_KEY, true, target, propertyKey);
    };
}
