const fs = require('fs');
const path = require('path');
const { Project, SyntaxKind } = require('ts-morph');
const pLimit = require('p-limit').default;

// ✅ CẤU HÌNH CỐ ĐỊNH
const TARGET_DIR = path.resolve('src/entities'); // nơi cần auto import
const SCAN_DIRS = [
  // nơi scan export
  path.resolve('src/entities'),
];

const knownGlobalImports = {
  Entity: 'typeorm',
  Column: 'typeorm',
  PrimaryGeneratedColumn: 'typeorm',
};

function getAllTsFiles(dirPath) {
  const result = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) result.push(...getAllTsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.ts'))
      result.push(fullPath);
  }
  return result;
}

async function buildExportMapAsync(scanDirs, refFile) {
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

async function autoAddImportsToFile(filePath, suggestions) {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(filePath);
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
  await sourceFile.save();
}

async function processFile(filePath, exportMap) {
  const project = new Project();
  const sourceFile = project.addSourceFileAtPath(filePath);
  const usedIdentifiers = new Set();
  const imported = new Set();

  sourceFile.getImportDeclarations().forEach((decl) => {
    decl.getNamedImports().forEach((imp) => imported.add(imp.getName()));
  });

  sourceFile.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.Identifier) {
      const name = node.getText();
      const symbol = node.getSymbol();
      if (!symbol && !imported.has(name)) usedIdentifiers.add(name);
    }
  });

  const classes = sourceFile.getClasses().map((c) => c.getName());
  const vars = sourceFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .map((v) => v.getName());
  for (const name of [...classes, ...vars]) usedIdentifiers.delete(name);

  const missing = [...usedIdentifiers];
  const suggestions = [];

  for (const name of missing) {
    if (knownGlobalImports[name]) {
      suggestions.push({ name, module: knownGlobalImports[name] });
    } else if (exportMap.has(name)) {
      suggestions.push({ name, module: exportMap.get(name) });
    }
  }

  if (suggestions.length) {
    await autoAddImportsToFile(filePath, suggestions);
    console.log(`✅ Imported into ${filePath}`);
  }
}

async function main() {
  const files = getAllTsFiles(TARGET_DIR);
  const exportMap = await buildExportMapAsync(SCAN_DIRS, files[0]);
  const limit = pLimit(5);
  const tasks = files.map((f) => limit(() => processFile(f, exportMap)));
  await Promise.allSettled(tasks);
}

main().catch((err) => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
