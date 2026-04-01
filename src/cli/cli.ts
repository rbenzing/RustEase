#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../index.js';
import { getFunctions } from '../ast/nodes.js';
import type { CompilerError } from '../errors/errors.js';
import { VERSION } from './version.js';

// Exported for testing
export function formatErrors(errors: CompilerError[], sourceLines?: string[]): string {
  return errors
    .map((e) => {
      const header = `error[${e.stage}]: ${e.message}`;
      const pointer = `  --> ${e.location.filename}:${e.location.line}:${e.location.column}`;

      if (sourceLines && e.location.line >= 1 && e.location.line <= sourceLines.length) {
        const lineNum = e.location.line;
        const lineText = sourceLines[lineNum - 1];
        const lineNumStr = String(lineNum);
        const gutter = lineNumStr.padStart(lineNumStr.length + 1);
        const blankGutter = ' '.repeat(lineNumStr.length + 1);
        const caretOffset = Math.max(0, e.location.column - 1);
        const sourceLine = `${gutter} | ${lineText}`;
        const caretLine = `${blankGutter} | ${' '.repeat(caretOffset)}^`;
        return `${header}\n${pointer}\n${sourceLine}\n${caretLine}`;
      }

      return `${header}\n${pointer}`;
    })
    .join('\n');
}

function checkCargoAvailable(): void {
  try {
    execSync('cargo --version', { stdio: 'ignore' });
  } catch {
    console.error('error: cargo is not installed or not in PATH.');
    console.error('  Install Rust and cargo from https://rustup.rs/');
    process.exit(1);
  }
}

function readSourceFile(filePath: string): string {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    console.error(`error: file not found: ${filePath}`);
    process.exit(1);
  }
  return readFileSync(absPath, 'utf-8');
}

function writeOutputFiles(rust: string, outputDir: string): void {
  const srcDir = resolve(outputDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  const cargoToml = [
    '[package]',
    'name = "rustease-output"',
    'version = "0.1.0"',
    'edition = "2021"',
    '',
  ].join('\n');

  writeFileSync(resolve(outputDir, 'Cargo.toml'), cargoToml, 'utf-8');
  writeFileSync(resolve(srcDir, 'main.rs'), rust, 'utf-8');
}

interface BaseOptions {
  emitTokens?: boolean;
  emitAst?: boolean;
}

interface BuildRunOptions extends BaseOptions {
  output: string;
}

function runCompile(file: string, opts: BaseOptions): ReturnType<typeof compile> {
  const source = readSourceFile(file);
  const filename = basename(file);
  const result = compile(source, filename);

  if (opts.emitTokens && result.tokens) {
    console.log(JSON.stringify(result.tokens, null, 2));
  }
  if (opts.emitAst && result.ast) {
    console.log(JSON.stringify(result.ast, null, 2));
  }

  return result;
}

const program = new Command();

program
  .name('rustease')
  .description('RustEase compiler — compile .re files to Rust')
  .version(VERSION);

program
  .command('build <file>')
  .description('Compile a .re file and run cargo build')
  .option('--emit-tokens', 'Print token stream as JSON before compilation')
  .option('--emit-ast', 'Print AST as JSON before compilation')
  .option('-o, --output <path>', 'Output directory', './output')
  .action((file: string, opts: BuildRunOptions) => {
    checkCargoAvailable();
    const result = runCompile(file, opts);

    if (!result.success) {
      console.error(formatErrors(result.errors, result.sourceLines));
      process.exit(1);
    }

    const hasMain = result.ast ? getFunctions(result.ast).some((f) => f.name === 'main') : false;
    if (!hasMain) {
      console.error("error: No 'main' function found — cannot build executable");
      process.exit(1);
    }

    const outputDir = resolve(opts.output);
    writeOutputFiles(result.rust, outputDir);

    try {
      execSync('cargo build', { cwd: outputDir, stdio: 'inherit' });
      console.log('\nBuild successful!');
    } catch {
      console.error('\nBuild failed.');
      process.exit(1);
    }
  });

program
  .command('run <file>')
  .description('Compile a .re file and execute with cargo run')
  .option('--emit-tokens', 'Print token stream as JSON before compilation')
  .option('--emit-ast', 'Print AST as JSON before compilation')
  .option('-o, --output <path>', 'Output directory', './output')
  .action((file: string, opts: BuildRunOptions) => {
    checkCargoAvailable();
    const result = runCompile(file, opts);

    if (!result.success) {
      console.error(formatErrors(result.errors, result.sourceLines));
      process.exit(1);
    }

    const hasMain = result.ast ? getFunctions(result.ast).some((f) => f.name === 'main') : false;
    if (!hasMain) {
      console.error("error: No 'main' function found — cannot build executable");
      process.exit(1);
    }

    const outputDir = resolve(opts.output);
    writeOutputFiles(result.rust, outputDir);

    try {
      execSync('cargo run', { cwd: outputDir, stdio: 'inherit' });
    } catch {
      process.exit(1);
    }
  });

program
  .command('emit-rust <file>')
  .description('Compile a .re file and print generated Rust to stdout')
  .option('--emit-tokens', 'Print token stream as JSON before compilation')
  .option('--emit-ast', 'Print AST as JSON before compilation')
  .action((file: string, opts: BaseOptions) => {
    const result = runCompile(file, opts);

    if (!result.success) {
      console.error(formatErrors(result.errors, result.sourceLines));
      process.exit(1);
    }

    process.stdout.write(result.rust);
  });

// Only parse argv when running as the main entry point (not when imported for testing).
// In CJS/SEA mode, import.meta.url is undefined — treat that as main entry (correct for standalone exe).
const isMain = (() => {
  if (process.argv[1] === undefined) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return true;
  }
})();

if (isMain) {
  program.parse(process.argv);
}

export { program };

