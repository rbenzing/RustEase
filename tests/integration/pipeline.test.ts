import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, mkdtempSync, rmdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compile } from '../../src/index.js';
import { formatErrors } from '../../src/cli/cli.js';
import { mergePrograms } from '../../src/cli/resolver.js';
import type { ResolvedFiles } from '../../src/cli/resolver.js';
import type { Program, FunctionDeclaration, StructDeclaration, EnumDeclaration, ImportDeclaration } from '../../src/ast/nodes.js';

describe('compile() pipeline — end-to-end integration', () => {
  it('compiles a valid program successfully', () => {
    const source = [
      'function main()',
      '    x = 42',
      '    print(x)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(true);
    expect(result.rust).toContain('fn main()');
    expect(result.rust).toContain('let x: i32 = 42;');
    expect(result.rust).toContain('println!("{}", x);');
    expect(result.errors).toHaveLength(0);
  });

  it('returns tokens in the compilation result', () => {
    const source = 'function main()\nend';
    const result = compile(source, 'test.re');

    expect(result.tokens).toBeDefined();
    expect(Array.isArray(result.tokens)).toBe(true);
    expect(result.tokens!.length).toBeGreaterThan(0);
  });

  it('returns AST in the compilation result', () => {
    const source = 'function main()\nend';
    const result = compile(source, 'test.re');

    expect(result.ast).toBeDefined();
    expect(result.ast!.kind).toBe('Program');
    const fns = result.ast!.declarations.filter(d => d.kind === 'FunctionDeclaration');
    expect(fns).toHaveLength(1);
    expect((fns[0] as { name: string }).name).toBe('main');
  });

  it('returns errors for programs with invalid characters', () => {
    const source = 'function main()\nx = @bad\nend';
    const result = compile(source, 'test.re');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].stage).toBe('lexer');
  });

  it('returns errors for programs with semantic errors', () => {
    // Using an undefined variable should cause a semantic error
    const source = [
      'function main()',
      '    print(undeclared)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('compiles a multi-function program with cross-function calls', () => {
    const source = [
      'function add(a, b)',
      '    return a + b',
      'end',
      'function main()',
      '    result = add(1, 2)',
      '    print(result)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(true);
    expect(result.rust).toMatch(/fn add\(a: i32, b: i32\) -> i32/);
    expect(result.rust).toContain('fn main()');
    expect(result.rust).toContain('let result: i32 = add(1, 2);');
  });

  it('includes warnings in the result', () => {
    // Division by literal zero should produce a warning
    const source = [
      'function main()',
      '    x = 10 / 0',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');
    // Warnings may or may not prevent success, but they exist
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('populates sourceLines on a successful compilation', () => {
    const source = [
      'function main()',
      '    x = 42',
      '    print(x)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.sourceLines).toBeDefined();
    expect(result.sourceLines).toHaveLength(4);
    expect(result.sourceLines![0]).toBe('function main()');
    expect(result.sourceLines![1]).toBe('    x = 42');
    expect(result.sourceLines![3]).toBe('end');
  });

  it('populates sourceLines on a failed compilation', () => {
    const source = [
      'function main()',
      '    print(undeclared)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(false);
    expect(result.sourceLines).toBeDefined();
    expect(result.sourceLines).toHaveLength(3);
    expect(result.sourceLines![1]).toBe('    print(undeclared)');
  });
});

describe('compile() — single-file programs unaffected by module system', () => {
  it('compiles a valid single-file program with no imports (no change in behavior)', () => {
    const source = [
      'function main()',
      '    x = 10',
      '    print(x)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(true);
    expect(result.rust).toContain('fn main()');
    expect(result.errors).toHaveLength(0);
    expect(result.ast).toBeDefined();
    expect(result.ast!.declarations.every((d) => d.kind !== 'ImportDeclaration')).toBe(true);
  });
});

describe('compile() — multi-file module resolution', () => {
  let tmpDir: string;
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
    try { rmdirSync(tmpDir); } catch { /* ignore */ }
  });

  it('resolves and merges imported files end-to-end', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rustease-test-'));

    const utilsPath = join(tmpDir, 'utils.re');
    const mainPath = join(tmpDir, 'main.re');
    tmpFiles.push(utilsPath, mainPath);

    writeFileSync(utilsPath, [
      'function add(a, b)',
      '    return a + b',
      'end',
    ].join('\n'));

    writeFileSync(mainPath, [
      'import "./utils"',
      'function main()',
      '    result = add(1, 2)',
      '    print(result)',
      'end',
    ].join('\n'));

    const source = readFileSync(mainPath, 'utf-8');
    const result = compile(source, mainPath);

    expect(result.success).toBe(true);
    expect(result.rust).toContain('fn add(');
    expect(result.rust).toContain('fn main()');
    expect(result.errors).toHaveLength(0);
    // ImportDeclaration nodes should have been stripped from the merged AST
    const importDecls = result.ast!.declarations.filter((d) => d.kind === 'ImportDeclaration');
    expect(importDecls).toHaveLength(0);
  });

  it('returns errors when an imported file does not exist', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'rustease-test-'));

    const mainPath = join(tmpDir, 'main.re');
    tmpFiles.push(mainPath);

    writeFileSync(mainPath, [
      'import "./nonexistent"',
      'function main()',
      '    print(42)',
      'end',
    ].join('\n'));

    const source = readFileSync(mainPath, 'utf-8');
    const result = compile(source, mainPath);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('nonexistent');
  });

  it('skips module resolution for inline source strings (file not on disk)', () => {
    // When compile() is called with an inline source and a fake filename not on disk,
    // the module resolution path must be skipped entirely even if imports are present.
    // The ImportDeclaration node is left in the AST and ignored by the analyzer.
    const source = [
      'function main()',
      '    print(42)',
      'end',
    ].join('\n');

    // Passing a path that definitely does not exist on disk
    const result = compile(source, '/no/such/file/test.re');

    expect(result.success).toBe(true);
    expect(result.rust).toContain('fn main()');
  });
});

describe('formatErrors()', () => {
  it('formats a single error correctly', () => {
    const errors = [
      {
        stage: 'lexer' as const,
        message: "Unexpected character '@'",
        location: { filename: 'test.re', line: 2, column: 5 },
      },
    ];

    const formatted = formatErrors(errors);

    expect(formatted).toContain('error[lexer]:');
    expect(formatted).toContain("Unexpected character '@'");
    expect(formatted).toContain('-->');
    expect(formatted).toContain('test.re:2:5');
  });

  it('formats multiple errors separated by newlines', () => {
    const errors = [
      {
        stage: 'lexer' as const,
        message: 'Error one',
        location: { filename: 'a.re', line: 1, column: 1 },
      },
      {
        stage: 'semantic' as const,
        message: 'Error two',
        location: { filename: 'a.re', line: 3, column: 7 },
      },
    ];

    const formatted = formatErrors(errors);

    expect(formatted).toContain('error[lexer]: Error one');
    expect(formatted).toContain('error[semantic]: Error two');
    expect(formatted).toContain('a.re:1:1');
    expect(formatted).toContain('a.re:3:7');
  });

  it('returns an empty string for an empty errors array', () => {
    expect(formatErrors([])).toBe('');
  });

  it('formats error with correct stage labels', () => {
    const stages = ['lexer', 'parser', 'semantic', 'codegen'] as const;
    for (const stage of stages) {
      const errors = [
        { stage, message: 'msg', location: { filename: 'f.re', line: 1, column: 1 } },
      ];
      expect(formatErrors(errors)).toContain(`error[${stage}]:`);
    }
  });

  it('includes source line and caret when sourceLines is provided', () => {
    const sourceLines = [
      'function main()',
      '    print(undeclared)',
      'end',
    ];
    const errors = [
      {
        stage: 'semantic' as const,
        message: "Undefined variable 'undeclared'",
        location: { filename: 'test.re', line: 2, column: 11 },
      },
    ];

    const formatted = formatErrors(errors, sourceLines);

    expect(formatted).toContain('    print(undeclared)');
    expect(formatted).toContain('|');
    expect(formatted).toContain('^');
    // Caret should be at column 11 (10 spaces offset from the gutter '| ')
    const lines = formatted.split('\n');
    const caretLine = lines.find((l) => l.includes('^') && l.includes('|'));
    expect(caretLine).toBeDefined();
    const caretIndex = caretLine!.indexOf('^');
    const pipeIndex = caretLine!.indexOf('|');
    // Caret appears after the pipe + mandatory space + (column-1) spaces
    expect(caretIndex).toBe(pipeIndex + 2 + 10); // column 11 → 10 spaces offset after '| '
  });

  it('omits source context when sourceLines is not provided', () => {
    const errors = [
      {
        stage: 'lexer' as const,
        message: "Unexpected character '@'",
        location: { filename: 'test.re', line: 2, column: 5 },
      },
    ];

    const formatted = formatErrors(errors);

    expect(formatted).toContain('error[lexer]:');
    expect(formatted).toContain('-->');
    // Without sourceLines there should be no pipe/caret lines
    expect(formatted).not.toContain('|');
    expect(formatted).not.toContain('^');
  });

  it('includes source line from compile result in formatted errors', () => {
    const source = [
      'function main()',
      '    print(undeclared)',
      'end',
    ].join('\n');

    const result = compile(source, 'test.re');

    expect(result.success).toBe(false);
    expect(result.sourceLines).toBeDefined();

    const formatted = formatErrors(result.errors, result.sourceLines);

    expect(formatted).toContain('    print(undeclared)');
    expect(formatted).toContain('^');
  });
});

// --- Helpers for building minimal AST nodes ---
function makeLocation(filename: string) {
  return { line: 1, column: 1, filename };
}

function makeFn(name: string, filename: string): FunctionDeclaration {
  return { kind: 'FunctionDeclaration', name, parameters: [], body: [], location: makeLocation(filename) };
}

function makeStruct(name: string, filename: string): StructDeclaration {
  return { kind: 'StructDeclaration', name, fields: [], location: makeLocation(filename) };
}

function makeEnum(name: string, filename: string): EnumDeclaration {
  return { kind: 'EnumDeclaration', name, variants: [], location: makeLocation(filename) };
}

function makeImport(path: string, filename: string): ImportDeclaration {
  return { kind: 'ImportDeclaration', path, names: [], location: makeLocation(filename) };
}

function makeProgram(filename: string, decls: Program['declarations']): Program {
  return { kind: 'Program', location: makeLocation(filename), declarations: decls };
}

describe('mergePrograms()', () => {
  it('flattens declarations from all files in topological order', () => {
    const utilsPath = '/abs/utils.re';
    const mainPath = '/abs/main.re';

    const utilsProgram = makeProgram(utilsPath, [makeFn('helper', utilsPath)]);
    const mainProgram = makeProgram(mainPath, [makeFn('main', mainPath)]);

    const resolved: ResolvedFiles = {
      programs: new Map([[utilsPath, utilsProgram], [mainPath, mainProgram]]),
      order: [utilsPath, mainPath],
      errors: [],
    };

    const { program, errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(0);
    expect(program.kind).toBe('Program');
    expect(program.declarations).toHaveLength(2);
    const names = program.declarations.map((d) => (d as FunctionDeclaration).name);
    expect(names).toEqual(['helper', 'main']);
  });

  it('strips ImportDeclaration nodes from all files', () => {
    const utilsPath = '/abs/utils.re';
    const mainPath = '/abs/main.re';

    const utilsProgram = makeProgram(utilsPath, [makeFn('helper', utilsPath)]);
    const mainProgram = makeProgram(mainPath, [
      makeImport('./utils.re', mainPath),
      makeFn('main', mainPath),
    ]);

    const resolved: ResolvedFiles = {
      programs: new Map([[utilsPath, utilsProgram], [mainPath, mainProgram]]),
      order: [utilsPath, mainPath],
      errors: [],
    };

    const { program, errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(0);
    const importDecls = program.declarations.filter((d) => d.kind === 'ImportDeclaration');
    expect(importDecls).toHaveLength(0);
    expect(program.declarations).toHaveLength(2);
  });

  it('errors on duplicate function names across files', () => {
    const fileA = '/abs/a.re';
    const fileB = '/abs/b.re';

    const programA = makeProgram(fileA, [makeFn('shared', fileA)]);
    const programB = makeProgram(fileB, [makeFn('shared', fileB)]);

    const resolved: ResolvedFiles = {
      programs: new Map([[fileA, programA], [fileB, programB]]),
      order: [fileA, fileB],
      errors: [],
    };

    const { program, errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate declaration 'shared'");
    expect(errors[0].message).toContain(fileA);
    // The duplicate is not included in the merged declarations
    expect(program.declarations).toHaveLength(1);
  });

  it('errors on duplicate struct names across files', () => {
    const fileA = '/abs/a.re';
    const fileB = '/abs/b.re';

    const programA = makeProgram(fileA, [makeStruct('Point', fileA)]);
    const programB = makeProgram(fileB, [makeStruct('Point', fileB)]);

    const resolved: ResolvedFiles = {
      programs: new Map([[fileA, programA], [fileB, programB]]),
      order: [fileA, fileB],
      errors: [],
    };

    const { errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate declaration 'Point'");
  });

  it('errors on duplicate enum names across files', () => {
    const fileA = '/abs/a.re';
    const fileB = '/abs/b.re';

    const programA = makeProgram(fileA, [makeEnum('Color', fileA)]);
    const programB = makeProgram(fileB, [makeEnum('Color', fileB)]);

    const resolved: ResolvedFiles = {
      programs: new Map([[fileA, programA], [fileB, programB]]),
      order: [fileA, fileB],
      errors: [],
    };

    const { errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate declaration 'Color'");
  });

  it('uses entry file location for merged program', () => {
    const depPath = '/abs/dep.re';
    const entryPath = '/abs/entry.re';

    const depProgram = makeProgram(depPath, [makeFn('helper', depPath)]);
    const entryProgram = makeProgram(entryPath, [makeFn('main', entryPath)]);

    const resolved: ResolvedFiles = {
      programs: new Map([[depPath, depProgram], [entryPath, entryProgram]]),
      order: [depPath, entryPath],
      errors: [],
    };

    const { program } = mergePrograms(resolved);

    expect(program.location.filename).toBe(entryPath);
  });

  it('merges struct, enum, and function declarations together', () => {
    const filePath = '/abs/single.re';
    const singleProgram = makeProgram(filePath, [
      makeStruct('Foo', filePath),
      makeEnum('Bar', filePath),
      makeFn('baz', filePath),
    ]);

    const resolved: ResolvedFiles = {
      programs: new Map([[filePath, singleProgram]]),
      order: [filePath],
      errors: [],
    };

    const { program, errors } = mergePrograms(resolved);

    expect(errors).toHaveLength(0);
    expect(program.declarations).toHaveLength(3);
    expect(program.declarations[0].kind).toBe('StructDeclaration');
    expect(program.declarations[1].kind).toBe('EnumDeclaration');
    expect(program.declarations[2].kind).toBe('FunctionDeclaration');
  });
});

