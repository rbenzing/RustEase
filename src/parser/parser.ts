import { TokenType, type Token } from '../lexer/tokens.js';
import { type CompilerError, type SourceLocation, createError } from '../errors/errors.js';
import type {
  Program,
  Declaration,
  FunctionDeclaration,
  ConstDeclaration,
  StructDeclaration,
  EnumDeclaration,
  Parameter,
  Statement,
  Expression,
  VariableAssignment,
  FieldAssignment,
  IndexAssignment,
  ReturnStatement,
  IfStatement,
  WhileStatement,
  ForStatement,
  ExpressionStatement,
  BinaryExpression,
  UnaryExpression,
  Literal,
  IdentifierExpr,
  FunctionCall,
  GroupedExpression,
  ArrayLiteral,
  IndexExpression,
  MethodCall,
  FieldAccess,
  StructLiteral,
  RangeExpression,
  ElseIfBranch,
  BinaryOperator,
  BreakStatement,
  ContinueStatement,
  EnumVariantAccess,
  MatchStatement,
  MatchArm,
  MatchPattern,
  ClosureExpression,
  ImplDeclaration,
  SelfExpression,
  NoneLiteral,
  MapLiteral,
} from '../ast/nodes.js';

export function parse(tokens: Token[]): { program: Program; errors: CompilerError[] } {
  const errors: CompilerError[] = [];
  let current = 0;

  // --- Cursor helpers ---

  function peek(): Token {
    return tokens[current]!;
  }

  function peekNext(): Token {
    return tokens[current + 1] ?? tokens[current]!;
  }

  function peekAt(offset: number): Token {
    return tokens[current + offset] ?? tokens[current]!;
  }

  function advance(): Token {
    const token = tokens[current]!;
    if (!isAtEnd()) current++;
    return token;
  }

  function isAtEnd(): boolean {
    return peek().type === TokenType.EOF;
  }

  function check(type: TokenType): boolean {
    return peek().type === type;
  }

  function match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (check(type)) {
        advance();
        return true;
      }
    }
    return false;
  }

  function expect(type: TokenType, message: string): Token {
    if (check(type)) {
      return advance();
    }
    const token = peek();
    errors.push(createError('parser', message, token.location));
    return token;
  }

  function skipNewlines(): void {
    while (check(TokenType.Newline)) {
      advance();
    }
  }

  function currentLocation(): SourceLocation {
    return peek().location;
  }

  // --- Error recovery ---

  function synchronize(): void {
    while (!isAtEnd()) {
      if (check(TokenType.Newline)) {
        advance();
        return;
      }
      if (check(TokenType.End) || check(TokenType.Function)) {
        return;
      }
      advance();
    }
  }

  // --- Top-level ---

  function parseProgram(): Program {
    const location = currentLocation();
    const declarations: Declaration[] = [];
    skipNewlines();

    while (!isAtEnd()) {
      if (check(TokenType.Function)) {
        declarations.push(parseFunction());
      } else if (check(TokenType.Const)) {
        declarations.push(parseTopLevelConst());
      } else if (check(TokenType.Struct)) {
        declarations.push(parseStructDeclaration());
      } else if (check(TokenType.Enum)) {
        declarations.push(parseEnumDeclaration());
      } else if (check(TokenType.Impl)) {
        declarations.push(parseImplDeclaration());
      } else if (check(TokenType.Import) || check(TokenType.From)) {
        const token = peek();
        errors.push(createError('parser', `'import' is not yet supported in RustEase`, token.location));
        synchronize();
      } else {
        const token = peek();
        errors.push(createError('parser', `Unexpected token '${token.value}' at top level`, token.location));
        synchronize();
      }
      skipNewlines();
    }

    return { kind: 'Program', declarations, location };
  }

  function parseTopLevelConst(): ConstDeclaration {
    const location = currentLocation();
    advance(); // consume 'const'
    const nameTok = expect(TokenType.Identifier, "Expected constant name after 'const'");
    expect(TokenType.Equals, "Expected '=' after constant name");
    const value = parseExpression();
    return { kind: 'ConstDeclaration', name: nameTok.value, value, location };
  }

  function parseStructDeclaration(): StructDeclaration {
    const location = currentLocation();
    advance(); // consume 'struct'
    const nameTok = expect(TokenType.Identifier, "Expected struct name after 'struct'");
    skipNewlines();
    const fields: { name: string; typeAnnotation: string }[] = [];
    while (!isAtEnd() && !check(TokenType.End)) {
      if (check(TokenType.Newline)) { skipNewlines(); continue; }
      const fieldNameTok = expect(TokenType.Identifier, 'Expected field name in struct');
      expect(TokenType.Colon, "Expected ':' after field name");
      const typeTok = expect(TokenType.Identifier, 'Expected type annotation after');
      fields.push({ name: fieldNameTok.value, typeAnnotation: typeTok.value });
      skipNewlines();
    }
    expect(TokenType.End, "Expected 'end' to close struct declaration");
    return { kind: 'StructDeclaration', name: nameTok.value, fields, location };
  }

  function parseEnumDeclaration(): EnumDeclaration {
    const location = currentLocation();
    advance(); // consume 'enum'
    const nameTok = expect(TokenType.Identifier, "Expected enum name after 'enum'");
    skipNewlines();
    const variants: { name: string }[] = [];
    while (!isAtEnd() && !check(TokenType.End)) {
      if (check(TokenType.Newline)) { skipNewlines(); continue; }
      const variantTok = expect(TokenType.Identifier, 'Expected variant name in enum');
      variants.push({ name: variantTok.value });
      skipNewlines();
    }
    expect(TokenType.End, "Expected 'end' to close enum declaration");
    return { kind: 'EnumDeclaration', name: nameTok.value, variants, location };
  }

  function parseImplDeclaration(): ImplDeclaration {
    const location = currentLocation();
    advance(); // consume 'impl'
    const nameTok = expect(TokenType.Identifier, "Expected struct name after 'impl'");
    skipNewlines();
    const methods: FunctionDeclaration[] = [];
    while (!isAtEnd() && !check(TokenType.End)) {
      if (check(TokenType.Newline)) { skipNewlines(); continue; }
      if (check(TokenType.Function)) {
        methods.push(parseFunction());
        skipNewlines();
      } else {
        const token = peek();
        errors.push(createError('parser', `Expected 'function' inside impl block, got '${token.value}'`, token.location));
        synchronize();
        break;
      }
    }
    expect(TokenType.End, "Expected 'end' to close impl block");
    return { kind: 'ImplDeclaration', structName: nameTok.value, methods, location };
  }

  function parseFunction(): FunctionDeclaration {
    const location = currentLocation();
    advance(); // consume 'function'

    const nameTok = expect(TokenType.Identifier, "Expected function name after 'function'");
    const name = nameTok.value;

    expect(TokenType.LeftParen, `Expected '(' after function name`);
    const parameters = parseParameters();
    expect(TokenType.RightParen, "Expected ')' after parameters");

    // Optional return type annotation: -> Type
    let returnTypeAnnotation: string | undefined;
    if (check(TokenType.ThinArrow)) {
      advance(); // consume '->'
      const typeTok = expect(TokenType.Identifier, "Expected return type after '->'");
      returnTypeAnnotation = typeTok.value;
    }
    skipNewlines();

    const body = parseBody();

    expect(TokenType.End, "Expected 'end' to close function body");

    return { kind: 'FunctionDeclaration', name, parameters, returnTypeAnnotation, body, location };
  }

  function parseParameters(): Parameter[] {
    const params: Parameter[] = [];
    if (check(TokenType.RightParen)) return params;

    do {
      skipNewlines();
      if (check(TokenType.RightParen)) break;
      const tok = expect(TokenType.Identifier, 'Expected parameter name');
      let typeAnnotation: string | undefined;
      if (check(TokenType.Colon)) {
        advance(); // consume ':'
        const typeTok = expect(TokenType.Identifier, "Expected type annotation after ':'");
        typeAnnotation = typeTok.value;
      }
      params.push({ name: tok.value, typeAnnotation, location: tok.location });
    } while (match(TokenType.Comma));

    return params;
  }

  function parseBody(): Statement[] {
    const statements: Statement[] = [];
    skipNewlines();

    while (!isAtEnd()) {
      if (check(TokenType.End) || check(TokenType.Else) || check(TokenType.Elif) || check(TokenType.Function)) {
        break;
      }
      const stmt = parseStatement();
      statements.push(stmt);
      skipNewlines();
    }

    return statements;
  }

  // --- Statements ---

  function parseStatement(): Statement {
    if (check(TokenType.If)) return parseIfStatement();
    if (check(TokenType.While)) return parseWhileStatement();
    if (check(TokenType.For)) return parseForStatement();
    if (check(TokenType.Return)) return parseReturnStatement();
    if (check(TokenType.Break)) return parseBreakStatement();
    if (check(TokenType.Continue)) return parseContinueStatement();
    if (check(TokenType.Match)) return parseMatchStatement();

    // const x = expr inside a function body
    if (check(TokenType.Const)) {
      const location = currentLocation();
      advance(); // consume 'const'
      const identTok = expect(TokenType.Identifier, "Expected variable name after 'const'");
      expect(TokenType.Equals, "Expected '=' after const variable name");
      const expression = parseExpression();
      return { kind: 'VariableAssignment', identifier: identTok.value, expression, isConst: true, location };
    }

    // Compound assignment: x += expr → x = x + expr, x -= expr → x = x - expr, x *= expr → x = x * expr, x /= expr → x = x / expr
    if (check(TokenType.Identifier) &&
        (peekNext().type === TokenType.PlusEquals || peekNext().type === TokenType.MinusEquals ||
         peekNext().type === TokenType.StarEquals || peekNext().type === TokenType.SlashEquals)) {
      const location = currentLocation();
      const identTok = advance(); // consume identifier
      const opToken = advance();  // consume +=, -=, *=, or /=
      const op: BinaryOperator = opToken.type === TokenType.PlusEquals ? '+' :
                                 opToken.type === TokenType.MinusEquals ? '-' :
                                 opToken.type === TokenType.StarEquals ? '*' : '/';
      const rhs = parseExpression();
      const identExpr = { kind: 'Identifier' as const, name: identTok.value, location };
      const binaryExpr = { kind: 'BinaryExpression' as const, left: identExpr, operator: op, right: rhs, location } satisfies BinaryExpression;
      return { kind: 'VariableAssignment', identifier: identTok.value, expression: binaryExpr, location };
    }

    // Simple assignment: identifier = expr
    if (check(TokenType.Identifier) && peekNext().type === TokenType.Equals) {
      return parseAssignment();
    }

    // Parse expression — then check for assignment forms
    const location = currentLocation();
    const expr = parseExpression();
    if (expr.kind === 'IndexExpression' &&
        (check(TokenType.Equals) || check(TokenType.PlusEquals) || check(TokenType.MinusEquals) ||
         check(TokenType.StarEquals) || check(TokenType.SlashEquals))) {
      const opToken = advance(); // consume '=', '+=', '-=', '*=', or '/='
      const rhs = parseExpression();
      let value: Expression;
      if (opToken.type === TokenType.Equals) {
        value = rhs;
      } else {
        const op: BinaryOperator = opToken.type === TokenType.PlusEquals ? '+' :
                                   opToken.type === TokenType.MinusEquals ? '-' :
                                   opToken.type === TokenType.StarEquals ? '*' : '/';
        const lhsExpr: Expression = { kind: 'IndexExpression' as const, object: expr.object, index: expr.index, location };
        value = { kind: 'BinaryExpression' as const, left: lhsExpr, operator: op, right: rhs, location } satisfies BinaryExpression;
      }
      return { kind: 'IndexAssignment', object: expr.object, index: expr.index, value, location } satisfies IndexAssignment;
    }
    if (expr.kind === 'FieldAccess' &&
        (expr.object.kind === 'Identifier' || expr.object.kind === 'SelfExpression') &&
        (check(TokenType.Equals) || check(TokenType.PlusEquals) || check(TokenType.MinusEquals) ||
         check(TokenType.StarEquals) || check(TokenType.SlashEquals))) {
      const opToken = advance(); // consume '=', '+=', '-=', '*=', or '/='
      const rhs = parseExpression();
      const objectName = expr.object.kind === 'SelfExpression' ? 'self' : expr.object.name;
      let value: Expression;
      if (opToken.type === TokenType.Equals) {
        value = rhs;
      } else {
        const op: BinaryOperator = opToken.type === TokenType.PlusEquals ? '+' :
                                   opToken.type === TokenType.MinusEquals ? '-' :
                                   opToken.type === TokenType.StarEquals ? '*' : '/';
        const lhsExpr: Expression = { kind: 'FieldAccess' as const, object: expr.object, field: expr.field, location };
        value = { kind: 'BinaryExpression' as const, left: lhsExpr, operator: op, right: rhs, location } satisfies BinaryExpression;
      }
      return { kind: 'FieldAssignment', object: objectName, field: expr.field, value, location } satisfies FieldAssignment;
    }

    return { kind: 'ExpressionStatement', expression: expr, location } satisfies ExpressionStatement;
  }

  function parseIfStatement(): IfStatement {
    const location = currentLocation();
    advance(); // consume 'if'

    const condition = parseExpression();
    skipNewlines();

    const thenBranch = parseBody();
    const elseIfBranches: ElseIfBranch[] = [];
    let elseBranch: Statement[] | null = null;

    while (check(TokenType.Else) || check(TokenType.Elif)) {
      const elseLoc = currentLocation();

      if (check(TokenType.Elif)) {
        advance(); // consume 'elif'
        const elseIfCondition = parseExpression();
        skipNewlines();
        const elseIfBody = parseBody();
        elseIfBranches.push({ condition: elseIfCondition, body: elseIfBody, location: elseLoc });
      } else {
        advance(); // consume 'else'
        skipNewlines();

        if (check(TokenType.If)) {
          advance(); // consume 'if'
          const elseIfCondition = parseExpression();
          skipNewlines();
          const elseIfBody = parseBody();
          elseIfBranches.push({ condition: elseIfCondition, body: elseIfBody, location: elseLoc });
        } else {
          elseBranch = parseBody();
          break;
        }
      }
    }

    expect(TokenType.End, "Expected 'end' to close if statement");

    return { kind: 'IfStatement', condition, thenBranch, elseIfBranches, elseBranch, location };
  }

  function parseWhileStatement(): WhileStatement {
    const location = currentLocation();
    advance(); // consume 'while'

    const condition = parseExpression();
    skipNewlines();

    const body = parseBody();

    expect(TokenType.End, "Expected 'end' to close while loop");

    return { kind: 'WhileStatement', condition, body, location };
  }

  function parseForStatement(): ForStatement {
    const location = currentLocation();
    advance(); // consume 'for'
    const varTok = expect(TokenType.Identifier, "Expected variable name after 'for'");
    expect(TokenType.In, "Expected 'in' after variable name in for loop");
    const iterable = parseExpression();
    skipNewlines();
    const body = parseBody();
    expect(TokenType.End, "Expected 'end' to close for loop");
    return { kind: 'ForStatement', variable: varTok.value, iterable, body, location };
  }

  function parseReturnStatement(): ReturnStatement {
    const location = currentLocation();
    advance(); // consume 'return'
    // Bare return: no expression when followed by a statement terminator
    if (check(TokenType.Newline) || check(TokenType.End) || check(TokenType.Else) || check(TokenType.EOF) || check(TokenType.RightBrace)) {
      return { kind: 'ReturnStatement', expression: null, location };
    }
    const expression = parseExpression();
    return { kind: 'ReturnStatement', expression, location };
  }

  function parseBreakStatement(): BreakStatement {
    const location = currentLocation();
    advance(); // consume 'break'
    return { kind: 'BreakStatement', location };
  }

  function parseContinueStatement(): ContinueStatement {
    const location = currentLocation();
    advance(); // consume 'continue'
    return { kind: 'ContinueStatement', location };
  }

  function parseAssignment(): VariableAssignment {
    const location = currentLocation();
    const identTok = advance(); // consume identifier
    advance(); // consume '='
    const expression = parseExpression();
    return { kind: 'VariableAssignment', identifier: identTok.value, expression, location };
  }

  function parseExpressionStatement(): ExpressionStatement {
    const location = currentLocation();
    const expression = parseExpression();
    return { kind: 'ExpressionStatement', expression, location };
  }

  // --- Expression parsing with precedence climbing ---

  function parseExpression(): Expression {
    return parseRange();
  }

  // Range expressions: lower precedence than logical operators.
  // `start..end` or `start..=end`
  function parseRange(): Expression {
    const left = parseOr();
    if (check(TokenType.DotDot) || check(TokenType.DotDotEquals)) {
      const loc = currentLocation();
      const inclusive = check(TokenType.DotDotEquals);
      advance(); // consume '..' or '..='
      const right = parseOr();
      return { kind: 'RangeExpression', start: left, end: right, inclusive, location: loc } satisfies RangeExpression;
    }
    return left;
  }

  function parseOr(): Expression {
    let left = parseAnd();
    while (check(TokenType.Or)) {
      const loc = currentLocation();
      advance();
      const right = parseAnd();
      left = { kind: 'BinaryExpression', left, operator: 'or', right, location: loc } satisfies BinaryExpression;
    }
    return left;
  }

  function parseAnd(): Expression {
    let left = parseComparison();
    while (check(TokenType.And)) {
      const loc = currentLocation();
      advance();
      const right = parseComparison();
      left = { kind: 'BinaryExpression', left, operator: 'and', right, location: loc } satisfies BinaryExpression;
    }
    return left;
  }

  function parseComparison(): Expression {
    let left = parseAddition();

    const compOps: Partial<Record<TokenType, BinaryOperator>> = {
      [TokenType.EqualsEquals]: '==',
      [TokenType.NotEquals]: '!=',
      [TokenType.GreaterThan]: '>',
      [TokenType.LessThan]: '<',
      [TokenType.GreaterThanEquals]: '>=',
      [TokenType.LessThanEquals]: '<=',
    };

    const op = compOps[peek().type];
    if (op !== undefined) {
      const loc = currentLocation();
      advance();
      const right = parseAddition();
      left = { kind: 'BinaryExpression', left, operator: op, right, location: loc } satisfies BinaryExpression;
    }

    return left;
  }

  function parseAddition(): Expression {
    let left = parseMultiplication();
    while (check(TokenType.Plus) || check(TokenType.Minus)) {
      const loc = currentLocation();
      const op: BinaryOperator = check(TokenType.Plus) ? '+' : '-';
      advance();
      const right = parseMultiplication();
      left = { kind: 'BinaryExpression', left, operator: op, right, location: loc } satisfies BinaryExpression;
    }
    return left;
  }

  function parseMultiplication(): Expression {
    let left = parseUnary();
    while (check(TokenType.Star) || check(TokenType.Slash) || check(TokenType.Percent)) {
      const loc = currentLocation();
      const op: BinaryOperator = check(TokenType.Star) ? '*' : check(TokenType.Slash) ? '/' : '%';
      advance();
      const right = parseUnary();
      left = { kind: 'BinaryExpression', left, operator: op, right, location: loc } satisfies BinaryExpression;
    }
    return left;
  }

  function parseUnary(): Expression {
    if (check(TokenType.Not)) {
      const loc = currentLocation();
      advance();
      const operand = parseUnary();
      return { kind: 'UnaryExpression', operator: 'not', operand, location: loc } satisfies UnaryExpression;
    }
    if (check(TokenType.Minus)) {
      const loc = currentLocation();
      advance();
      const operand = parseUnary();
      return { kind: 'UnaryExpression', operator: '-', operand, location: loc } satisfies UnaryExpression;
    }
    return parsePostfix();
  }

  // Parses postfix operations: index access [expr] and method/field access .name(...)
  function parsePostfix(): Expression {
    let expr = parsePrimary();

    while (true) {
      if (check(TokenType.LeftBracket)) {
        const loc = currentLocation();
        advance(); // consume '['
        const index = parseExpression();
        expect(TokenType.RightBracket, "Expected ']' after index expression");
        expr = { kind: 'IndexExpression', object: expr, index, location: loc } satisfies IndexExpression;
      } else if (check(TokenType.Dot)) {
        const loc = currentLocation();
        advance(); // consume '.'
        const nameTok = expect(TokenType.Identifier, "Expected method or field name after '.'");
        if (check(TokenType.LeftParen)) {
          advance(); // consume '('
          const args: Expression[] = [];
          if (!check(TokenType.RightParen)) {
            do {
              skipNewlines();
              args.push(parseExpression());
              skipNewlines();
            } while (match(TokenType.Comma));
          }
          expect(TokenType.RightParen, "Expected ')' after method arguments");
          expr = { kind: 'MethodCall', object: expr, method: nameTok.value, arguments: args, location: loc } satisfies MethodCall;
        } else {
          expr = { kind: 'FieldAccess', object: expr, field: nameTok.value, location: loc } satisfies FieldAccess;
        }
      } else {
        break;
      }
    }

    return expr;
  }

  function parsePrimary(): Expression {
    const loc = currentLocation();
    const token = peek();

    if (token.type === TokenType.Number) {
      advance();
      const isFloat = token.value.includes('.');
      const value = isFloat ? parseFloat(token.value) : parseInt(token.value, 10);
      return { kind: 'Literal', value, literalType: isFloat ? 'float' : 'int', location: loc } satisfies Literal;
    }

    if (token.type === TokenType.String) {
      advance();
      return { kind: 'Literal', value: token.value, literalType: 'string', location: loc } satisfies Literal;
    }

    if (token.type === TokenType.True) {
      advance();
      return { kind: 'Literal', value: true, literalType: 'bool', location: loc } satisfies Literal;
    }

    if (token.type === TokenType.False) {
      advance();
      return { kind: 'Literal', value: false, literalType: 'bool', location: loc } satisfies Literal;
    }

    if (token.type === TokenType.Self) {
      advance();
      return { kind: 'SelfExpression', location: loc } satisfies SelfExpression;
    }

    if (token.type === TokenType.None) {
      advance();
      return { kind: 'NoneLiteral', location: loc } satisfies NoneLiteral;
    }

    if (token.type === TokenType.Some) {
      advance(); // consume 'some'
      expect(TokenType.LeftParen, "Expected '(' after 'some'");
      const args: Expression[] = [];
      if (!check(TokenType.RightParen)) {
        do {
          skipNewlines();
          args.push(parseExpression());
          skipNewlines();
        } while (match(TokenType.Comma));
      }
      expect(TokenType.RightParen, "Expected ')' after 'some' argument");
      return { kind: 'FunctionCall', name: 'some', arguments: args, location: loc } satisfies FunctionCall;
    }

    if (token.type === TokenType.Identifier) {
      advance();
      if (check(TokenType.LeftParen)) {
        advance(); // consume '('
        const args: Expression[] = [];
        if (!check(TokenType.RightParen)) {
          do {
            skipNewlines();
            args.push(parseExpression());
            skipNewlines();
          } while (match(TokenType.Comma));
        }
        expect(TokenType.RightParen, "Expected ')' after function arguments");
        return { kind: 'FunctionCall', name: token.value, arguments: args, location: loc } satisfies FunctionCall;
      }
      const firstChar = token.value[0] ?? '';
      // StructLiteral: UppercaseIdent { field: value, ... }
      if (firstChar >= 'A' && firstChar <= 'Z' && check(TokenType.LeftBrace)) {
        return parseStructLiteralBody(token.value, loc);
      }
      // EnumVariantAccess: UppercaseIdent.Ident (heuristic: starts with uppercase)
      if (
        firstChar >= 'A' && firstChar <= 'Z' &&
        check(TokenType.Dot) &&
        peekNext().type === TokenType.Identifier
      ) {
        advance(); // consume '.'
        const variantTok = advance(); // consume variant name
        return { kind: 'EnumVariantAccess', enumName: token.value, variant: variantTok.value, location: loc } satisfies EnumVariantAccess;
      }
      return { kind: 'Identifier', name: token.value, location: loc } satisfies IdentifierExpr;
    }

    if (token.type === TokenType.LeftParen) {
      advance(); // consume '('
      const expr = parseExpression();
      expect(TokenType.RightParen, "Expected ')' after grouped expression");
      return { kind: 'GroupedExpression', expression: expr, location: loc } satisfies GroupedExpression;
    }

    if (token.type === TokenType.LeftBracket) {
      advance(); // consume '['
      const elements: Expression[] = [];
      if (!check(TokenType.RightBracket)) {
        do {
          skipNewlines();
          if (check(TokenType.RightBracket)) break;
          elements.push(parseExpression());
          skipNewlines();
        } while (match(TokenType.Comma));
      }
      expect(TokenType.RightBracket, "Expected ']' after array elements");
      return { kind: 'ArrayLiteral', elements, location: loc } satisfies ArrayLiteral;
    }

    if (token.type === TokenType.LeftBrace) {
      advance(); // consume '{'
      const entries: { key: Expression; value: Expression }[] = [];
      skipNewlines();
      while (!check(TokenType.RightBrace) && !isAtEnd()) {
        skipNewlines();
        if (check(TokenType.RightBrace)) break;
        const key = parseExpression();
        expect(TokenType.Colon, "Expected ':' after map key");
        const value = parseExpression();
        entries.push({ key, value });
        skipNewlines();
        if (check(TokenType.RightBrace)) break;
        match(TokenType.Comma);
        skipNewlines();
      }
      expect(TokenType.RightBrace, "Expected '}' to close map literal");
      return { kind: 'MapLiteral', entries, location: loc } satisfies MapLiteral;
    }

    if (token.type === TokenType.Pipe) {
      return parseClosure(loc);
    }

    // Error: unexpected token
    errors.push(createError('parser', `Unexpected token '${token.value}' (${token.type})`, token.location));
    synchronize();
    // Return a dummy literal to allow parsing to continue
    return { kind: 'Literal', value: 0, literalType: 'int', location: loc };
  }

  function parseClosure(location: SourceLocation): ClosureExpression {
    advance(); // consume first '|'
    const parameters: { name: string; typeAnnotation?: string }[] = [];

    if (check(TokenType.Pipe)) {
      // Empty params: || body
      advance(); // consume second '|'
    } else {
      // Parse comma-separated params until closing '|'
      do {
        skipNewlines();
        if (check(TokenType.Pipe)) break;
        const paramTok = expect(TokenType.Identifier, 'Expected parameter name in closure');
        parameters.push({ name: paramTok.value });
        skipNewlines();
      } while (match(TokenType.Comma));
      expect(TokenType.Pipe, "Expected '|' to close closure parameters");
    }

    // Multi-statement body: { stmt; stmt; ... }
    if (check(TokenType.LeftBrace)) {
      advance(); // consume '{'
      const statements: Statement[] = [];
      // Skip leading newlines/semicolons
      while (check(TokenType.Newline) || check(TokenType.Semicolon)) advance();
      while (!check(TokenType.RightBrace) && !isAtEnd()) {
        const stmt = parseStatement();
        statements.push(stmt);
        // Skip separators between statements
        while (check(TokenType.Newline) || check(TokenType.Semicolon)) advance();
      }
      expect(TokenType.RightBrace, "Expected '}' to close closure body");
      return { kind: 'ClosureExpression', parameters, body: statements, location } satisfies ClosureExpression;
    }

    // Single-expression body
    const body = parseExpression();
    return { kind: 'ClosureExpression', parameters, body, location } satisfies ClosureExpression;
  }

  function parseStructLiteralBody(name: string, location: SourceLocation): StructLiteral {
    advance(); // consume '{'
    const fields: { name: string; value: Expression }[] = [];
    skipNewlines();
    while (!check(TokenType.RightBrace) && !isAtEnd()) {
      skipNewlines();
      if (check(TokenType.RightBrace)) break;
      const fieldNameTok = expect(TokenType.Identifier, 'Expected field name in struct literal');
      expect(TokenType.Colon, "Expected ':' after field name");
      const value = parseExpression();
      fields.push({ name: fieldNameTok.value, value });
      skipNewlines();
      if (check(TokenType.RightBrace)) break;
      match(TokenType.Comma);
      skipNewlines();
    }
    expect(TokenType.RightBrace, "Expected '}' to close struct literal");
    return { kind: 'StructLiteral', name, fields, location };
  }

  // --- Match statement ---

  /**
   * Returns true if the current token position looks like the start of a
   * match arm pattern (i.e. a pattern token followed eventually by `=>`).
   */
  function isAtArmStart(): boolean {
    const t0 = peekAt(0);
    const t1 = peekAt(1);

    // Literal pattern: Number/String/True/False =>
    if (
      (t0.type === TokenType.Number || t0.type === TokenType.String ||
       t0.type === TokenType.True || t0.type === TokenType.False) &&
      t1.type === TokenType.Arrow
    ) {
      return true;
    }

    // Wildcard or identifier pattern: Identifier =>
    if (t0.type === TokenType.Identifier && t1.type === TokenType.Arrow) {
      return true;
    }

    // Enum pattern: Identifier.Identifier =>
    if (t0.type === TokenType.Identifier && t1.type === TokenType.Dot) {
      const t2 = peekAt(2);
      const t3 = peekAt(3);
      if (t2.type === TokenType.Identifier && t3.type === TokenType.Arrow) {
        return true;
      }
    }

    return false;
  }

  function parseMatchPattern(): MatchPattern {
    const token = peek();

    // Wildcard: _
    if (token.type === TokenType.Identifier && token.value === '_') {
      advance();
      return { kind: 'WildcardPattern' };
    }

    // Enum pattern: UppercaseIdent.Variant (ident followed by dot then ident then =>)
    if (
      token.type === TokenType.Identifier &&
      peekNext().type === TokenType.Dot
    ) {
      const enumName = advance().value; // consume enum name
      advance(); // consume '.'
      const variantTok = expect(TokenType.Identifier, "Expected variant name after '.' in match pattern");
      return { kind: 'EnumPattern', enumName, variant: variantTok.value };
    }

    // Identifier pattern (non-enum, non-wildcard)
    if (token.type === TokenType.Identifier) {
      advance();
      return { kind: 'IdentifierPattern', name: token.value };
    }

    // Literal pattern: number, string, true, false
    const expr = parseExpression();
    return { kind: 'LiteralPattern', value: expr };
  }

  function parseMatchStatement(): MatchStatement {
    const location = currentLocation();
    advance(); // consume 'match'

    const expression = parseExpression();
    skipNewlines();

    const arms: MatchArm[] = [];

    while (!isAtEnd() && !check(TokenType.End)) {
      skipNewlines();
      if (check(TokenType.End) || isAtEnd()) break;

      const armLocation = currentLocation();
      const pattern = parseMatchPattern();

      expect(TokenType.Arrow, "Expected '=>' after match pattern");
      skipNewlines();

      // Parse arm body statements until next arm start or 'end'
      const body: Statement[] = [];
      while (!isAtEnd() && !check(TokenType.End) && !isAtArmStart()) {
        const stmt = parseStatement();
        body.push(stmt);
        skipNewlines();
      }

      arms.push({ kind: 'MatchArm', pattern, body, location: armLocation });
    }

    expect(TokenType.End, "Expected 'end' to close match statement");

    return { kind: 'MatchStatement', expression, arms, location };
  }

  return { program: parseProgram(), errors };
}
