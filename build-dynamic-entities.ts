import * as ts from 'typescript';
import * as path from 'path';

async function buildDynamicEntities() {
  const configPath = path.resolve(__dirname, 'tsconfig.dynamic-entities.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );

  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });

  const emitResult = program.emit();

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);
  diagnostics.forEach((diagnostic) => {
    if (diagnostic.file && diagnostic.start !== undefined) {
      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start,
      );
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        '\n',
      );
      console.error(
        `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`,
      );
    } else {
      console.error(
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      );
    }
  });

  if (emitResult.emitSkipped) {
    throw new Error('Build failed');
  }
  console.log('Build dynamic entities completed!');
}

buildDynamicEntities().catch((e) => {
  console.error(e);
  process.exit(1);
});
