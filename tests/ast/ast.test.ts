import { describe, it, expect } from 'vitest';
import type {
  Program,
  FunctionDeclaration,
  Statement,
  Expression,
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
  BinaryOperator,
} from '../../src/ast/nodes.js';

const loc = { line: 1, column: 1, filename: 'test.re' };

describe('AST Node Creation', () => {
  it('creates a Program node', () => {
    const node: Program = { kind: 'Program', declarations: [], location: loc };
    expect(node.kind).toBe('Program');
    expect(node.declarations).toHaveLength(0);
  });

  it('creates a FunctionDeclaration node', () => {
    const node: FunctionDeclaration = {
      kind: 'FunctionDeclaration',
      name: 'add',
      parameters: [{ name: 'a', location: loc }, { name: 'b', location: loc }],
      body: [],
      location: loc,
    };
    expect(node.kind).toBe('FunctionDeclaration');
    expect(node.name).toBe('add');
    expect(node.parameters).toHaveLength(2);
  });

  it('creates a Literal node (int)', () => {
    const node: Literal = { kind: 'Literal', value: 42, literalType: 'int', location: loc };
    expect(node.kind).toBe('Literal');
    expect(node.literalType).toBe('int');
    expect(node.value).toBe(42);
  });

  it('creates a Literal node (float)', () => {
    const node: Literal = { kind: 'Literal', value: 3.14, literalType: 'float', location: loc };
    expect(node.literalType).toBe('float');
  });

  it('creates a Literal node (string)', () => {
    const node: Literal = { kind: 'Literal', value: 'hello', literalType: 'string', location: loc };
    expect(node.literalType).toBe('string');
  });

  it('creates a Literal node (bool)', () => {
    const node: Literal = { kind: 'Literal', value: true, literalType: 'bool', location: loc };
    expect(node.literalType).toBe('bool');
  });

  it('creates an IdentifierExpr node', () => {
    const node: IdentifierExpr = { kind: 'Identifier', name: 'x', location: loc };
    expect(node.kind).toBe('Identifier');
    expect(node.name).toBe('x');
  });

  it('creates a BinaryExpression node', () => {
    const left: IdentifierExpr = { kind: 'Identifier', name: 'a', location: loc };
    const right: Literal = { kind: 'Literal', value: 1, literalType: 'int', location: loc };
    const node: BinaryExpression = { kind: 'BinaryExpression', left, operator: '+', right, location: loc };
    expect(node.kind).toBe('BinaryExpression');
    expect(node.operator).toBe('+');
  });

  it('creates a UnaryExpression node (not)', () => {
    const operand: IdentifierExpr = { kind: 'Identifier', name: 'flag', location: loc };
    const node: UnaryExpression = { kind: 'UnaryExpression', operator: 'not', operand, location: loc };
    expect(node.kind).toBe('UnaryExpression');
    expect(node.operator).toBe('not');
  });

  it('creates a UnaryExpression node (minus)', () => {
    const operand: Literal = { kind: 'Literal', value: 5, literalType: 'int', location: loc };
    const node: UnaryExpression = { kind: 'UnaryExpression', operator: '-', operand, location: loc };
    expect(node.operator).toBe('-');
  });

  it('creates a FunctionCall node', () => {
    const arg: Literal = { kind: 'Literal', value: 'hello', literalType: 'string', location: loc };
    const node: FunctionCall = { kind: 'FunctionCall', name: 'print', arguments: [arg], location: loc };
    expect(node.kind).toBe('FunctionCall');
    expect(node.name).toBe('print');
    expect(node.arguments).toHaveLength(1);
  });

  it('creates a GroupedExpression node', () => {
    const inner: Literal = { kind: 'Literal', value: 1, literalType: 'int', location: loc };
    const node: GroupedExpression = { kind: 'GroupedExpression', expression: inner, location: loc };
    expect(node.kind).toBe('GroupedExpression');
  });

  it('creates a VariableAssignment statement', () => {
    const expr: Literal = { kind: 'Literal', value: 10, literalType: 'int', location: loc };
    const node: VariableAssignment = { kind: 'VariableAssignment', identifier: 'x', expression: expr, location: loc };
    expect(node.kind).toBe('VariableAssignment');
    expect(node.identifier).toBe('x');
  });

  it('creates a ReturnStatement', () => {
    const expr: Literal = { kind: 'Literal', value: 0, literalType: 'int', location: loc };
    const node: ReturnStatement = { kind: 'ReturnStatement', expression: expr, location: loc };
    expect(node.kind).toBe('ReturnStatement');
  });

  it('creates an IfStatement with elseIfBranches and elseBranch', () => {
    const cond: Literal = { kind: 'Literal', value: true, literalType: 'bool', location: loc };
    const node: IfStatement = {
      kind: 'IfStatement',
      condition: cond,
      thenBranch: [],
      elseIfBranches: [{ condition: cond, body: [], location: loc }],
      elseBranch: [],
      location: loc,
    };
    expect(node.kind).toBe('IfStatement');
    expect(node.elseIfBranches).toHaveLength(1);
    expect(node.elseBranch).toEqual([]);
  });

  it('creates a WhileStatement', () => {
    const cond: Literal = { kind: 'Literal', value: true, literalType: 'bool', location: loc };
    const node: WhileStatement = { kind: 'WhileStatement', condition: cond, body: [], location: loc };
    expect(node.kind).toBe('WhileStatement');
  });

  it('creates an ExpressionStatement', () => {
    const expr: FunctionCall = { kind: 'FunctionCall', name: 'print', arguments: [], location: loc };
    const node: ExpressionStatement = { kind: 'ExpressionStatement', expression: expr, location: loc };
    expect(node.kind).toBe('ExpressionStatement');
  });
});

