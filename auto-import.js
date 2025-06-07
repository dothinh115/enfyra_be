const fs = require('fs');
const path = require('path');
const { Project, SyntaxKind } = require('ts-morph');

// ✅ CẤU HÌNH
const TARGET_DIR = path.resolve('src/entities');
const SCAN_DIRS = [TARGET_DIR];

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
    if (entry.isDirectory()) results.push(...getAllTsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts'))
      results.push(fullPath);
  }

  return results;
}

function buildExportMap(scanDirs, refFile) {
  const exportMap = new Map();
  const allFiles = scanDirs.flatMap((dir) =>
    fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => path.resolve(dir, f)),
  );

  for (const file of allFiles) {
    const code = fs.readFileSync(file, 'utf8');
    if (!code.includes('export')) continue;

    const regex =
      /export\s+(?:class|const|function|interface|type|enum)\s+(\w+)/g;
    let match;
    while ((match = regex.exec(code))) {
      const name = match[1];
      const relativePath = path
        .relative(path.dirname(refFile), file)
        .replace(/\.ts$/, '')
        .replace(/\\/g, '/');
      if (!exportMap.has(name)) {
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

  sourceFile.getImportDeclarations().forEach((decl) => {
    decl.getNamedImports().forEach((imp) => imported.add(imp.getName()));
  });

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.Identifier) {
      const name = node.getText();
      const symbol = node.getSymbol();
      if (!symbol && !imported.has(name)) used.add(name);
    }
  });

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
  const files = getAllTsFiles(TARGET_DIR);
  if (!files.length) {
    console.warn('⚠️ Không tìm thấy file TS nào.');
    return;
  }

  const exportMap = buildExportMap(SCAN_DIRS, files[0]);

  const project = new Project({
    tsConfigFilePath: 'tsconfig.json',
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFiles = files.map((file) => project.addSourceFileAtPath(file));

  for (const sourceFile of sourceFiles) {
    const missing = getMissingIdentifiers(sourceFile);
    const added = applyAutoImports(sourceFile, missing, exportMap);
    if (added) {
      console.log(`✅ Auto imported: ${sourceFile.getBaseName()}`);
    }
  }

  await project.save();
}

main().catch((err) => {
  console.error('❌ Lỗi:', err);
  process.exit(1);
});
