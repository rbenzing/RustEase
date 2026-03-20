import { describe, it, expect } from 'vitest';
import { compile } from '../../src/index.js';
import { formatErrors } from '../../src/cli/cli.js';

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
});

