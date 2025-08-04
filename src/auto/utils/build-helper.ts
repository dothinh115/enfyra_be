import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { Project } from 'ts-morph';

const logger = new Logger('BuildHelper');

function walkDirectory(dir: string): string[] {
  const files: string[] = [];
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...walkDirectory(fullPath));
    } else if (file.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function buildToJs({
  targetDir,
  outDir,
}: {
  targetDir: string;
  outDir: string;
}) {
  logger.log('🚀 Building JavaScript files using ts-morph directly...');

  try {
    // Create project with in-memory FS for better performance
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        outDir: '.',
        target: 99, // ES2020
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

    // Load TypeScript files into memory
    const tsFiles = walkDirectory(targetDir);
    for (const filePath of tsFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(targetDir, filePath);
      project.createSourceFile(relativePath, content);
    }

    // Emit to memory
    const output = project.emitToMemory();

    // Write emitted JS files to output directory
    for (const outputFile of output.getFiles()) {
      const outputPath = path.join(outDir, outputFile.filePath);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, outputFile.text, 'utf8');
    }

    logger.log(`✅ Successfully compiled ${tsFiles.length} TypeScript files to ${outDir}`);
  } catch (err) {
    logger.error('❌ Error building JavaScript files:', err);
    throw err;
  }
}
