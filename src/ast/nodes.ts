import type { SourceLocation } from '../errors/errors.js';

// --- Base ---
interface BaseNode {
  kind: string;
  location: SourceLocation;
}

// --- Program (root) ---
export interface Program extends BaseNode {
  kind: 'Program';
  declarations: Declaration[];
}

// --- Declarations ---
export type Declaration =
  | FunctionDeclaration
  | StructDeclaration
  | EnumDeclaration
  | ConstDeclaration
  | ImportDeclaration
  | ImplDeclaration;

export interface StructDeclaration extends BaseNode {
  kind: 'StructDeclaration';
  name: string;
  fields: { name: string; typeAnnotation: string }[];
}

export interface EnumDeclaration extends BaseNode {
  kind: 'EnumDeclaration';
  name: string;
  variants: { name: string; data?: string[] }[];
}

export interface ConstDeclaration extends BaseNode {
  kind: 'ConstDeclaration';
  name: string;
  typeAnnotation?: string;
  value: Expression;
}

export interface ImportDeclaration extends BaseNode {
  kind: 'ImportDeclaration';
  path: string;
  names: string[];
}

export interface ImplDeclaration extends BaseNode {
  kind: 'ImplDeclaration';
  structName: string;
  methods: FunctionDeclaration[];
}

export function getFunctions(program: Program): FunctionDeclaration[] {
  return program.declarations.filter((d): d is FunctionDeclaration => d.kind === 'FunctionDeclaration');
}

// --- Function ---
export interface FunctionDeclaration extends BaseNode {
  kind: 'FunctionDeclaration';
  name: string;
  parameters: Parameter[];
  returnTypeAnnotation?: string;
  body: Statement[];
}

export interface Parameter {
  name: string;
  typeAnnotation?: string;
  defaultValue?: Expression;
  location: SourceLocation;
}

// --- Statements ---
export type Statement =
  | VariableAssignment
  | ReturnStatement
  | IfStatement
  | WhileStatement
  | ExpressionStatement
  | BreakStatement
  | ContinueStatement
  | ForStatement
  | MatchStatement
  | IndexAssignment
  | FieldAssignment;

export interface VariableAssignment extends BaseNode {
  kind: 'VariableAssignment';
  identifier: string;
  typeAnnotation?: string;
  expression: Expression;
  isConst?: boolean;
}

export interface FieldAssignment extends BaseNode {
  kind: 'FieldAssignment';
  object: string;
  field: string;
  value: Expression;
}

export interface IndexAssignment extends BaseNode {
  kind: 'IndexAssignment';
  object: Expression;
  index: Expression;
  value: Expression;
}

export interface ReturnStatement extends BaseNode {
  kind: 'ReturnStatement';
  expression: Expression | null;
}

export interface ElseIfBranch {
  condition: Expression;
  body: Statement[];
  location: SourceLocation;
}

export interface IfStatement extends BaseNode {
  kind: 'IfStatement';
  condition: Expression;
  thenBranch: Statement[];
  elseIfBranches: ElseIfBranch[];
  elseBranch: Statement[] | null;
}

export interface WhileStatement extends BaseNode {
  kind: 'WhileStatement';
  condition: Expression;
  body: Statement[];
}

export interface ExpressionStatement extends BaseNode {
  kind: 'ExpressionStatement';
  expression: Expression;
}

export interface BreakStatement extends BaseNode {
  kind: 'BreakStatement';
}

export interface ContinueStatement extends BaseNode {
  kind: 'ContinueStatement';
}

export interface ForStatement extends BaseNode {
  kind: 'ForStatement';
  variable: string;
  destructure?: { key: string; value: string };
  iterable: Expression;
  body: Statement[];
}

export interface MatchStatement extends BaseNode {
  kind: 'MatchStatement';
  expression: Expression;
  arms: MatchArm[];
}

export interface MatchArm extends BaseNode {
  kind: 'MatchArm';
  pattern: MatchPattern;
  body: Statement[];
}

export type MatchPattern =
  | { kind: 'LiteralPattern'; value: Expression }
  | { kind: 'IdentifierPattern'; name: string }
  | { kind: 'WildcardPattern' }
  | { kind: 'EnumPattern'; enumName: string; variant: string; bindings?: string[] };

// --- Expressions ---
export type Expression =
  | BinaryExpression
  | UnaryExpression
  | Literal
  | IdentifierExpr
  | FunctionCall
  | GroupedExpression
  | ArrayLiteral
  | MapLiteral
  | IndexExpression
  | MethodCall
  | FieldAccess
  | RangeExpression
  | StructLiteral
  | TupleLiteral
  | EnumVariantAccess
  | ClosureExpression
  | SelfExpression
  | NoneLiteral
  | IfExpression
  | TryExpression;

export type BinaryOperator =
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '>' | '<' | '>=' | '<='
  | 'and' | 'or';

export interface BinaryExpression extends BaseNode {
  kind: 'BinaryExpression';
  left: Expression;
  operator: BinaryOperator;
  right: Expression;
}

export interface UnaryExpression extends BaseNode {
  kind: 'UnaryExpression';
  operator: 'not' | '-';
  operand: Expression;
}

export interface Literal extends BaseNode {
  kind: 'Literal';
  value: string | number | boolean;
  literalType: 'int' | 'float' | 'string' | 'bool';
}

export interface IdentifierExpr extends BaseNode {
  kind: 'Identifier';
  name: string;
}

export interface FunctionCall extends BaseNode {
  kind: 'FunctionCall';
  name: string;
  arguments: Expression[];
}

export interface GroupedExpression extends BaseNode {
  kind: 'GroupedExpression';
  expression: Expression;
}

export interface ArrayLiteral extends BaseNode {
  kind: 'ArrayLiteral';
  elements: Expression[];
}

export interface MapLiteral extends BaseNode {
  kind: 'MapLiteral';
  entries: { key: Expression; value: Expression }[];
}

export interface IndexExpression extends BaseNode {
  kind: 'IndexExpression';
  object: Expression;
  index: Expression;
}

export interface MethodCall extends BaseNode {
  kind: 'MethodCall';
  object: Expression;
  method: string;
  arguments: Expression[];
}

export interface FieldAccess extends BaseNode {
  kind: 'FieldAccess';
  object: Expression;
  field: string;
}

export interface RangeExpression extends BaseNode {
  kind: 'RangeExpression';
  start: Expression;
  end: Expression;
  inclusive: boolean;
}

export interface StructLiteral extends BaseNode {
  kind: 'StructLiteral';
  name: string;
  fields: { name: string; value: Expression }[];
}

export interface TupleLiteral extends BaseNode {
  kind: 'TupleLiteral';
  elements: Expression[];
}

export interface EnumVariantAccess extends BaseNode {
  kind: 'EnumVariantAccess';
  enumName: string;
  variant: string;
  arguments?: Expression[];
}

export interface ClosureExpression extends BaseNode {
  kind: 'ClosureExpression';
  parameters: { name: string; typeAnnotation?: string }[];
  body: Statement[] | Expression;
}

export interface SelfExpression extends BaseNode {
  kind: 'SelfExpression';
}

export interface NoneLiteral extends BaseNode {
  kind: 'NoneLiteral';
}

export interface IfExpression extends BaseNode {
  kind: 'IfExpression';
  condition: Expression;
  thenBranch: Expression;
  elseBranch: Expression;
}

export interface TryExpression extends BaseNode {
  kind: 'TryExpression';
  expression: Expression;
}
