import { DBToTSTypeMap, TSToDBTypeMap } from '../utils/type';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

@Injectable()
export class CommonService {
  capitalizeFirstLetterEachLine(text: string): string {
    return text
      .split('\n')
      .map((line) => {
        line = line.trim();
        if (!line) return '';
        return line.charAt(0).toUpperCase() + line.slice(1);
      })
      .join('\n');
  }

  dbTypeToTSType(dbType: string): string {
    const map: Partial<DBToTSTypeMap> = {
      int: 'number',
      integer: 'number',
      smallint: 'number',
      bigint: 'number',
      decimal: 'number',
      numeric: 'number',
      float: 'number',
      real: 'number',
      double: 'number',

      varchar: 'string',
      text: 'string',
      char: 'string',
      uuid: 'string',

      boolean: 'boolean',
      bool: 'boolean',

      date: 'Date',
      timestamp: 'Date',
      timestamptz: 'Date',
      time: 'Date',
      json: 'any',
      jsonb: 'any',
    };

    return map[dbType.toLowerCase()] ?? 'any';
  }

  tsTypeToDBType(tsType: string): string {
    const map: Partial<TSToDBTypeMap> = {
      number: 'int',
      string: 'varchar',
      boolean: 'boolean',
      Date: 'timestamp',
      any: 'json',
    };

    return map[tsType] ?? 'text';
  }

  async loadDynamicEntities(entityDir: string) {
    const entities = [];
    if (!fs.existsSync(entityDir)) {
      fs.mkdirSync(entityDir, { recursive: true });
    }

    const files = fs.readdirSync(entityDir);

    for (const file of files) {
      if (file.endsWith('.js')) {
        const module = await import(path.join(entityDir, file));
        for (const exported in module) {
          entities.push(module[exported]);
        }
      }
    }
    return entities;
  }
}
