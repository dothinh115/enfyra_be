const { Project } = require('ts-morph');
const fs = require('fs');
const path = require('path');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

// CLI args
const argv = yargs(hideBin(process.argv))
  .option('targetDir', {
    alias: 't',
    type: 'string',
    description: 'Thư mục chứa source TypeScript',
    demandOption: true,
  })
  .option('outDir', {
    alias: 'o',
    type: 'string',
    description: 'Thư mục xuất file biên dịch',
    demandOption: true,
  })
  .parseSync();

const targetDir = path.resolve(argv.targetDir);
const outDir = path.resolve(argv.outDir);

// Create project with in-memory FS
const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: {
    outDir: '.', // in memory
    target: 3, // ES2020
    module: 1, // CommonJS
    rootDir: '.',
    strict: true,
    esModuleInterop: true,
    emitDecoratorMetadata: true,
    experimentalDecorators: true,
    skipLibCheck: true,
    declaration: false,
  },
});

function walk(dir) {
  const files = [];
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (file.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

// Load real files into memory
const tsFiles = walk(targetDir);
for (const filePath of tsFiles) {
  const content = fs.readFileSync(filePath, 'utf8');
  const relative = path.relative(targetDir, filePath);
  project.createSourceFile(relative, content);
}

// Emit to memory
const output = project.emitToMemory();

// Write emitted JS to outDir
for (const outputFile of output.getFiles()) {
  const filePath = path.join(outDir, outputFile.filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, outputFile.text, 'utf8');
}

console.log('✅ Đã biên dịch và ghi JS vào:', outDir);
