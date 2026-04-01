import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tokenize } from '../lexer/index.js';
import { parse } from '../parser/index.js';
import { createError } from '../errors/errors.js';
import type { CompilerError, SourceLocation } from '../errors/errors.js';
import type { Program, Declaration } from '../ast/nodes.js';

export interface ResolvedFiles {
  programs: Map<string, Program>;  // absolute filepath → parsed AST
  errors: CompilerError[];
  order: string[];  // topological order (dependencies before dependents)
}

export function resolveImports(entryPath: string): ResolvedFiles {
  const programs = new Map<string, Program>();
  const errors: CompilerError[] = [];
  const order: string[] = [];
  const visiting = new Set<string>();  // currently in DFS stack (cycle detection)
  const visited = new Set<string>();   // fully resolved

  function resolveFile(absPath: string, importLoc?: SourceLocation): void {
    if (visited.has(absPath)) return;

    if (visiting.has(absPath)) {
      const errorLoc = importLoc ?? { line: 1, column: 1, filename: absPath };
      errors.push(createError('parser', `Circular import detected: '${absPath}'`, errorLoc));
      return;
    }

    if (!existsSync(absPath)) {
      const errorLoc = importLoc ?? { line: 1, column: 1, filename: absPath };
      errors.push(createError('parser', `Cannot resolve import '${absPath}': file not found`, errorLoc));
      return;
    }

    visiting.add(absPath);

    let source: string;
    try {
      source = readFileSync(absPath, 'utf-8');
    } catch (err) {
      const errorLoc = importLoc ?? { line: 1, column: 1, filename: absPath };
      errors.push(createError('parser', `Cannot read file '${absPath}': ${String(err)}`, errorLoc));
      visiting.delete(absPath);
      return;
    }

    const { tokens, errors: lexErrors } = tokenize(source, absPath);
    errors.push(...lexErrors);

    const { program, errors: parseErrors } = parse(tokens);
    errors.push(...parseErrors);

    programs.set(absPath, program);

    // Recursively resolve imports declared in this file
    for (const decl of program.declarations) {
      if (decl.kind === 'ImportDeclaration') {
        let importPath = decl.path;
        // Add .re extension if not present
        if (!importPath.endsWith('.re')) {
          importPath = `${importPath}.re`;
        }
        const importedAbsPath = resolve(dirname(absPath), importPath);
        resolveFile(importedAbsPath, decl.location);
      }
    }

    visiting.delete(absPath);
    visited.add(absPath);
    order.push(absPath);
  }

  resolveFile(resolve(entryPath));

  return { programs, errors, order };
}

export function mergePrograms(resolved: ResolvedFiles): { program: Program; errors: CompilerError[] } {
  const errors: CompilerError[] = [];
  const declarations: Declaration[] = [];

  // Track which file each named declaration came from (for duplicate detection)
  const seenFunctions = new Map<string, string>(); // name → filepath
  const seenStructs = new Map<string, string>();
  const seenEnums = new Map<string, string>();

  // Process files in topological order (dependencies first, entry last)
  for (const filePath of resolved.order) {
    const program = resolved.programs.get(filePath);
    if (!program) continue;

    for (const decl of program.declarations) {
      // Strip ImportDeclaration nodes — they've been resolved
      if (decl.kind === 'ImportDeclaration') continue;

      // Detect duplicate top-level names across files
      if (decl.kind === 'FunctionDeclaration') {
        if (seenFunctions.has(decl.name)) {
          errors.push(createError('semantic',
            `Duplicate declaration '${decl.name}': already defined in '${seenFunctions.get(decl.name)}'`,
            decl.location));
          continue;
        }
        seenFunctions.set(decl.name, filePath);
      } else if (decl.kind === 'StructDeclaration') {
        if (seenStructs.has(decl.name)) {
          errors.push(createError('semantic',
            `Duplicate declaration '${decl.name}': already defined in '${seenStructs.get(decl.name)}'`,
            decl.location));
          continue;
        }
        seenStructs.set(decl.name, filePath);
      } else if (decl.kind === 'EnumDeclaration') {
        if (seenEnums.has(decl.name)) {
          errors.push(createError('semantic',
            `Duplicate declaration '${decl.name}': already defined in '${seenEnums.get(decl.name)}'`,
            decl.location));
          continue;
        }
        seenEnums.set(decl.name, filePath);
      }

      declarations.push(decl);
    }
  }

  // The entry file is last in topological order; use its location for the merged program
  const entryPath = resolved.order[resolved.order.length - 1] ?? '';
  const entryProgram = resolved.programs.get(entryPath);
  const location: SourceLocation = entryProgram?.location ?? { line: 1, column: 1, filename: entryPath };

  const program: Program = { kind: 'Program', location, declarations };
  return { program, errors };
}
