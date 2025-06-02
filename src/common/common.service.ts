import { DBToTSTypeMap, TSToDBTypeMap } from '../utils/type';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { knownGlobalImports } from '../utils/common';
import * as ts from 'typescript';

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

  async findMissingAndSuggestImports(
    filePath: string,
    scanDirs: string[],
  ): Promise<{ name: string; module: string }[]> {
    const project = new Project({
      compilerOptions: {
        target: 3, // ES2015
        module: 1, // CommonJS
      },
    });

    const sourceFile = project.addSourceFileAtPath(filePath);

    const usedIdentifiers = new Set<string>();
    const importedIdentifiers = new Set<string>();

    // Thu thập identifiers đã import
    sourceFile.getImportDeclarations().forEach((decl) => {
      decl.getNamedImports().forEach((imp) => {
        importedIdentifiers.add(imp.getName());
      });
    });

    // Thu thập tất cả identifiers được sử dụng
    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.Identifier) {
        const name = node.getText();
        const symbol = node.getSymbol();

        if (!symbol && !importedIdentifiers.has(name)) {
          usedIdentifiers.add(name);
        }
      }
    });

    // Loại bỏ những identifier nội bộ như class name, biến cục bộ
    const localDeclarations = sourceFile
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .map((d) => d.getName());
    sourceFile
      .getClasses()
      .forEach((cls) => usedIdentifiers.delete(cls.getName() || ''));
    localDeclarations.forEach((n) => usedIdentifiers.delete(n));

    const missing = Array.from(usedIdentifiers);
    const suggestions: { name: string; module: string }[] = [];

    // Ưu tiên lấy trong knownGlobalImports
    for (const name of missing) {
      if (knownGlobalImports[name]) {
        suggestions.push({
          name,
          module: knownGlobalImports[name],
        });
      }
    }

    const remaining = missing.filter(
      (name) => !suggestions.find((s) => s.name === name),
    );

    // Quét các thư mục còn lại
    for (const dir of scanDirs) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

      for (const file of files) {
        const fullPath = path.resolve(dir, file);
        const sf = project.addSourceFileAtPathIfExists(fullPath);
        if (!sf) continue;

        const exports = sf.getExportedDeclarations();

        for (const name of remaining) {
          if (suggestions.find((s) => s.name === name)) continue;

          if (exports.has(name)) {
            const modulePath = path
              .relative(path.dirname(filePath), fullPath)
              .replace(/\.ts$/, '')
              .replace(/\\/g, '/');

            suggestions.push({
              name,
              module: modulePath.startsWith('.')
                ? modulePath
                : `./${modulePath}`,
            });
          }
        }
      }
    }

    return suggestions;
  }

  async autoAddImportsToFile(
    filePath: string,
    suggestions: {
      name: string;
      module: string;
    }[],
  ) {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);

    for (const suggestion of suggestions) {
      const existingImport = sourceFile.getImportDeclarations().find((imp) => {
        return imp.getModuleSpecifierValue() === suggestion.module;
      });

      if (existingImport) {
        const namedImports = existingImport
          .getNamedImports()
          .map((ni) => ni.getName());
        if (!namedImports.includes(suggestion.name)) {
          existingImport.addNamedImport(suggestion.name);
        }
      } else {
        sourceFile.addImportDeclaration({
          namedImports: [suggestion.name],
          moduleSpecifier: suggestion.module,
        });
      }
    }

    await sourceFile.save();
  }

  async autoFixMissingImports(filePath: string): Promise<void> {
    const suggestions = await this.findMissingAndSuggestImports(filePath, [
      'src/entities',
      'node_modules/typeorm',
    ]);

    await this.autoAddImportsToFile(filePath, suggestions);

    console.log(`✅ Đã tự động thêm import vào ${filePath}`);
  }

  checkTsErrors(filePath: string, tsconfigPath = 'tsconfig.json'): void {
    const configPath = ts.findConfigFile(tsconfigPath, ts.sys.fileExists);

    if (!configPath) {
      throw new Error(`Không tìm thấy tsconfig tại ${tsconfigPath}`);
    }

    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      path.dirname(configPath),
    );

    const program = ts.createProgram([filePath], parsedConfig.options);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    const relevantErrors = diagnostics.filter(
      (d) => d.file?.fileName === path.resolve(filePath),
    );

    if (relevantErrors.length > 0) {
      const errors = relevantErrors.map((d) => {
        const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n');
        const pos = d.file?.getLineAndCharacterOfPosition(d.start || 0);
        return `Line ${pos?.line! + 1}, Col ${pos?.character! + 1}: ${msg}`;
      });

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.error(`🗑️ Đã xoá file lỗi: ${filePath}`);
      }

      throw new Error(
        `❌ Lỗi TypeScript trong file ${filePath}:\n${errors.join('\n')}`,
      );
    }
  }
}