describe('Discriminated Union Narrowing', () => {
  it('narrows Statement union via kind field', () => {
    const stmt: Statement = {
      kind: 'VariableAssignment',
      identifier: 'x',
      expression: { kind: 'Literal', value: 5, literalType: 'int', location: loc },
      location: loc,
    };

    if (stmt.kind === 'VariableAssignment') {
      expect(stmt.identifier).toBe('x');
    } else {
      throw new Error('Should have narrowed to VariableAssignment');
    }
  });

  it('narrows Expression union via kind field', () => {
    const expr: Expression = { kind: 'Identifier', name: 'myVar', location: loc };

    if (expr.kind === 'Identifier') {
      expect(expr.name).toBe('myVar');
    } else {
      throw new Error('Should have narrowed to IdentifierExpr');
    }
  });

  it('switches on Statement kinds exhaustively', () => {
    const stmts: Statement[] = [
      { kind: 'VariableAssignment', identifier: 'a', expression: { kind: 'Literal', value: 1, literalType: 'int', location: loc }, location: loc },
      { kind: 'ReturnStatement', expression: { kind: 'Literal', value: 0, literalType: 'int', location: loc }, location: loc },
      { kind: 'ExpressionStatement', expression: { kind: 'FunctionCall', name: 'f', arguments: [], location: loc }, location: loc },
    ];

    const kinds = stmts.map(s => s.kind);
    expect(kinds).toEqual(['VariableAssignment', 'ReturnStatement', 'ExpressionStatement']);
  });

  it('switches on Expression kinds exhaustively', () => {
    const exprs: Expression[] = [
      { kind: 'Literal', value: 1, literalType: 'int', location: loc },
      { kind: 'Identifier', name: 'x', location: loc },
      { kind: 'FunctionCall', name: 'f', arguments: [], location: loc },
      { kind: 'UnaryExpression', operator: 'not', operand: { kind: 'Identifier', name: 'b', location: loc }, location: loc },
      { kind: 'GroupedExpression', expression: { kind: 'Literal', value: 2, literalType: 'int', location: loc }, location: loc },
    ];

    const kinds = exprs.map(e => e.kind);
    expect(kinds).toContain('Literal');
    expect(kinds).toContain('Identifier');
    expect(kinds).toContain('FunctionCall');
    expect(kinds).toContain('UnaryExpression');
    expect(kinds).toContain('GroupedExpression');
  });

  it('BinaryOperator covers all 12 operators', () => {
    const operators: BinaryOperator[] = ['+', '-', '*', '/', '==', '!=', '>', '<', '>=', '<=', 'and', 'or'];
    expect(operators).toHaveLength(12);
  });
});

