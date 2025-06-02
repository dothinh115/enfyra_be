import { ColumnDefinition } from '../entities/column.entity';
import { RelationDefinition } from '../entities/relation.entity';

export type TEntitySchemaIn = {
  id: number | string;
  name: string;
  columns: {
    id: number | string;
    name: string;
    type: string;
    isGenerated: boolean;
    isPrimary: boolean;
    isNullable: boolean;
  }[];
  relations: {
    id: number;
    sourceColumn: string;
    targetColumn: string;
    targetTable: string;
    inverseProperty?: string;
    type: 'one-to-one' | 'many-to-one' | 'one-to-many' | 'many-to-many';
    propertyName: string;
  }[];
};

export type TableDiff = {
  nameChanged: boolean;
  addedColumns: ColumnDefinition[];
  removedColumns: ColumnDefinition[];
  updatedColumns: { old: ColumnDefinition; new: ColumnDefinition }[];

  addedRelations: RelationDefinition[];
  removedRelations: RelationDefinition[];
  updatedRelations: { old: RelationDefinition; new: RelationDefinition }[];
};

export type DBToTSTypeMap = {
  int: 'number';
  integer: 'number';
  smallint: 'number';
  bigint: 'number';
  decimal: 'number';
  numeric: 'number';
  float: 'number';
  real: 'number';
  double: 'number';

  varchar: 'string';
  text: 'string';
  char: 'string';
  uuid: 'string';

  boolean: 'boolean';
  bool: 'boolean';

  date: 'Date';
  timestamp: 'Date';
  timestamptz: 'Date';
  time: 'Date';
  json: 'any';
  jsonb: 'any';
};

export type TSToDBTypeMap = {
  number: 'int';
  string: 'varchar';
  boolean: 'boolean';
  Date: 'timestamp';
  any: 'json';
};

export type TStaticEntities = {
  name: 'table' | 'hook';
  type: 'many-to-many' | 'many-to-one' | 'one-to-many' | 'one-to-one';
};

export type TInverseRelation = {
  propertyName: string;
  type: string;
  onDelete: string;
  onUpdate: string;
  isEager: boolean;
  isNullable: boolean;
  index: boolean;
  inversePropertyName: string;
  targetClass: string;
};

export type TInverseRelationMap = Map<string, TInverseRelation[]>;
