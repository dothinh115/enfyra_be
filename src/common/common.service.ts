import { DBToTSTypeMap, TSToDBTypeMap } from '../utils/type';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { knownGlobalImports } from '../utils/common';
import * as ts from 'typescript';
import { EntityTarget } from 'typeorm';
import { DataSourceService } from '../data-source/data-source.service';
import pLimit from 'p-limit';
import { match } from 'path-to-regexp';

@Injectable()
export class CommonService {
  constructor(
    @Inject(forwardRef(() => DataSourceService))
    private dataSourceService: DataSourceService,
  ) {}

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

  private async buildExportMapAsync(
    scanDirs: string[],
    filePath: string,
  ): Promise<Map<string, string>> {
    const exportMap = new Map<string, string>();
    const allFiles = scanDirs.flatMap((dir) =>
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => path.resolve(dir, f)),
    );
    for (const file of allFiles) {
      const sourceCode = fs.readFileSync(file, 'utf8');
      if (!sourceCode.includes('export')) continue;
      const exportRegex =
        /export\s+(?:class|const|function|interface|type|enum)\s+(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = exportRegex.exec(sourceCode))) {
        const name = match[1];
        const relativePath = path
          .relative(path.dirname(filePath), file)
          .replace(/\.ts$/, '')
          .replace(/\\/g, '/');
        if (!exportMap.has(name)) {
          exportMap.set(
            name,
            relativePath.startsWith('.') ? relativePath : `./${relativePath}`,
          );
        }
      }
    }
    return exportMap;
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
    const matcher = match(
      `${prefix ? `/${prefix.replace(/^\//, '').replace(/\/$/, '')}/` : ''}${routePath.replace(/^\//, '')}`,
      {
        decode: decodeURIComponent,
      },
    );
    const matched = matcher(reqPath);
    return matched
      ? {
          params: matched.params,
        }
      : false;
  }

  async findMissingAndSuggestImports(
    filePath: string,
    scanDirs: string[],
  ): Promise<{ name: string; module: string }[]> {
    const project = new Project({ compilerOptions: { target: 3, module: 1 } });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const usedIdentifiers = new Set<string>();
    const importedIdentifiers = new Set<string>();

    sourceFile.getImportDeclarations().forEach((decl) => {
      decl.getNamedImports().forEach((imp) => {
        importedIdentifiers.add(imp.getName());
      });
    });

    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.Identifier) {
        const name = node.getText();
        const symbol = node.getSymbol();
        if (!symbol && !importedIdentifiers.has(name))
          usedIdentifiers.add(name);
      }
    });

    const localDeclarations = sourceFile
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .map((d) => d.getName());
    sourceFile
      .getClasses()
      .forEach((cls) => usedIdentifiers.delete(cls.getName() || ''));
    localDeclarations.forEach((n) => usedIdentifiers.delete(n));

    const missing = Array.from(usedIdentifiers);
    const suggestions: { name: string; module: string }[] = [];

    for (const name of missing) {
      if (knownGlobalImports[name])
        suggestions.push({ name, module: knownGlobalImports[name] });
    }

    const toResolve = missing.filter(
      (name) => !suggestions.find((s) => s.name === name),
    );
    const exportMap = await this.buildExportMapAsync(scanDirs, filePath);
    for (const name of toResolve) {
      const module = exportMap.get(name);
      if (module) suggestions.push({ name, module });
    }
    return suggestions;
  }

  async autoAddImportsToFile(
    filePath: string,
    suggestions: { name: string; module: string }[],
  ) {
    const project = new Project();
    const sourceFile = project.addSourceFileAtPath(filePath);
    for (const suggestion of suggestions) {
      const existingImport = sourceFile
        .getImportDeclarations()
        .find((imp) => imp.getModuleSpecifierValue() === suggestion.module);
      if (existingImport) {
        const namedImports = existingImport
          .getNamedImports()
          .map((ni) => ni.getName());
        if (!namedImports.includes(suggestion.name))
          existingImport.addNamedImport(suggestion.name);
      } else {
        sourceFile.addImportDeclaration({
          namedImports: [suggestion.name],
          moduleSpecifier: suggestion.module,
        });
      }
    }
    await sourceFile.save();
  }

  private async processFile(
    project: Project,
    filePath: string,
    exportMap: Map<string, string>,
  ) {
    const start = Date.now();
    const sourceFile = project.addSourceFileAtPath(filePath);
    const usedIdentifiers = new Set<string>();
    const importedIdentifiers = new Set<string>();

    sourceFile.getImportDeclarations().forEach((decl) => {
      decl
        .getNamedImports()
        .forEach((imp) => importedIdentifiers.add(imp.getName()));
    });

    sourceFile.forEachDescendant((node) => {
      if (node.getKind() === SyntaxKind.Identifier) {
        const name = node.getText();
        const symbol = node.getSymbol();
        if (!symbol && !importedIdentifiers.has(name))
          usedIdentifiers.add(name);
      }
    });

    const localDeclarations = sourceFile
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .map((d) => d.getName());
    sourceFile
      .getClasses()
      .forEach((cls) => usedIdentifiers.delete(cls.getName() || ''));
    localDeclarations.forEach((n) => usedIdentifiers.delete(n));

    const missing = Array.from(usedIdentifiers);
    const suggestions = missing
      .filter((name) => !importedIdentifiers.has(name))
      .map((name) => {
        const module = exportMap.get(name) ?? knownGlobalImports[name];
        return module ? { name, module } : null;
      })
      .filter(Boolean) as { name: string; module: string }[];

    await this.autoAddImportsToFile(filePath, suggestions);
    console.log(
      `✅ [${new Date().toISOString()}] Đã xử lý ${filePath} trong ${Date.now() - start}ms`,
    );
  }

  async autoFixMissingImports(
    dirPath: string,
    scanDir: string[],
  ): Promise<void> {
    const files = this.getAllTsFiles(dirPath);
    const exportMap = await this.buildExportMapAsync(scanDir, files[0]);
    const project = new Project({ compilerOptions: { target: 3, module: 1 } });
    const limit = pLimit(5);

    const tasks = files.map((filePath) =>
      limit(() => this.processFile(project, filePath, exportMap)),
    );
    await Promise.allSettled(tasks);
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

  getTableNameFromEntity(entity: EntityTarget<any>): string {
    const dataSource = this.dataSourceService.getDataSource();
    const metadata = dataSource.getMetadata(entity);
    return metadata.tableName;
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
