import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import type {
  Program,
  FunctionDeclaration,
  VariableAssignment,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ExpressionStatement,
  BinaryExpression,
  UnaryExpression,
  Literal,
  IdentifierExpr,
  FunctionCall,
  GroupedExpression,
} from '../../src/ast/nodes.js';

// Helper: tokenize source then parse, ignoring lexer errors
function parseSource(source: string): ReturnType<typeof parse> {
  const { tokens } = tokenize(source, 'test.re');
  return parse(tokens);
}

// Helper: get first function from program
function firstFn(source: string): FunctionDeclaration {
  const { program } = parseSource(source);
  return program.declarations.filter(d => d.kind === 'FunctionDeclaration')[0]! as FunctionDeclaration;
}

// Helper: get first statement from first function
function firstStmt(source: string) {
  return firstFn(source).body[0]!;
}

// ─── Program-level tests ────────────────────────────────────────────────────

describe('parse() — empty program', () => {
  it('returns a Program node with empty declarations array', () => {
    const { program, errors } = parseSource('');
    expect(program.kind).toBe('Program');
    expect(program.declarations).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});

// ─── Function declarations ──────────────────────────────────────────────────

describe('parse() — function declarations', () => {
  it('parses minimal function with no body', () => {
    const fn = firstFn('function foo()\nend');
    expect(fn.kind).toBe('FunctionDeclaration');
    expect(fn.name).toBe('foo');
    expect(fn.parameters).toHaveLength(0);
    expect(fn.body).toHaveLength(0);
  });

  it('parses function with one parameter', () => {
    const fn = firstFn('function greet(name)\nend');
    expect(fn.parameters).toHaveLength(1);
    expect(fn.parameters[0]!.name).toBe('name');
  });

  it('parses function with multiple parameters', () => {
    const fn = firstFn('function add(a, b)\nend');
    expect(fn.parameters).toHaveLength(2);
    expect(fn.parameters[0]!.name).toBe('a');
    expect(fn.parameters[1]!.name).toBe('b');
  });

  it('parses multiple functions in a file', () => {
    const source = 'function foo()\nend\nfunction bar()\nend';
    const { program } = parseSource(source);
    const fns = program.declarations.filter(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration[];
    expect(fns).toHaveLength(2);
    expect(fns[0]!.name).toBe('foo');
    expect(fns[1]!.name).toBe('bar');
  });
});

// ─── Statements ─────────────────────────────────────────────────────────────

describe('parse() — variable assignment', () => {
  it('parses assignment: x = 42', () => {
    const stmt = firstStmt('function f()\nx = 42\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('x');
    const lit = stmt.expression as Literal;
    expect(lit.kind).toBe('Literal');
    expect(lit.value).toBe(42);
    expect(lit.literalType).toBe('int');
  });
});

describe('parse() — return statement', () => {
  it('parses return with expression', () => {
    const stmt = firstStmt('function f()\nreturn x\nend') as ReturnStatement;
    expect(stmt.kind).toBe('ReturnStatement');
    const expr = stmt.expression as IdentifierExpr;
    expect(expr.kind).toBe('Identifier');
    expect(expr.name).toBe('x');
  });
});

describe('parse() — expression statement', () => {
  it('parses bare function call as expression statement', () => {
    const stmt = firstStmt('function f()\nprint(x)\nend') as ExpressionStatement;
    expect(stmt.kind).toBe('ExpressionStatement');
    const call = stmt.expression as FunctionCall;
    expect(call.kind).toBe('FunctionCall');
    expect(call.name).toBe('print');
  });
});

// ─── If statements ───────────────────────────────────────────────────────────

describe('parse() — if statement', () => {
  it('parses if-only statement', () => {
    const src = 'function f()\nif x > 0\nreturn x\nend\nend';
    const stmt = firstStmt(src) as IfStatement;
    expect(stmt.kind).toBe('IfStatement');
    expect(stmt.thenBranch).toHaveLength(1);
    expect(stmt.elseIfBranches).toHaveLength(0);
    expect(stmt.elseBranch).toBeNull();
    const cond = stmt.condition as BinaryExpression;
    expect(cond.operator).toBe('>');
  });

  it('parses if/else statement', () => {
    const src = 'function f()\nif x > 0\nreturn x\nelse\nreturn 0\nend\nend';
    const stmt = firstStmt(src) as IfStatement;
    expect(stmt.thenBranch).toHaveLength(1);
    expect(stmt.elseBranch).not.toBeNull();
    expect(stmt.elseBranch).toHaveLength(1);
    expect(stmt.elseIfBranches).toHaveLength(0);
  });

  it('parses if/else if/else chain', () => {
    const src = [
      'function f()',
      'if x > 0',
      'return 1',
      'else if x < 0',
      'return -1',
      'else',
      'return 0',
      'end',
      'end',
    ].join('\n');
    const stmt = firstStmt(src) as IfStatement;
    expect(stmt.thenBranch).toHaveLength(1);
    expect(stmt.elseIfBranches).toHaveLength(1);
    expect(stmt.elseIfBranches[0]!.body).toHaveLength(1);
    expect(stmt.elseBranch).toHaveLength(1);
  });

  it('parses if/else if/else if/else chain (multiple else-if branches)', () => {
    const src = [
      'function f()',
      'if a',
      'return 1',
      'else if b',
      'return 2',
      'else if c',
      'return 3',
      'else',
      'return 4',
      'end',
      'end',
    ].join('\n');
    const stmt = firstStmt(src) as IfStatement;
    expect(stmt.elseIfBranches).toHaveLength(2);
    expect(stmt.elseBranch).toHaveLength(1);
  });
});

// ─── While statement ─────────────────────────────────────────────────────────

describe('parse() — while statement', () => {
  it('parses while loop', () => {
    const src = 'function f()\nwhile x < 10\nx = x + 1\nend\nend';
    const stmt = firstStmt(src) as WhileStatement;
    expect(stmt.kind).toBe('WhileStatement');
    const cond = stmt.condition as BinaryExpression;
    expect(cond.operator).toBe('<');
    expect(stmt.body).toHaveLength(1);
  });
});

// ─── Expressions ─────────────────────────────────────────────────────────────

describe('parse() — operator precedence', () => {
  it('a + b * c — multiplication binds tighter', () => {
    const src = 'function f()\nreturn a + b * c\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const outer = ret.expression as BinaryExpression;
    expect(outer.kind).toBe('BinaryExpression');
    expect(outer.operator).toBe('+');
    // right side is b * c
    const inner = outer.right as BinaryExpression;
    expect(inner.operator).toBe('*');
    const b = inner.left as IdentifierExpr;
    const c = inner.right as IdentifierExpr;
    expect(b.name).toBe('b');
    expect(c.name).toBe('c');
  });

  it('(a + b) * c — grouping overrides precedence', () => {
    const src = 'function f()\nreturn (a + b) * c\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const outer = ret.expression as BinaryExpression;
    expect(outer.operator).toBe('*');
    const grouped = outer.left as GroupedExpression;
    expect(grouped.kind).toBe('GroupedExpression');
    const inner = grouped.expression as BinaryExpression;
    expect(inner.operator).toBe('+');
  });
});

describe('parse() — unary expressions', () => {
  it('parses unary not', () => {
    const src = 'function f()\nreturn not x\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const unary = ret.expression as UnaryExpression;
    expect(unary.kind).toBe('UnaryExpression');
    expect(unary.operator).toBe('not');
    const operand = unary.operand as IdentifierExpr;
    expect(operand.name).toBe('x');
  });

  it('parses unary minus', () => {
    const src = 'function f()\nreturn -x\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const unary = ret.expression as UnaryExpression;
    expect(unary.kind).toBe('UnaryExpression');
    expect(unary.operator).toBe('-');
  });
});

describe('parse() — function calls', () => {
  it('parses function call with multiple arguments', () => {
    const src = 'function f()\nfoo(1, 2, 3)\nend';
    const stmt = firstStmt(src) as ExpressionStatement;
    const call = stmt.expression as FunctionCall;
    expect(call.kind).toBe('FunctionCall');
    expect(call.name).toBe('foo');
    expect(call.arguments).toHaveLength(3);
  });

  it('parses nested function calls', () => {
    const src = 'function f()\nprint(add(1, 2))\nend';
    const stmt = firstStmt(src) as ExpressionStatement;
    const outer = stmt.expression as FunctionCall;
    expect(outer.name).toBe('print');
    expect(outer.arguments).toHaveLength(1);
    const inner = outer.arguments[0] as FunctionCall;
    expect(inner.kind).toBe('FunctionCall');
    expect(inner.name).toBe('add');
    expect(inner.arguments).toHaveLength(2);
  });
});

// ─── Literals ────────────────────────────────────────────────────────────────

describe('parse() — literal types', () => {
  it('parses integer literal', () => {
    const stmt = firstStmt('function f()\nreturn 42\nend') as ReturnStatement;
    const lit = stmt.expression as Literal;
    expect(lit.kind).toBe('Literal');
    expect(lit.literalType).toBe('int');
    expect(lit.value).toBe(42);
  });

  it('parses float literal', () => {
    const stmt = firstStmt('function f()\nreturn 3.14\nend') as ReturnStatement;
    const lit = stmt.expression as Literal;
    expect(lit.literalType).toBe('float');
    expect(lit.value).toBeCloseTo(3.14);
  });

  it('parses string literal', () => {
    const stmt = firstStmt('function f()\nreturn "hello"\nend') as ReturnStatement;
    const lit = stmt.expression as Literal;
    expect(lit.literalType).toBe('string');
    expect(lit.value).toBe('hello');
  });

  it('parses true literal', () => {
    const stmt = firstStmt('function f()\nreturn true\nend') as ReturnStatement;
    const lit = stmt.expression as Literal;
    expect(lit.literalType).toBe('bool');
    expect(lit.value).toBe(true);
  });

  it('parses false literal', () => {
    const stmt = firstStmt('function f()\nreturn false\nend') as ReturnStatement;
    const lit = stmt.expression as Literal;
    expect(lit.literalType).toBe('bool');
    expect(lit.value).toBe(false);
  });
});

// ─── Binary operators ─────────────────────────────────────────────────────────

describe('parse() — binary operators', () => {
  it.each([
    ['a + b', '+'],
    ['a - b', '-'],
    ['a * b', '*'],
    ['a / b', '/'],
    ['a % b', '%'],
    ['a == b', '=='],
    ['a != b', '!='],
    ['a > b', '>'],
    ['a < b', '<'],
    ['a >= b', '>='],
    ['a <= b', '<='],
    ['a and b', 'and'],
    ['a or b', 'or'],
  ] as const)('parses operator %s', (expr, op) => {
    const src = `function f()\nreturn ${expr}\nend`;
    const ret = firstStmt(src) as ReturnStatement;
    const bin = ret.expression as BinaryExpression;
    expect(bin.kind).toBe('BinaryExpression');
    expect(bin.operator).toBe(op);
  });
});

// P2-S02: Modulo operator precedence
describe('parse() — modulo operator (P2-S02)', () => {
  it('a % b parses as BinaryExpression with operator %', () => {
    const src = 'function f()\nreturn a % b\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const bin = ret.expression as BinaryExpression;
    expect(bin.kind).toBe('BinaryExpression');
    expect(bin.operator).toBe('%');
  });

  it('a + b % c — % binds tighter than +', () => {
    const src = 'function f()\nreturn a + b % c\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const outer = ret.expression as BinaryExpression;
    expect(outer.operator).toBe('+');
    const inner = outer.right as BinaryExpression;
    expect(inner.operator).toBe('%');
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe('parse() — error handling', () => {
  it('produces CompilerError with location for unexpected token at top level', () => {
    const { errors } = parseSource('42');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.stage).toBe('parser');
    expect(errors[0]!.location).toBeDefined();
    expect(errors[0]!.location.line).toBeGreaterThan(0);
    expect(errors[0]!.location.column).toBeGreaterThan(0);
  });

  it('includes message describing the unexpected token', () => {
    const { errors } = parseSource('42');
    expect(errors[0]!.message).toContain('Unexpected token');
  });

  it('continues parsing after error (error recovery)', () => {
    // Top-level unexpected token, then a valid function
    const source = '42\nfunction foo()\nend';
    const { program, errors } = parseSource(source);
    expect(errors.length).toBeGreaterThan(0);
    // Should still parse the function
    const fns = program.declarations.filter(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration[];
    expect(fns).toHaveLength(1);
    expect(fns[0]!.name).toBe('foo');
  });
});

// ─── AST source locations ─────────────────────────────────────────────────────

describe('parse() — source locations', () => {
  it('Program node has a location', () => {
    const { program } = parseSource('');
    expect(program.location).toBeDefined();
  });

  it('FunctionDeclaration has correct location', () => {
    const fn = firstFn('function foo()\nend');
    expect(fn.location.line).toBe(1);
  });

  it('VariableAssignment has a location', () => {
    const stmt = firstStmt('function f()\nx = 1\nend');
    expect(stmt.location).toBeDefined();
  });
});

// ─── Complete program ─────────────────────────────────────────────────────────

describe('parse() — complete program with all constructs', () => {
  const source = [
    'function add(a, b)',
    'return a + b',
    'end',
    '',
    'function main()',
    'x = 10',
    'y = 20',
    'result = add(x, y)',
    'if result > 25',
    'print("big")',
    'else if result > 15',
    'print("medium")',
    'else',
    'print("small")',
    'end',
    'i = 0',
    'while i < 3',
    'i = i + 1',
    'end',
    'return result',
    'end',
  ].join('\n');

  it('parses without errors', () => {
    const { errors } = parseSource(source);
    expect(errors).toHaveLength(0);
  });

  it('parses two functions', () => {
    const { program } = parseSource(source);
    expect(program.declarations.filter(d => d.kind === 'FunctionDeclaration')).toHaveLength(2);
  });

  it('add function has 2 parameters and a return statement', () => {
    const { program } = parseSource(source);
    const fns = program.declarations.filter(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration[];
    const addFn = fns[0]!;
    expect(addFn.name).toBe('add');
    expect(addFn.parameters).toHaveLength(2);
    expect(addFn.body[0]!.kind).toBe('ReturnStatement');
  });

  it('main function has all constructs', () => {
    const { program } = parseSource(source);
    const fns = program.declarations.filter(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration[];
    const mainFn = fns[1]!;
    expect(mainFn.name).toBe('main');
    // 3 assignments + if + while + return = 6 top-level statements
    const kinds = mainFn.body.map(s => s.kind);
    expect(kinds).toContain('VariableAssignment');
    expect(kinds).toContain('IfStatement');
    expect(kinds).toContain('WhileStatement');
    expect(kinds).toContain('ReturnStatement');
  });
});



