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

