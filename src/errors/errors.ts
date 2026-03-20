export interface SourceLocation {
  line: number;    // 1-based
  column: number;  // 1-based
  filename: string;
}

export type CompilerStage = 'lexer' | 'parser' | 'semantic' | 'codegen';

export interface CompilerError {
  stage: CompilerStage;
  message: string;
  location: SourceLocation;
}

export function createError(
  stage: CompilerStage,
  message: string,
  location: SourceLocation,
): CompilerError {
  return { stage, message, location };
}

