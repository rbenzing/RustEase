import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompilerError } from './errors/errors.js';
import type { Token } from './lexer/tokens.js';
import type { Program } from './ast/nodes.js';
import { tokenize } from './lexer/index.js';
import { parse } from './parser/index.js';
import { analyze } from './semantic/index.js';
import { generate } from './codegen/index.js';
import { resolveImports, mergePrograms } from './cli/resolver.js';

export type { CompilerError } from './errors/errors.js';
export type { Token, TokenType } from './lexer/tokens.js';
export type { Program } from './ast/nodes.js';
export type { YlType, TypeInfo, FunctionInfo, AnalysisResult } from './semantic/types.js';
export { resolveImports, mergePrograms } from './cli/resolver.js';
export type { ResolvedFiles } from './cli/resolver.js';

export interface CompilationResult {
  success: boolean;
  rust: string;
  errors: CompilerError[];
  warnings: CompilerError[];
  tokens?: Token[];
  ast?: Program;
  sourceLines?: string[];
}

export function compile(source: string, filename: string): CompilationResult {
  const sourceLines = source.split('\n');
  const { tokens, errors: lexErrors } = tokenize(source, filename);
  if (lexErrors.length > 0) return { success: false, rust: '', errors: lexErrors, warnings: [], tokens, sourceLines };

  const { program: parsedProgram, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) return { success: false, rust: '', errors: parseErrors, warnings: [], tokens, ast: parsedProgram, sourceLines };

  // Module resolution: if the program has imports and the file exists on disk, resolve all deps.
  // When compile() is called from tests with inline source strings, the file won't exist on disk,
  // so this path is safely skipped (single-file path remains completely unaffected).
  let program = parsedProgram;
  const hasImports = parsedProgram.declarations.some((d) => d.kind === 'ImportDeclaration');
  if (hasImports && existsSync(resolve(filename))) {
    const resolved = resolveImports(filename);
    if (resolved.errors.length > 0) {
      return { success: false, rust: '', errors: resolved.errors, warnings: [], tokens, ast: parsedProgram, sourceLines };
    }
    const merged = mergePrograms(resolved);
    if (merged.errors.length > 0) {
      return { success: false, rust: '', errors: merged.errors, warnings: [], tokens, ast: parsedProgram, sourceLines };
    }
    program = merged.program;
  }

  const analysis = analyze(program);
  if (analysis.errors.length > 0) return { success: false, rust: '', errors: analysis.errors, warnings: analysis.warnings, tokens, ast: program, sourceLines };

  const rust = generate(program, analysis);
  return { success: true, rust, errors: [], warnings: analysis.warnings, tokens, ast: program, sourceLines };
}

