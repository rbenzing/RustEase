import type { SourceLocation } from '../errors/errors.js';

export enum TokenType {
  // Literals
  Number = 'Number',
  String = 'String',
  True = 'True',
  False = 'False',

  // Identifier
  Identifier = 'Identifier',

  // Keywords
  Function = 'Function',
  End = 'End',
  If = 'If',
  Else = 'Else',
  Elif = 'Elif',
  While = 'While',
  Return = 'Return',
  And = 'And',
  Or = 'Or',
  Not = 'Not',
  For = 'For',
  In = 'In',
  Break = 'Break',
  Continue = 'Continue',
  Struct = 'Struct',
  Enum = 'Enum',
  Match = 'Match',
  Const = 'Const',
  Import = 'Import',
  From = 'From',
  None = 'None',
  Some = 'Some',
  Self = 'Self',
  Impl = 'Impl',

  // Operators
  Plus = 'Plus',
  Minus = 'Minus',
  Star = 'Star',
  Slash = 'Slash',
  Percent = 'Percent',
  Equals = 'Equals',
  EqualsEquals = 'EqualsEquals',
  NotEquals = 'NotEquals',
  GreaterThan = 'GreaterThan',
  LessThan = 'LessThan',
  GreaterThanEquals = 'GreaterThanEquals',
  LessThanEquals = 'LessThanEquals',
  Arrow = 'Arrow',
  ThinArrow = 'ThinArrow',
  PlusEquals = 'PlusEquals',
  MinusEquals = 'MinusEquals',
  StarEquals = 'StarEquals',
  SlashEquals = 'SlashEquals',

  // Symbols
  LeftParen = 'LeftParen',
  RightParen = 'RightParen',
  Comma = 'Comma',
  LeftBracket = 'LeftBracket',
  RightBracket = 'RightBracket',
  LeftBrace = 'LeftBrace',
  RightBrace = 'RightBrace',
  Colon = 'Colon',
  Dot = 'Dot',
  DotDot = 'DotDot',
  DotDotEquals = 'DotDotEquals',
  Pipe = 'Pipe',
  Semicolon = 'Semicolon',

  // Special
  Newline = 'Newline',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  location: SourceLocation;
}

