import { DBToTSTypeMap, TSToDBTypeMap } from '../utils/type';
import { Injectable, Logger } from '@nestjs/common';
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

  async autoFixMissingImports(dirPath: string): Promise<void> {
    const files = this.getAllTsFiles(dirPath);

    for (const filePath of files) {
      const suggestions = await this.findMissingAndSuggestImports(filePath, [
        'src/entities',
      ]);
      await this.autoAddImportsToFile(filePath, suggestions);
      console.log(`✅ Đã tự động thêm import vào ${filePath}`);
    }
  }

  getAllTsFiles(dirPath: string): string[] {
    const result: string[] = [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        result.push(...this.getAllTsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        result.push(fullPath);
      }
    }

    return result;
  }

  checkTsErrors(dirPath: string, tsconfigPath = 'tsconfig.json'): void {
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

    const files = this.getAllTsFiles(dirPath);
    let hasError = false;

    for (const filePath of files) {
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

        console.error(
          `❌ Lỗi TypeScript trong file ${filePath}:\n${errors.join('\n')}`,
        );
        hasError = true;
      }
    }

    if (hasError) {
      throw new Error('Một hoặc nhiều file có lỗi TypeScript đã bị xoá.');
    }
  }

  async cleanInvalidImports(scanDir: string) {
    const project = new Project({
      tsConfigFilePath: path.resolve('tsconfig.json'),
      skipAddingFilesFromTsConfig: true,
    });

    const files = fs
      .readdirSync(scanDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.resolve(scanDir, f));

    for (const file of files) {
      const sourceFile = project.addSourceFileAtPath(file);
      let changed = false;

      const importDecls = sourceFile.getImportDeclarations();
      for (const imp of importDecls) {
        const moduleSpecifier = imp.getModuleSpecifierValue();
        const modulePath = path.resolve(
          path.dirname(file),
          moduleSpecifier + '.ts',
        );

        if (!fs.existsSync(modulePath)) {
          imp.remove();
          changed = true;
          continue;
        }

        const tempSourceFile =
          project.getSourceFile(modulePath) ??
          project.addSourceFileAtPath(modulePath);
        const exported = tempSourceFile.getExportedDeclarations();
        const namedImports = imp.getNamedImports();

        for (const named of namedImports) {
          const name = named.getName();
          if (!exported.has(name)) {
            named.remove();
            changed = true;
          }
        }

        if (imp.getNamedImports().length === 0) {
          imp.remove();
          changed = true;
        }
      }

      if (changed) {
        await sourceFile.save();
        console.log(`🧹 Đã dọn import trong: ${file}`);
      }
    }
  }

  async removeOldFile(filePathOrPaths: string | string[], logger: Logger) {
    try {
      const paths = Array.isArray(filePathOrPaths)
        ? filePathOrPaths
        : [filePathOrPaths];

      for (const targetPath of paths) {
        if (!fs.existsSync(targetPath)) continue;

        const stat = fs.statSync(targetPath);

        if (stat.isFile()) {
          // Xoá file đơn
          fs.unlinkSync(targetPath);
          logger.log(`🧹 Đã xoá file: ${targetPath}`);
        } else if (stat.isDirectory()) {
          // Xoá toàn bộ file trong thư mục
          const files = fs.readdirSync(targetPath);
          for (const file of files) {
            const fullPath = path.join(targetPath, file);
            const fileStat = fs.statSync(fullPath);
            if (fileStat.isFile()) {
              fs.unlinkSync(fullPath);
              logger.log(`🧹 Đã xoá file trong thư mục: ${fullPath}`);
            }
          }
        }
      }
    } catch (error) {
      logger.error(`❌ Lỗi khi xoá file: ${error.message}`);
      throw error;
    }
  }
}
