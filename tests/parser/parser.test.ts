import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import type {
  Program,
  Statement,
  FunctionDeclaration,
  StructDeclaration,
  EnumDeclaration,
  ImplDeclaration,
  ConstDeclaration,
  VariableAssignment,
  IndexAssignment,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  BreakStatement,
  ContinueStatement,
  MatchStatement,
  BinaryExpression,
  UnaryExpression,
  Literal,
  IdentifierExpr,
  FunctionCall,
  GroupedExpression,
  IndexExpression,
  RangeExpression,
  ClosureExpression,
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

  it('parses annotated assignment: x: int = 5', () => {
    const stmt = firstStmt('function f()\nx: int = 5\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('x');
    expect(stmt.typeAnnotation).toBe('int');
    const lit = stmt.expression as Literal;
    expect(lit.kind).toBe('Literal');
    expect(lit.value).toBe(5);
  });

  it('parses annotated assignment: items: array<int> = []', () => {
    const stmt = firstStmt('function f()\nitems: array<int> = []\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('items');
    expect(stmt.typeAnnotation).toBe('array<int>');
    expect(stmt.expression.kind).toBe('ArrayLiteral');
  });

  it('parses unannotated assignment still works (no typeAnnotation)', () => {
    const stmt = firstStmt('function f()\nx = 5\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('x');
    expect(stmt.typeAnnotation).toBeUndefined();
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

  it('parses bare return (no expression)', () => {
    const stmt = firstStmt('function f()\nreturn\nend') as ReturnStatement;
    expect(stmt.kind).toBe('ReturnStatement');
    expect(stmt.expression).toBeNull();
  });

  it('parses bare return inside if branch', () => {
    const src = 'function check(x)\nif x < 0\nreturn\nend\nend';
    const { errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fn = firstFn(src);
    const ifStmt = fn.body[0] as IfStatement;
    expect(ifStmt.kind).toBe('IfStatement');
    const ret = ifStmt.thenBranch[0] as ReturnStatement;
    expect(ret.kind).toBe('ReturnStatement');
    expect(ret.expression).toBeNull();
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

// S01: Compound assignment operators
describe('parse() — compound assignment operators (S01)', () => {
  it('x += 1 parses as VariableAssignment with desugared BinaryExpression', () => {
    const stmt = firstStmt('function f()\nx += 1\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('x');
    const bin = stmt.expression as BinaryExpression;
    expect(bin.kind).toBe('BinaryExpression');
    expect(bin.operator).toBe('+');
    const left = bin.left as IdentifierExpr;
    expect(left.kind).toBe('Identifier');
    expect(left.name).toBe('x');
    const right = bin.right as Literal;
    expect(right.kind).toBe('Literal');
    expect(right.value).toBe(1);
  });

  it('x -= 5 parses as VariableAssignment with desugared BinaryExpression', () => {
    const stmt = firstStmt('function f()\nx -= 5\nend') as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.identifier).toBe('x');
    const bin = stmt.expression as BinaryExpression;
    expect(bin.kind).toBe('BinaryExpression');
    expect(bin.operator).toBe('-');
    const left = bin.left as IdentifierExpr;
    expect(left.kind).toBe('Identifier');
    expect(left.name).toBe('x');
    const right = bin.right as Literal;
    expect(right.kind).toBe('Literal');
    expect(right.value).toBe(5);
  });

  it('compound assignment produces no parse errors', () => {
    const { errors } = parseSource('function f()\nx += 1\nx -= 5\nend');
    expect(errors).toHaveLength(0);
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





// ─── Range expressions ────────────────────────────────────────────────────────

describe('parse() — range expressions', () => {
  it('parses exclusive range 1..10', () => {
    const src = 'function f()\nreturn 1..10\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const range = ret.expression as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(false);
    expect((range.start as Literal).value).toBe(1);
    expect((range.end as Literal).value).toBe(10);
  });

  it('parses inclusive range 1..=10', () => {
    const src = 'function f()\nreturn 1..=10\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const range = ret.expression as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(true);
    expect((range.start as Literal).value).toBe(1);
    expect((range.end as Literal).value).toBe(10);
  });

  it('parses variable range x..y', () => {
    const src = 'function f()\nreturn x..y\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const range = ret.expression as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(false);
    expect((range.start as IdentifierExpr).name).toBe('x');
    expect((range.end as IdentifierExpr).name).toBe('y');
  });

  it('parses range with no parse errors', () => {
    const { errors } = parseSource('function f()\nreturn 0..10\nend');
    expect(errors).toHaveLength(0);
  });
});

// ─── For loop variations ──────────────────────────────────────────────────────

describe('parse() — for statement', () => {
  it('parses for x in collection', () => {
    const src = 'function f()\nfor x in collection\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    expect(stmt.kind).toBe('ForStatement');
    expect(stmt.variable).toBe('x');
    expect((stmt.iterable as IdentifierExpr).name).toBe('collection');
    expect(stmt.body).toHaveLength(0);
  });

  it('parses for i in 0..10 (exclusive range)', () => {
    const src = 'function f()\nfor i in 0..10\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    expect(stmt.kind).toBe('ForStatement');
    expect(stmt.variable).toBe('i');
    const range = stmt.iterable as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(false);
    expect((range.start as Literal).value).toBe(0);
    expect((range.end as Literal).value).toBe(10);
  });

  it('parses for i in 0..=10 (inclusive range)', () => {
    const src = 'function f()\nfor i in 0..=10\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    const range = stmt.iterable as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(true);
    expect((range.start as Literal).value).toBe(0);
    expect((range.end as Literal).value).toBe(10);
  });

  it('parses for loop with body statements', () => {
    const src = 'function f()\nfor i in items\nprint(i)\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    expect(stmt.body).toHaveLength(1);
    expect(stmt.body[0]!.kind).toBe('ExpressionStatement');
  });

  it('parses for loop with no errors', () => {
    const { errors } = parseSource('function f()\nfor i in 0..5\nx = i\nend\nend');
    expect(errors).toHaveLength(0);
  });

  it('parses for (k, v) in map with destructuring', () => {
    const src = 'function f()\nfor (k, v) in counts\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    expect(stmt.kind).toBe('ForStatement');
    expect(stmt.destructure).toBeDefined();
    expect(stmt.destructure!.key).toBe('k');
    expect(stmt.destructure!.value).toBe('v');
    expect((stmt.iterable as IdentifierExpr).name).toBe('counts');
    expect(stmt.body).toHaveLength(0);
  });

  it('for (k, v) destructuring has no parse errors', () => {
    const { errors } = parseSource('function f()\nfor (k, v) in counts\nend\nend');
    expect(errors).toHaveLength(0);
  });

  it('for x in items still works after destructuring support (regression)', () => {
    const src = 'function f()\nfor x in items\nend\nend';
    const stmt = firstStmt(src) as ForStatement;
    expect(stmt.kind).toBe('ForStatement');
    expect(stmt.variable).toBe('x');
    expect(stmt.destructure).toBeUndefined();
    expect((stmt.iterable as IdentifierExpr).name).toBe('items');
  });
});

// ─── Match statement patterns ─────────────────────────────────────────────────

describe('parse() — match statement patterns', () => {
  it('parses match with numeric literal pattern', () => {
    const src = 'function f()\nmatch x\n42 => return 1\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.kind).toBe('MatchStatement');
    expect(stmt.arms).toHaveLength(1);
    expect(stmt.arms[0]!.pattern.kind).toBe('LiteralPattern');
    expect(stmt.arms[0]!.body[0]!.kind).toBe('ReturnStatement');
  });

  it('parses match with string literal pattern', () => {
    const src = 'function f()\nmatch x\n"foo" => return 1\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.arms).toHaveLength(1);
    expect(stmt.arms[0]!.pattern.kind).toBe('LiteralPattern');
  });

  it('parses match with true and false patterns', () => {
    const src = 'function f()\nmatch flag\ntrue => return 1\nfalse => return 0\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.arms).toHaveLength(2);
    expect(stmt.arms[0]!.pattern.kind).toBe('LiteralPattern');
    expect(stmt.arms[1]!.pattern.kind).toBe('LiteralPattern');
  });

  it('parses match with wildcard pattern _', () => {
    const src = 'function f()\nmatch x\n_ => return 0\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.arms).toHaveLength(1);
    expect(stmt.arms[0]!.pattern.kind).toBe('WildcardPattern');
  });

  it('parses match with identifier pattern', () => {
    const src = 'function f()\nmatch x\nval => return val\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.arms).toHaveLength(1);
    const pattern = stmt.arms[0]!.pattern;
    expect(pattern.kind).toBe('IdentifierPattern');
    if (pattern.kind === 'IdentifierPattern') {
      expect(pattern.name).toBe('val');
    }
  });

  it('parses match with multiple arms including wildcard', () => {
    const src = [
      'function f()',
      'match x',
      '42 => return 1',
      '_ => return 0',
      'end',
      'end',
    ].join('\n');
    const stmt = firstStmt(src) as MatchStatement;
    expect(stmt.arms).toHaveLength(2);
    expect(stmt.arms[0]!.pattern.kind).toBe('LiteralPattern');
    expect(stmt.arms[1]!.pattern.kind).toBe('WildcardPattern');
  });

  it('parses match expression identifier correctly', () => {
    const src = 'function f()\nmatch score\n100 => return 1\nend\nend';
    const stmt = firstStmt(src) as MatchStatement;
    expect((stmt.expression as IdentifierExpr).name).toBe('score');
  });

  it('parses match with no errors', () => {
    const { errors } = parseSource('function f()\nmatch x\n1 => return 1\n_ => return 0\nend\nend');
    expect(errors).toHaveLength(0);
  });
});

// ─── Closure expressions ──────────────────────────────────────────────────────

describe('parse() — closure expressions', () => {
  it('parses empty-param closure || expr', () => {
    const src = 'function f()\ncb = || x + 1\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    const closure = stmt.expression as ClosureExpression;
    expect(closure.kind).toBe('ClosureExpression');
    expect(closure.parameters).toHaveLength(0);
    expect(Array.isArray(closure.body)).toBe(false); // single-expression body
  });

  it('parses single-param closure |x| expr', () => {
    const src = 'function f()\ncb = |x| x + 1\nend';
    const closure = (firstStmt(src) as VariableAssignment).expression as ClosureExpression;
    expect(closure.kind).toBe('ClosureExpression');
    expect(closure.parameters).toHaveLength(1);
    expect(closure.parameters[0]!.name).toBe('x');
    expect(Array.isArray(closure.body)).toBe(false);
  });

  it('parses multi-param closure |x, y| expr', () => {
    const src = 'function f()\ncb = |x, y| x + y\nend';
    const closure = (firstStmt(src) as VariableAssignment).expression as ClosureExpression;
    expect(closure.kind).toBe('ClosureExpression');
    expect(closure.parameters).toHaveLength(2);
    expect(closure.parameters[0]!.name).toBe('x');
    expect(closure.parameters[1]!.name).toBe('y');
  });

  it('parses multi-statement closure |x| { stmts }', () => {
    const src = 'function f()\ncb = |x| { y = x + 1\nreturn y }\nend';
    const closure = (firstStmt(src) as VariableAssignment).expression as ClosureExpression;
    expect(closure.kind).toBe('ClosureExpression');
    expect(closure.parameters).toHaveLength(1);
    expect(Array.isArray(closure.body)).toBe(true);
    expect((closure.body as Statement[]).length).toBeGreaterThan(0);
  });

  it('parses closure with no errors', () => {
    const { errors } = parseSource('function f()\ncb = |x| x + 1\nend');
    expect(errors).toHaveLength(0);
  });
});

// ─── Index compound assignment ────────────────────────────────────────────────

describe('parse() — index compound assignment', () => {
  it('arr[i] = 42 parses as simple IndexAssignment', () => {
    const src = 'function f()\narr[i] = 42\nend';
    const stmt = firstStmt(src) as IndexAssignment;
    expect(stmt.kind).toBe('IndexAssignment');
    expect((stmt.value as Literal).value).toBe(42);
  });

  it('arr[i] += 1 parses as IndexAssignment with desugared BinaryExpression (+)', () => {
    const src = 'function f()\narr[i] += 1\nend';
    const stmt = firstStmt(src) as IndexAssignment;
    expect(stmt.kind).toBe('IndexAssignment');
    const value = stmt.value as BinaryExpression;
    expect(value.kind).toBe('BinaryExpression');
    expect(value.operator).toBe('+');
    expect((value.right as Literal).value).toBe(1);
  });

  it('arr[i] -= 2 parses as IndexAssignment with desugared BinaryExpression (-)', () => {
    const src = 'function f()\narr[i] -= 2\nend';
    const stmt = firstStmt(src) as IndexAssignment;
    expect(stmt.kind).toBe('IndexAssignment');
    const value = stmt.value as BinaryExpression;
    expect(value.operator).toBe('-');
    expect((value.right as Literal).value).toBe(2);
  });

  it('arr[i] *= 3 parses as IndexAssignment with desugared BinaryExpression (*)', () => {
    const src = 'function f()\narr[i] *= 3\nend';
    const stmt = firstStmt(src) as IndexAssignment;
    expect(stmt.kind).toBe('IndexAssignment');
    const value = stmt.value as BinaryExpression;
    expect(value.operator).toBe('*');
    expect((value.right as Literal).value).toBe(3);
  });

  it('index compound assignments produce no parse errors', () => {
    const { errors } = parseSource('function f()\narr[0] += 1\narr[1] -= 2\nend');
    expect(errors).toHaveLength(0);
  });
});

// ─── Struct declarations ──────────────────────────────────────────────────────

describe('parse() — struct declarations', () => {
  it('parses basic struct with fields', () => {
    const src = 'struct Point\nx: int\ny: int\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const structs = program.declarations.filter(d => d.kind === 'StructDeclaration') as StructDeclaration[];
    expect(structs).toHaveLength(1);
    const s = structs[0]!;
    expect(s.kind).toBe('StructDeclaration');
    expect(s.name).toBe('Point');
    expect(s.fields).toHaveLength(2);
    expect(s.fields[0]!.name).toBe('x');
    expect(s.fields[0]!.typeAnnotation).toBe('int');
    expect(s.fields[1]!.name).toBe('y');
    expect(s.fields[1]!.typeAnnotation).toBe('int');
  });

  it('parses empty struct body', () => {
    const src = 'struct Empty\nend';
    const { program } = parseSource(src);
    const s = program.declarations.find(d => d.kind === 'StructDeclaration') as StructDeclaration;
    expect(s.name).toBe('Empty');
    expect(s.fields).toHaveLength(0);
  });

  it('struct has a location', () => {
    const src = 'struct Foo\nend';
    const { program } = parseSource(src);
    const s = program.declarations.find(d => d.kind === 'StructDeclaration') as StructDeclaration;
    expect(s.location).toBeDefined();
    expect(s.location.line).toBe(1);
  });
});

// ─── Enum declarations ────────────────────────────────────────────────────────

describe('parse() — enum declarations', () => {
  it('parses enum with multiple variants', () => {
    const src = 'enum Color\nRed\nGreen\nBlue\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const enums = program.declarations.filter(d => d.kind === 'EnumDeclaration') as EnumDeclaration[];
    expect(enums).toHaveLength(1);
    const e = enums[0]!;
    expect(e.kind).toBe('EnumDeclaration');
    expect(e.name).toBe('Color');
    expect(e.variants).toHaveLength(3);
    expect(e.variants[0]!.name).toBe('Red');
    expect(e.variants[1]!.name).toBe('Green');
    expect(e.variants[2]!.name).toBe('Blue');
  });

  it('parses single-variant enum', () => {
    const src = 'enum Status\nActive\nend';
    const { program } = parseSource(src);
    const e = program.declarations.find(d => d.kind === 'EnumDeclaration') as EnumDeclaration;
    expect(e.variants).toHaveLength(1);
    expect(e.variants[0]!.name).toBe('Active');
  });

  it('enum has a location', () => {
    const src = 'enum Dir\nUp\nend';
    const { program } = parseSource(src);
    const e = program.declarations.find(d => d.kind === 'EnumDeclaration') as EnumDeclaration;
    expect(e.location).toBeDefined();
  });

  it('parses data-carrying enum variant with one type', () => {
    const src = 'enum Shape\nCircle(float)\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const e = program.declarations.find(d => d.kind === 'EnumDeclaration') as EnumDeclaration;
    expect(e.variants).toHaveLength(1);
    expect(e.variants[0]!.name).toBe('Circle');
    expect(e.variants[0]!.data).toEqual(['float']);
  });

  it('parses data-carrying enum variant with two types', () => {
    const src = 'enum Shape\nRectangle(float, float)\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const e = program.declarations.find(d => d.kind === 'EnumDeclaration') as EnumDeclaration;
    expect(e.variants[0]!.name).toBe('Rectangle');
    expect(e.variants[0]!.data).toEqual(['float', 'float']);
  });

  it('parses mixed enum with data-carrying and plain variants', () => {
    const src = 'enum Shape\nCircle(float)\nRectangle(float, float)\nNone\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const e = program.declarations.find(d => d.kind === 'EnumDeclaration') as EnumDeclaration;
    expect(e.variants).toHaveLength(3);
    expect(e.variants[0]!.data).toEqual(['float']);
    expect(e.variants[1]!.data).toEqual(['float', 'float']);
    expect(e.variants[2]!.data).toBeUndefined();
  });
});

// ─── Data-carrying enum match patterns ───────────────────────────────────────

describe('parse() — data-carrying enum match patterns', () => {
  it('parses qualified enum pattern with one binding: Shape.Circle(r) =>', () => {
    const src = [
      'enum Shape',
      'Circle(float)',
      'end',
      'function f()',
      'match x',
      'Shape.Circle(r) =>',
      'print(r)',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fns = program.declarations.filter(d => d.kind === 'FunctionDeclaration');
    const fn = fns[0] as FunctionDeclaration;
    const stmt = fn.body[0] as MatchStatement;
    expect(stmt.kind).toBe('MatchStatement');
    const pattern = stmt.arms[0]!.pattern;
    expect(pattern.kind).toBe('EnumPattern');
    if (pattern.kind === 'EnumPattern') {
      expect(pattern.enumName).toBe('Shape');
      expect(pattern.variant).toBe('Circle');
      expect(pattern.bindings).toEqual(['r']);
    }
  });

  it('parses qualified enum pattern with two bindings: Shape.Rectangle(w, h) =>', () => {
    const src = [
      'enum Shape',
      'Rectangle(float, float)',
      'end',
      'function f()',
      'match x',
      'Shape.Rectangle(w, h) =>',
      'print(w)',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fn = program.declarations.find(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration;
    const stmt = fn.body[0] as MatchStatement;
    const pattern = stmt.arms[0]!.pattern;
    expect(pattern.kind).toBe('EnumPattern');
    if (pattern.kind === 'EnumPattern') {
      expect(pattern.bindings).toEqual(['w', 'h']);
    }
  });

  it('parses unqualified enum pattern with one binding: Circle(r) =>', () => {
    const src = [
      'function f()',
      'match x',
      'Circle(r) =>',
      'print(r)',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fn = program.declarations.find(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration;
    const stmt = fn.body[0] as MatchStatement;
    const pattern = stmt.arms[0]!.pattern;
    expect(pattern.kind).toBe('EnumPattern');
    if (pattern.kind === 'EnumPattern') {
      expect(pattern.enumName).toBe('');
      expect(pattern.variant).toBe('Circle');
      expect(pattern.bindings).toEqual(['r']);
    }
  });

  it('parses unqualified enum pattern with two bindings: Rectangle(w, h) =>', () => {
    const src = [
      'function f()',
      'match x',
      'Rectangle(w, h) =>',
      'print(w)',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fn = program.declarations.find(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration;
    const stmt = fn.body[0] as MatchStatement;
    const pattern = stmt.arms[0]!.pattern;
    expect(pattern.kind).toBe('EnumPattern');
    if (pattern.kind === 'EnumPattern') {
      expect(pattern.bindings).toEqual(['w', 'h']);
    }
  });

  it('parses match with data-carrying and plain arms', () => {
    const src = [
      'enum Shape',
      'Circle(float)',
      'None',
      'end',
      'function f()',
      'match x',
      'Shape.Circle(r) =>',
      'print(r)',
      'Shape.None =>',
      'print("none")',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const fn = program.declarations.find(d => d.kind === 'FunctionDeclaration') as FunctionDeclaration;
    const stmt = fn.body[0] as MatchStatement;
    expect(stmt.arms).toHaveLength(2);
    const arm0 = stmt.arms[0]!.pattern;
    const arm1 = stmt.arms[1]!.pattern;
    expect(arm0.kind).toBe('EnumPattern');
    expect(arm1.kind).toBe('EnumPattern');
    if (arm0.kind === 'EnumPattern') expect(arm0.bindings).toEqual(['r']);
    if (arm1.kind === 'EnumPattern') expect(arm1.bindings).toBeUndefined();
  });
});

// ─── Impl declarations ────────────────────────────────────────────────────────

describe('parse() — impl declarations', () => {
  it('parses impl block with one method', () => {
    const src = 'impl Point\nfunction area()\nreturn 0\nend\nend';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const impls = program.declarations.filter(d => d.kind === 'ImplDeclaration') as ImplDeclaration[];
    expect(impls).toHaveLength(1);
    const impl = impls[0]!;
    expect(impl.kind).toBe('ImplDeclaration');
    expect(impl.structName).toBe('Point');
    expect(impl.methods).toHaveLength(1);
    expect(impl.methods[0]!.name).toBe('area');
  });

  it('parses impl block with multiple methods', () => {
    const src = [
      'impl Rectangle',
      'function area()',
      'return 0',
      'end',
      'function perimeter()',
      'return 0',
      'end',
      'end',
    ].join('\n');
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const impl = program.declarations.find(d => d.kind === 'ImplDeclaration') as ImplDeclaration;
    expect(impl.methods).toHaveLength(2);
    expect(impl.methods[0]!.name).toBe('area');
    expect(impl.methods[1]!.name).toBe('perimeter');
  });

  it('parses empty impl block', () => {
    const src = 'impl Foo\nend';
    const { program } = parseSource(src);
    const impl = program.declarations.find(d => d.kind === 'ImplDeclaration') as ImplDeclaration;
    expect(impl.structName).toBe('Foo');
    expect(impl.methods).toHaveLength(0);
  });
});

// ─── Const declarations ───────────────────────────────────────────────────────

describe('parse() — const declarations', () => {
  it('parses top-level const with integer value', () => {
    const src = 'const MAX = 42';
    const { program, errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const consts = program.declarations.filter(d => d.kind === 'ConstDeclaration') as ConstDeclaration[];
    expect(consts).toHaveLength(1);
    const c = consts[0]!;
    expect(c.kind).toBe('ConstDeclaration');
    expect(c.name).toBe('MAX');
    const val = c.value as Literal;
    expect(val.value).toBe(42);
    expect(val.literalType).toBe('int');
  });

  it('parses top-level const with string value', () => {
    const src = 'const NAME = "hello"';
    const { program } = parseSource(src);
    const c = program.declarations.find(d => d.kind === 'ConstDeclaration') as ConstDeclaration;
    expect(c.name).toBe('NAME');
    const val = c.value as Literal;
    expect(val.value).toBe('hello');
    expect(val.literalType).toBe('string');
  });

  it('parses local const inside function body (isConst = true)', () => {
    const src = 'function f()\nconst x = 10\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    expect(stmt.isConst).toBe(true);
    expect(stmt.identifier).toBe('x');
    expect((stmt.expression as Literal).value).toBe(10);
  });

  it('multiple top-level consts parse without errors', () => {
    const { errors } = parseSource('const A = 1\nconst B = 2');
    expect(errors).toHaveLength(0);
  });
});

// ─── Break and Continue statements ───────────────────────────────────────────

describe('parse() — break and continue statements', () => {
  it('parses break inside while loop', () => {
    const src = 'function f()\nwhile true\nbreak\nend\nend';
    const whileStmt = firstStmt(src) as WhileStatement;
    expect(whileStmt.kind).toBe('WhileStatement');
    const brk = whileStmt.body[0] as BreakStatement;
    expect(brk.kind).toBe('BreakStatement');
  });

  it('parses continue inside while loop', () => {
    const src = 'function f()\nwhile true\ncontinue\nend\nend';
    const whileStmt = firstStmt(src) as WhileStatement;
    const cont = whileStmt.body[0] as ContinueStatement;
    expect(cont.kind).toBe('ContinueStatement');
  });

  it('parses continue inside for loop', () => {
    const src = 'function f()\nfor i in items\ncontinue\nend\nend';
    const forStmt = firstStmt(src) as ForStatement;
    expect(forStmt.kind).toBe('ForStatement');
    const cont = forStmt.body[0] as ContinueStatement;
    expect(cont.kind).toBe('ContinueStatement');
  });

  it('parses break inside for loop', () => {
    const src = 'function f()\nfor i in items\nbreak\nend\nend';
    const forStmt = firstStmt(src) as ForStatement;
    const brk = forStmt.body[0] as BreakStatement;
    expect(brk.kind).toBe('BreakStatement');
  });

  it('break has a defined location', () => {
    const src = 'function f()\nwhile true\nbreak\nend\nend';
    const whileStmt = firstStmt(src) as WhileStatement;
    const brk = whileStmt.body[0] as BreakStatement;
    expect(brk.location).toBeDefined();
  });

  it('break and continue produce no parse errors', () => {
    const src = 'function f()\nwhile true\nbreak\nend\nfor i in x\ncontinue\nend\nend';
    const { errors } = parseSource(src);
    expect(errors).toHaveLength(0);
  });
});

// ─── Array slicing (S-15) ────────────────────────────────────────────────────

describe('parse() — array slicing', () => {
  it('parses items[1..3] as IndexExpression with RangeExpression index (exclusive)', () => {
    const src = 'function f()\nreturn items[1..3]\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const idx = ret.expression as IndexExpression;
    expect(idx.kind).toBe('IndexExpression');
    const range = idx.index as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(false);
    expect((range.start as Literal).value).toBe(1);
    expect((range.end as Literal).value).toBe(3);
  });

  it('parses items[1..=3] as IndexExpression with inclusive RangeExpression index', () => {
    const src = 'function f()\nreturn items[1..=3]\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const idx = ret.expression as IndexExpression;
    expect(idx.kind).toBe('IndexExpression');
    const range = idx.index as RangeExpression;
    expect(range.kind).toBe('RangeExpression');
    expect(range.inclusive).toBe(true);
    expect((range.start as Literal).value).toBe(1);
    expect((range.end as Literal).value).toBe(3);
  });

  it('array slice parse produces no parse errors', () => {
    const { errors } = parseSource('function f()\nx = items[1..3]\nend');
    expect(errors).toHaveLength(0);
  });
});

// ─── Default parameter values (S-14) ────────────────────────────────────────

describe('parse() — default parameter values', () => {
  it('parses function with single default string param', () => {
    const fn = firstFn('function greet(name = "World")\nend');
    expect(fn.parameters).toHaveLength(1);
    expect(fn.parameters[0]!.name).toBe('name');
    expect(fn.parameters[0]!.defaultValue).toBeDefined();
    expect((fn.parameters[0]!.defaultValue as Literal).literalType).toBe('string');
    expect((fn.parameters[0]!.defaultValue as Literal).value).toBe('World');
  });

  it('parses function with mixed required and default params', () => {
    const fn = firstFn('function add(a, b = 0)\nend');
    expect(fn.parameters).toHaveLength(2);
    expect(fn.parameters[0]!.defaultValue).toBeUndefined();
    expect(fn.parameters[1]!.name).toBe('b');
    expect(fn.parameters[1]!.defaultValue).toBeDefined();
    expect((fn.parameters[1]!.defaultValue as Literal).value).toBe(0);
  });

  it('parses function with default bool param', () => {
    const fn = firstFn('function foo(flag = true)\nend');
    expect(fn.parameters[0]!.defaultValue).toBeDefined();
    expect((fn.parameters[0]!.defaultValue as Literal).literalType).toBe('bool');
    expect((fn.parameters[0]!.defaultValue as Literal).value).toBe(true);
  });

  it('produces no parse errors for default param functions', () => {
    const { errors } = parseSource('function greet(name = "World")\nend');
    expect(errors).toHaveLength(0);
  });

  it('default param coexists with type annotation', () => {
    const fn = firstFn('function foo(x: int = 5)\nend');
    expect(fn.parameters[0]!.typeAnnotation).toBe('int');
    expect(fn.parameters[0]!.defaultValue).toBeDefined();
    expect((fn.parameters[0]!.defaultValue as Literal).value).toBe(5);
  });
});

// ─── If expressions (S-13) ──────────────────────────────────────────────────

describe('parse() — if expressions', () => {
  it('parses x = if cond then a else b as IfExpression assignment', () => {
    const src = 'function f()\nx = if count > 0 then count else 0\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    expect(stmt.kind).toBe('VariableAssignment');
    const ifExpr = stmt.expression as { kind: string };
    expect(ifExpr.kind).toBe('IfExpression');
  });

  it('IfExpression condition is parsed correctly', () => {
    const src = 'function f()\nx = if count > 0 then count else 0\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    const ifExpr = stmt.expression as { kind: string; condition: BinaryExpression };
    expect(ifExpr.condition.kind).toBe('BinaryExpression');
    expect(ifExpr.condition.operator).toBe('>');
  });

  it('IfExpression thenBranch is an Identifier', () => {
    const src = 'function f()\nx = if count > 0 then count else 0\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    const ifExpr = stmt.expression as { kind: string; thenBranch: IdentifierExpr };
    expect(ifExpr.thenBranch.kind).toBe('Identifier');
    expect(ifExpr.thenBranch.name).toBe('count');
  });

  it('IfExpression elseBranch is a Literal', () => {
    const src = 'function f()\nx = if count > 0 then count else 0\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    const ifExpr = stmt.expression as { kind: string; elseBranch: Literal };
    expect(ifExpr.elseBranch.kind).toBe('Literal');
    expect(ifExpr.elseBranch.value).toBe(0);
  });

  it('if expression parse produces no parse errors', () => {
    const { errors } = parseSource('function f()\nx = if a > 0 then a else 0\nend');
    expect(errors).toHaveLength(0);
  });

  it('if expression works inside function arguments', () => {
    const src = 'function f()\nfoo(if x > 0 then x else 0)\nend';
    const { errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const stmt = firstStmt(src) as ExpressionStatement;
    const call = stmt.expression as FunctionCall;
    expect(call.kind).toBe('FunctionCall');
    const ifExpr = call.arguments[0] as { kind: string };
    expect(ifExpr.kind).toBe('IfExpression');
  });
});


// ─── Tuple literals (S-17) ──────────────────────────────────────────────────

describe('parse() — tuple literals (S-17)', () => {
  it('parses (1, "hello", true) as TupleLiteral with 3 elements', () => {
    const src = 'function f()\nt = (1, "hello", true)\nend';
    const { errors } = parseSource(src);
    expect(errors).toHaveLength(0);
    const stmt = firstStmt(src) as VariableAssignment;
    const tuple = stmt.expression as { kind: string; elements: unknown[] };
    expect(tuple.kind).toBe('TupleLiteral');
    expect(tuple.elements).toHaveLength(3);
  });

  it('parses (a, b) as TupleLiteral with 2 elements', () => {
    const src = 'function f()\nt = (a, b)\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    const tuple = stmt.expression as { kind: string; elements: IdentifierExpr[] };
    expect(tuple.kind).toBe('TupleLiteral');
    expect(tuple.elements).toHaveLength(2);
    expect(tuple.elements[0]!.name).toBe('a');
    expect(tuple.elements[1]!.name).toBe('b');
  });

  it('(x) still parses as GroupedExpression (not a tuple)', () => {
    const src = 'function f()\nreturn (a + b) * c\nend';
    const ret = firstStmt(src) as ReturnStatement;
    const outer = ret.expression as BinaryExpression;
    expect(outer.operator).toBe('*');
    const grouped = outer.left as GroupedExpression;
    expect(grouped.kind).toBe('GroupedExpression');
  });

  it('tuple literal with 3 elements contains correct literals', () => {
    const src = 'function f()\nt = (1, "hello", true)\nend';
    const stmt = firstStmt(src) as VariableAssignment;
    const tuple = stmt.expression as { kind: string; elements: Literal[] };
    expect((tuple.elements[0] as Literal).value).toBe(1);
    expect((tuple.elements[1] as Literal).value).toBe('hello');
    expect((tuple.elements[2] as Literal).value).toBe(true);
  });

  it('tuple parse produces no errors', () => {
    const { errors } = parseSource('function f()\nt = (1, 2, 3)\nend');
    expect(errors).toHaveLength(0);
  });
});
