import { DBToTSTypeMap, TSToDBTypeMap } from '../utils/types/common.type';
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { match } from 'path-to-regexp';

@Injectable()
export class CommonService {
  capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  lowerFirst(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  mapToGraphQLType(dbType: string): string {
    const map: Record<string, string> = {
      int: 'Number',
      integer: 'Number',
      float: 'Number',
      double: 'Number',
      decimal: 'Number',
      uuid: 'String',
      varchar: 'String',
      text: 'String',
      boolean: 'Boolean',
      bool: 'Boolean',
      'simple-json': 'String',
      enum: 'String',
    };
    return map[dbType] || 'String';
  }

  async loadDynamicEntities(entityDir: string) {
    const entities = [];
    if (!fs.existsSync(entityDir)) fs.mkdirSync(entityDir, { recursive: true });

    const files = fs.readdirSync(entityDir).filter((f) => f.endsWith('.js'));

    // 1️⃣ Xoá cache tất cả trước
    for (const file of files) {
      const fullPath = path.join(entityDir, file);
      const resolved = require.resolve(fullPath);
      if (require.cache[resolved]) delete require.cache[resolved];
    }

    // 2️⃣ Require tất cả để populate lại cache đúng thứ tự
    for (const file of files) {
      const fullPath = path.join(entityDir, file);
      require(fullPath);
    }

    // 3️⃣ Extract export từ cache
    for (const file of files) {
      const fullPath = path.join(entityDir, file);
      const module = require(fullPath);
      for (const exported of Object.values(module)) {
        entities.push(exported);
      }
    }

    return entities;
  }

  isRouteMatched({
    routePath,
    reqPath,
    prefix,
  }: {
    routePath: string;
    reqPath: string;
    prefix?: string;
  }) {
    const cleanPrefix = prefix?.replace(/^\//, '').replace(/\/$/, '');
    const cleanRoute = routePath.replace(/^\//, '');

    const fullPattern = cleanPrefix
      ? `/${cleanPrefix}/${cleanRoute}`
      : `/${cleanRoute}`;
    const matcher = match(fullPattern, { decode: decodeURIComponent });

    const matched = matcher(reqPath);
    return matched ? { params: matched.params } : false;
  }

  getAllTsFiles(dirPath: string): string[] {
    const result: string[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) result.push(...this.getAllTsFiles(fullPath));
      else if (entry.isFile() && entry.name.endsWith('.ts'))
        result.push(fullPath);
    }
    return result;
  }

  checkTsErrors(dirPath: string, tsconfigPath = 'tsconfig.json'): void {
    const configPath = ts.findConfigFile(tsconfigPath, ts.sys.fileExists);
    if (!configPath)
      throw new Error(`Không tìm thấy tsconfig tại ${tsconfigPath}`);

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );

    const allFiles = this.getAllTsFiles(dirPath);
    const program = ts.createProgram(allFiles, parsedConfig.options);
    const allDiagnostics = ts.getPreEmitDiagnostics(program);

    const errorMap = new Map<string, ts.Diagnostic[]>();
    for (const diag of allDiagnostics) {
      const file = diag.file?.fileName;
      if (!file) continue;
      const absPath = path.resolve(file);
      if (!errorMap.has(absPath)) errorMap.set(absPath, []);
      errorMap.get(absPath)!.push(diag);
    }

    let hasError = false;
    for (const [filePath, diagnostics] of errorMap.entries()) {
      const errors = diagnostics.map((d) => {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        const pos = d.file?.getLineAndCharacterOfPosition(d.start || 0);
        return `Line ${pos?.line! + 1}, Col ${pos?.character! + 1}: ${msg}`;
      });
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.error(`🗑️ Đã xoá file lỗi: ${filePath}`);
      }
      console.error(
        `❌ Lỗi TypeScript trong file ${filePath}:\n${errors.join('\n')}`,
      );
      hasError = true;
    }

    if (hasError)
      throw new Error('Một hoặc nhiều file có lỗi TypeScript đã bị xoá.');
  }

  async removeOldFile(filePathOrPaths: string | string[], logger: Logger) {
    const paths = Array.isArray(filePathOrPaths)
      ? filePathOrPaths
      : [filePathOrPaths];
    for (const targetPath of paths) {
      try {
        if (!fs.existsSync(targetPath)) continue;
        const stat = await fs.promises.stat(targetPath);
        if (stat.isFile()) {
          await fs.promises.unlink(targetPath);
          logger.log(`🧹 Đã xoá file: ${targetPath}`);
        } else if (stat.isDirectory()) {
          const files = await fs.promises.readdir(targetPath);
          for (const file of files) {
            const fullPath = path.join(targetPath, file);
            const fileStat = await fs.promises.stat(fullPath);
            if (fileStat.isFile()) {
              await fs.promises.unlink(fullPath);
              logger.log(`🧹 Đã xoá file trong thư mục: ${fullPath}`);
            }
          }
        }
      } catch (error) {
        logger.error(`❌ Lỗi khi xoá file: ${error.message}`);
        throw error;
      }
    }
  }

  inverseRelationType(type: string): string {
    const map: Record<string, string> = {
      'many-to-one': 'one-to-many',
      'one-to-many': 'many-to-one',
      'one-to-one': 'one-to-one',
      'many-to-many': 'many-to-many',
    };
    return map[type] || 'many-to-one';
  }
}
