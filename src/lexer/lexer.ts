import { TokenType, type Token } from './tokens.js';
import { type CompilerError, type SourceLocation, createError } from '../errors/errors.js';

const KEYWORDS: Record<string, TokenType> = {
  function: TokenType.Function,
  end: TokenType.End,
  if: TokenType.If,
  else: TokenType.Else,
  elif: TokenType.Elif,
  while: TokenType.While,
  return: TokenType.Return,
  and: TokenType.And,
  or: TokenType.Or,
  not: TokenType.Not,
  true: TokenType.True,
  false: TokenType.False,
  for: TokenType.For,
  in: TokenType.In,
  break: TokenType.Break,
  continue: TokenType.Continue,
  struct: TokenType.Struct,
  enum: TokenType.Enum,
  match: TokenType.Match,
  const: TokenType.Const,
  import: TokenType.Import,
  from: TokenType.From,
  none: TokenType.None,
  some: TokenType.Some,
  self: TokenType.Self,
  impl: TokenType.Impl,
  then: TokenType.Then,
  gen: TokenType.Gen,
};

export function tokenize(
  source: string,
  filename: string,
): { tokens: Token[]; errors: CompilerError[] } {
  const tokens: Token[] = [];
  const errors: CompilerError[] = [];

  let pos = 0;
  let line = 1;
  let col = 1;

  function loc(): SourceLocation {
    return { line, column: col, filename };
  }

  function peek(offset = 0): string {
    return source[pos + offset] ?? '';
  }

  function advance(): string {
    const ch = source[pos++] ?? '';
    col++;
    return ch;
  }

  function addToken(type: TokenType, value: string, location: SourceLocation): void {
    tokens.push({ type, value, location });
  }

  while (pos < source.length) {
    const ch = peek();

    // Whitespace (skip)
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance();
      continue;
    }

    // Newline
    if (ch === '\n') {
      const tokenLoc = loc();
      advance();
      addToken(TokenType.Newline, '\n', tokenLoc);
      line++;
      col = 1;
      continue;
    }

    // Comments: # skips to end of line
    if (ch === '#') {
      while (pos < source.length && peek() !== '\n') {
        advance();
      }
      continue;
    }

    // Single-char operators and symbols
    if (ch === '*') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.StarEquals, '*=', tokenLoc);
      } else {
        addToken(TokenType.Star, '*', tokenLoc);
      }
      continue;
    }
    if (ch === '/') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.SlashEquals, '/=', tokenLoc);
      } else {
        addToken(TokenType.Slash, '/', tokenLoc);
      }
      continue;
    }
    if (ch === '%') { addToken(TokenType.Percent, '%', loc()); advance(); continue; }
    if (ch === '(') { addToken(TokenType.LeftParen, '(', loc()); advance(); continue; }
    if (ch === ')') { addToken(TokenType.RightParen, ')', loc()); advance(); continue; }
    if (ch === ',') { addToken(TokenType.Comma, ',', loc()); advance(); continue; }
    if (ch === '[') { addToken(TokenType.LeftBracket, '[', loc()); advance(); continue; }
    if (ch === ']') { addToken(TokenType.RightBracket, ']', loc()); advance(); continue; }
    if (ch === '{') { addToken(TokenType.LeftBrace, '{', loc()); advance(); continue; }
    if (ch === '}') { addToken(TokenType.RightBrace, '}', loc()); advance(); continue; }
    if (ch === ':') { addToken(TokenType.Colon, ':', loc()); advance(); continue; }
    if (ch === '|') { addToken(TokenType.Pipe, '|', loc()); advance(); continue; }
    if (ch === ';') { addToken(TokenType.Semicolon, ';', loc()); advance(); continue; }

    // Multi-char operators with lookahead
    if (ch === '+') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.PlusEquals, '+=', tokenLoc);
      } else {
        addToken(TokenType.Plus, '+', tokenLoc);
      }
      continue;
    }

    if (ch === '-') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.MinusEquals, '-=', tokenLoc);
      } else if (peek() === '>') {
        advance();
        addToken(TokenType.ThinArrow, '->', tokenLoc);
      } else {
        addToken(TokenType.Minus, '-', tokenLoc);
      }
      continue;
    }

    if (ch === '.') {
      const tokenLoc = loc();
      advance();
      if (peek() === '.') {
        advance();
        if (peek() === '=') {
          advance();
          addToken(TokenType.DotDotEquals, '..=', tokenLoc);
        } else {
          addToken(TokenType.DotDot, '..', tokenLoc);
        }
      } else {
        addToken(TokenType.Dot, '.', tokenLoc);
      }
      continue;
    }

    if (ch === '=') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.EqualsEquals, '==', tokenLoc);
      } else if (peek() === '>') {
        advance();
        addToken(TokenType.Arrow, '=>', tokenLoc);
      } else {
        addToken(TokenType.Equals, '=', tokenLoc);
      }
      continue;
    }

    if (ch === '!') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.NotEquals, '!=', tokenLoc);
      } else {
        errors.push(createError('lexer', "Invalid character '!' (use 'not' keyword)", tokenLoc));
      }
      continue;
    }

    if (ch === '>') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.GreaterThanEquals, '>=', tokenLoc);
      } else {
        addToken(TokenType.GreaterThan, '>', tokenLoc);
      }
      continue;
    }

    if (ch === '<') {
      const tokenLoc = loc();
      advance();
      if (peek() === '=') {
        advance();
        addToken(TokenType.LessThanEquals, '<=', tokenLoc);
      } else {
        addToken(TokenType.LessThan, '<', tokenLoc);
      }
      continue;
    }

    // Number literals
    if (ch >= '0' && ch <= '9') {
      const tokenLoc = loc();
      let value = '';
      let hasDot = false;
      while (pos < source.length && (peek() >= '0' && peek() <= '9' ||
          // Only consume '.' as a decimal point when it is NOT followed by another '.'
          // (which would make it the start of a range operator '..' or '..=')
          peek() === '.' && !hasDot && peek(1) !== '.')) {
        if (peek() === '.') hasDot = true;
        value += advance();
      }
      addToken(TokenType.Number, value, tokenLoc);
      continue;
    }

    // String literals
    if (ch === '"') {
      const tokenLoc = loc();

      // Triple-quoted string: """..."""
      if (peek(1) === '"' && peek(2) === '"') {
        advance(); advance(); advance(); // consume opening """
        let value = '';
        let terminated = false;
        while (pos < source.length) {
          const c = peek();
          // Check for closing """
          if (c === '"' && peek(1) === '"' && peek(2) === '"') {
            advance(); advance(); advance(); // consume closing """
            terminated = true;
            break;
          }
          // Normalize literal newlines (increment line counter)
          if (c === '\n') {
            advance();
            value += '\\n';
            line++;
            col = 1;
            continue;
          }
          if (c === '\r') {
            advance();
            if (peek() === '\n') advance(); // consume \r\n as a single newline
            value += '\\n';
            line++;
            col = 1;
            continue;
          }
          // Escape sequences (same as regular strings)
          if (c === '\\') {
            advance(); // consume backslash
            const escaped = peek();
            if (escaped === 'n') { advance(); value += '\\n'; }
            else if (escaped === 't') { advance(); value += '\\t'; }
            else if (escaped === '\\') { advance(); value += '\\\\'; }
            else if (escaped === '"') { advance(); value += '\\"'; }
            else if (escaped === 'r') { advance(); value += '\\r'; }
            else if (escaped === '{') { advance(); value += '{{'; }
            else if (escaped === '}') { advance(); value += '}}'; }
            else {
              advance();
              errors.push(createError('lexer', `Invalid escape sequence: \\${escaped}`, tokenLoc));
            }
            continue;
          }
          // Single " or "" (not closing """) — normalize to escaped form so codegen is safe
          if (c === '"') {
            advance();
            value += '\\"';
            continue;
          }
          value += advance();
        }
        if (!terminated) {
          errors.push(createError('lexer', 'Unterminated triple-quoted string', tokenLoc));
        } else {
          addToken(TokenType.String, value, tokenLoc);
        }
        continue;
      }

      // Regular single-quoted string
      advance(); // consume opening quote
      let value = '';
      let terminated = false;
      while (pos < source.length) {
        const c = peek();
        if (c === '"') {
          advance();
          terminated = true;
          break;
        }
        if (c === '\n') break; // unterminated
        if (c === '\\') {
          advance(); // consume backslash
          const escaped = peek();
          if (escaped === 'n') { advance(); value += '\\n'; }
          else if (escaped === 't') { advance(); value += '\\t'; }
          else if (escaped === '\\') { advance(); value += '\\\\'; }
          else if (escaped === '"') { advance(); value += '\\"'; }
          else if (escaped === 'r') { advance(); value += '\\r'; }
          else if (escaped === '{') { advance(); value += '{{'; }
          else if (escaped === '}') { advance(); value += '}}'; }
          else {
            advance();
            errors.push(createError('lexer', `Invalid escape sequence: \\${escaped}`, tokenLoc));
          }
        } else {
          value += advance();
        }
      }
      if (!terminated) {
        errors.push(createError('lexer', 'Unterminated string literal', tokenLoc));
      } else {
        addToken(TokenType.String, value, tokenLoc);
      }
      continue;
    }

    // Identifiers and keywords
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      const tokenLoc = loc();
      let value = '';
      while (pos < source.length) {
        const c = peek();
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
          value += advance();
        } else {
          break;
        }
      }
      const tokenType = KEYWORDS[value] ?? TokenType.Identifier;
      addToken(tokenType, value, tokenLoc);
      continue;
    }

    // Invalid character
    const tokenLoc = loc();
    errors.push(createError('lexer', `Invalid character '${ch}'`, tokenLoc));
    advance();
  }

  // EOF
  addToken(TokenType.EOF, '', loc());

  return { tokens, errors };
}

