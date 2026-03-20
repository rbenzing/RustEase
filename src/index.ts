import type { CompilerError } from './errors/errors.js';
import type { Token } from './lexer/tokens.js';
import type { Program } from './ast/nodes.js';
import { tokenize } from './lexer/index.js';
import { parse } from './parser/index.js';
import { analyze } from './semantic/index.js';
import { generate } from './codegen/index.js';

export type { CompilerError } from './errors/errors.js';
export type { Token, TokenType } from './lexer/tokens.js';
export type { Program } from './ast/nodes.js';
export type { YlType, TypeInfo, FunctionInfo, AnalysisResult } from './semantic/types.js';
export { YL_TO_RUST_TYPE } from './semantic/types.js';

export interface CompilationResult {
  success: boolean;
  rust: string;
  errors: CompilerError[];
  warnings: CompilerError[];
  tokens?: Token[];
  ast?: Program;
}

export function compile(source: string, filename: string): CompilationResult {
  const { tokens, errors: lexErrors } = tokenize(source, filename);
  if (lexErrors.length > 0) return { success: false, rust: '', errors: lexErrors, warnings: [], tokens };

  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) return { success: false, rust: '', errors: parseErrors, warnings: [], tokens, ast: program };

  const analysis = analyze(program);
  if (analysis.errors.length > 0) return { success: false, rust: '', errors: analysis.errors, warnings: analysis.warnings, tokens, ast: program };

  const rust = generate(program, analysis);
  return { success: true, rust, errors: [], warnings: analysis.warnings, tokens, ast: program };
}

