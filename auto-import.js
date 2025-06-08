const fs = require('fs');
const path = require('path');
const { Project, SyntaxKind } = require('ts-morph');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Parse args
const argv = yargs(hideBin(process.argv))
  .option('target', {
    alias: 't',
    type: 'array',
    describe: 'Danh sách thư mục chứa file cần auto import',
    demandOption: true,
  })
  .option('scan', {
    alias: 's',
    type: 'array',
    describe: 'Danh sách thư mục để quét export',
    demandOption: true,
  })
  .help().argv;

// ✅ CẤU HÌNH
const TARGET_DIRS = argv.target.map((d) => path.resolve(d));
const SCAN_DIRS = argv.scan.map((d) => path.resolve(d));

const knownGlobalImports = {
  Entity: 'typeorm',
  Column: 'typeorm',
  PrimaryGeneratedColumn: 'typeorm',
  OneToMany: 'typeorm',
  ManyToOne: 'typeorm',
  ManyToMany: 'typeorm',
  OneToOne: 'typeorm',
  JoinColumn: 'typeorm',
  JoinTable: 'typeorm',
  CreateDateColumn: 'typeorm',
  UpdateDateColumn: 'typeorm',
  Unique: 'typeorm',
  Index: 'typeorm',
};

function getAllTsFiles(dirPath) {
  const results = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

function getAllFilesFromDirs(dirs) {
  return dirs.flatMap((dir) => getAllTsFiles(dir));
}

function buildExportMap(scanDirs, refFile) {
  const exportMap = new Map();
  const allFiles = getAllFilesFromDirs(scanDirs);

  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  });

  const refDir = path.dirname(refFile);

  for (const file of allFiles) {
    const sourceFile = project.addSourceFileAtPath(file);
    const exports = sourceFile.getExportedDeclarations();

    for (const [name, decls] of exports) {
      if (!exportMap.has(name)) {
        const relativePath = path
          .relative(refDir, file)
          .replace(/\.ts$/, '')
          .replace(/\\/g, '/');

        exportMap.set(
          name,
          relativePath.startsWith('.') ? relativePath : './' + relativePath,
        );
      }
    }
  }

  return exportMap;
}

function getMissingIdentifiers(sourceFile) {
  const used = new Set();
  const declared = new Set();
  const imported = new Set();

  // ✅ Import đã có
  sourceFile.getImportDeclarations().forEach((decl) => {
    decl.getNamedImports().forEach((imp) => imported.add(imp.getName()));
  });

  // ✅ Identifier bình thường
  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.Identifier) {
      const name = node.getText();
      const symbol = node.getSymbol();
      if (!symbol && !imported.has(name)) used.add(name);
    }

    // ✅ THÊM: check decorator (quan trọng)
    if (node.getKind() === SyntaxKind.Decorator) {
      const expr = node.getExpression();
      if (expr.getKind() === SyntaxKind.CallExpression) {
        const identifier = expr.getExpression();
        if (identifier.getKind() === SyntaxKind.Identifier) {
          const name = identifier.getText();
          if (!imported.has(name)) used.add(name);
        }
      } else if (expr.getKind() === SyntaxKind.Identifier) {
        const name = expr.getText();
        if (!imported.has(name)) used.add(name);
      }
    }
  });

  // ✅ Local class / variable
  sourceFile.getClasses().forEach((cls) => declared.add(cls.getName()));
  sourceFile
    .getVariableDeclarations()
    .forEach((v) => declared.add(v.getName()));

  declared.forEach((name) => used.delete(name));

  return [...used];
}

function applyAutoImports(sourceFile, missingNames, exportMap) {
  const suggestions = [];

  for (const name of missingNames) {
    if (knownGlobalImports[name]) {
      suggestions.push({ name, module: knownGlobalImports[name] });
    } else if (exportMap.has(name)) {
      suggestions.push({ name, module: exportMap.get(name) });
    }
  }

  if (!suggestions.length) return false;

  for (const { name, module } of suggestions) {
    const existing = sourceFile
      .getImportDeclarations()
      .find((imp) => imp.getModuleSpecifierValue() === module);

    if (existing) {
      const names = existing.getNamedImports().map((n) => n.getName());
      if (!names.includes(name)) existing.addNamedImport(name);
    } else {
      sourceFile.addImportDeclaration({
        namedImports: [name],
        moduleSpecifier: module,
      });
    }
  }

  return true;
}

async function main() {
  const targetFiles = getAllFilesFromDirs(TARGET_DIRS);
  if (!targetFiles.length) {
    console.warn('⚠️ Không tìm thấy file nào trong TARGET_DIRS.');
    return;
  }

  const exportMap = buildExportMap(SCAN_DIRS, targetFiles[0]);

  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFiles = targetFiles.map((file) =>
    project.addSourceFileAtPath(file),
  );

  for (const sourceFile of sourceFiles) {
    const missing = getMissingIdentifiers(sourceFile);
    const added = applyAutoImports(sourceFile, missing, exportMap);
    if (added) {
      console.log(`✅ Auto imported: ${sourceFile.getFilePath()}`);
    }
  }

  await project.save();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
