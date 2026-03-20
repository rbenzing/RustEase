import { describe, it, expect } from 'vitest';
import { TokenType } from '../../src/lexer/tokens.js';
import { tokenize } from '../../src/lexer/lexer.js';

describe('TokenType enum', () => {
  describe('Literal token types', () => {
    it('has Number', () => expect(TokenType.Number).toBe('Number'));
    it('has String', () => expect(TokenType.String).toBe('String'));
    it('has True', () => expect(TokenType.True).toBe('True'));
    it('has False', () => expect(TokenType.False).toBe('False'));
  });

  describe('Identifier token type', () => {
    it('has Identifier', () => expect(TokenType.Identifier).toBe('Identifier'));
  });

  describe('Keyword token types', () => {
    it('has Function', () => expect(TokenType.Function).toBe('Function'));
    it('has End', () => expect(TokenType.End).toBe('End'));
    it('has If', () => expect(TokenType.If).toBe('If'));
    it('has Else', () => expect(TokenType.Else).toBe('Else'));
    it('has While', () => expect(TokenType.While).toBe('While'));
    it('has Return', () => expect(TokenType.Return).toBe('Return'));
    it('has And', () => expect(TokenType.And).toBe('And'));
    it('has Or', () => expect(TokenType.Or).toBe('Or'));
    it('has Not', () => expect(TokenType.Not).toBe('Not'));
    // P1-S08 new keywords
    it('has For', () => expect(TokenType.For).toBe('For'));
    it('has In', () => expect(TokenType.In).toBe('In'));
    it('has Break', () => expect(TokenType.Break).toBe('Break'));
    it('has Continue', () => expect(TokenType.Continue).toBe('Continue'));
    it('has Struct', () => expect(TokenType.Struct).toBe('Struct'));
    it('has Enum', () => expect(TokenType.Enum).toBe('Enum'));
    it('has Match', () => expect(TokenType.Match).toBe('Match'));
    it('has Const', () => expect(TokenType.Const).toBe('Const'));
    it('has Import', () => expect(TokenType.Import).toBe('Import'));
    it('has From', () => expect(TokenType.From).toBe('From'));
    it('has None', () => expect(TokenType.None).toBe('None'));
    it('has Some', () => expect(TokenType.Some).toBe('Some'));
    it('has Self', () => expect(TokenType.Self).toBe('Self'));
    it('has Impl', () => expect(TokenType.Impl).toBe('Impl'));
  });

  describe('Operator token types', () => {
    it('has Plus', () => expect(TokenType.Plus).toBe('Plus'));
    it('has Minus', () => expect(TokenType.Minus).toBe('Minus'));
    it('has Star', () => expect(TokenType.Star).toBe('Star'));
    it('has Slash', () => expect(TokenType.Slash).toBe('Slash'));
    it('has Equals', () => expect(TokenType.Equals).toBe('Equals'));
    it('has EqualsEquals', () => expect(TokenType.EqualsEquals).toBe('EqualsEquals'));
    it('has NotEquals', () => expect(TokenType.NotEquals).toBe('NotEquals'));
    it('has GreaterThan', () => expect(TokenType.GreaterThan).toBe('GreaterThan'));
    it('has LessThan', () => expect(TokenType.LessThan).toBe('LessThan'));
    it('has GreaterThanEquals', () => expect(TokenType.GreaterThanEquals).toBe('GreaterThanEquals'));
    it('has LessThanEquals', () => expect(TokenType.LessThanEquals).toBe('LessThanEquals'));
    // P1-S08 new operators
    it('has Percent', () => expect(TokenType.Percent).toBe('Percent'));
    it('has Arrow', () => expect(TokenType.Arrow).toBe('Arrow'));
    it('has PlusEquals', () => expect(TokenType.PlusEquals).toBe('PlusEquals'));
    it('has MinusEquals', () => expect(TokenType.MinusEquals).toBe('MinusEquals'));
  });

  describe('Symbol token types', () => {
    it('has LeftParen', () => expect(TokenType.LeftParen).toBe('LeftParen'));
    it('has RightParen', () => expect(TokenType.RightParen).toBe('RightParen'));
    it('has Comma', () => expect(TokenType.Comma).toBe('Comma'));
    // P1-S08 new symbols
    it('has LeftBracket', () => expect(TokenType.LeftBracket).toBe('LeftBracket'));
    it('has RightBracket', () => expect(TokenType.RightBracket).toBe('RightBracket'));
    it('has LeftBrace', () => expect(TokenType.LeftBrace).toBe('LeftBrace'));
    it('has RightBrace', () => expect(TokenType.RightBrace).toBe('RightBrace'));
    it('has Colon', () => expect(TokenType.Colon).toBe('Colon'));
    it('has Dot', () => expect(TokenType.Dot).toBe('Dot'));
    it('has DotDot', () => expect(TokenType.DotDot).toBe('DotDot'));
    it('has DotDotEquals', () => expect(TokenType.DotDotEquals).toBe('DotDotEquals'));
    it('has Hash', () => expect(TokenType.Hash).toBe('Hash'));
    it('has Pipe', () => expect(TokenType.Pipe).toBe('Pipe'));
    it('has Semicolon', () => expect(TokenType.Semicolon).toBe('Semicolon'));
  });

  describe('Special token types', () => {
    it('has Newline', () => expect(TokenType.Newline).toBe('Newline'));
    it('has EOF', () => expect(TokenType.EOF).toBe('EOF'));
  });

  it('enum contains all 60 token types', () => {
    const members = Object.keys(TokenType);
    expect(members).toHaveLength(60);
  });

  it('enum values are unique strings', () => {
    const values = Object.values(TokenType);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// Helper to get non-EOF tokens
function tokenTypes(source: string): TokenType[] {
  const { tokens } = tokenize(source, 'test.re');
  return tokens.filter(t => t.type !== TokenType.EOF).map(t => t.type);
}

function firstToken(source: string) {
  return tokenize(source, 'test.re').tokens[0];
}

describe('tokenize()', () => {
  describe('keywords', () => {
    it.each([
      ['function', TokenType.Function],
      ['end', TokenType.End],
      ['if', TokenType.If],
      ['else', TokenType.Else],
      ['while', TokenType.While],
      ['return', TokenType.Return],
      ['and', TokenType.And],
      ['or', TokenType.Or],
      ['not', TokenType.Not],
      ['true', TokenType.True],
      ['false', TokenType.False],
    ])('tokenizes keyword "%s"', (src, expected) => {
      expect(tokenTypes(src)).toEqual([expected]);
    });
  });

  describe('operators', () => {
    it.each([
      ['+', TokenType.Plus],
      ['-', TokenType.Minus],
      ['*', TokenType.Star],
      ['/', TokenType.Slash],
      ['=', TokenType.Equals],
      ['==', TokenType.EqualsEquals],
      ['!=', TokenType.NotEquals],
      ['>', TokenType.GreaterThan],
      ['<', TokenType.LessThan],
      ['>=', TokenType.GreaterThanEquals],
      ['<=', TokenType.LessThanEquals],
    ])('tokenizes operator "%s"', (src, expected) => {
      expect(tokenTypes(src)).toEqual([expected]);
    });
  });

  describe('symbols', () => {
    it('tokenizes (', () => expect(tokenTypes('(')).toEqual([TokenType.LeftParen]));
    it('tokenizes )', () => expect(tokenTypes(')')).toEqual([TokenType.RightParen]));
    it('tokenizes ,', () => expect(tokenTypes(',')).toEqual([TokenType.Comma]));
  });

  describe('identifiers', () => {
    it.each(['x', 'myVar', '_private', 'camelCase123'])('tokenizes identifier "%s"', (src) => {
      const t = firstToken(src);
      expect(t.type).toBe(TokenType.Identifier);
      expect(t.value).toBe(src);
    });
  });

  describe('integer literals', () => {
    it.each(['0', '42', '12345'])('tokenizes integer "%s"', (src) => {
      const t = firstToken(src);
      expect(t.type).toBe(TokenType.Number);
      expect(t.value).toBe(src);
    });
  });

  describe('float literals', () => {
    it.each(['3.14', '0.5', '100.0'])('tokenizes float "%s"', (src) => {
      const t = firstToken(src);
      expect(t.type).toBe(TokenType.Number);
      expect(t.value).toBe(src);
    });
  });

  describe('string literals', () => {
    it('tokenizes "hello"', () => {
      const t = firstToken('"hello"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('hello');
    });

    it('tokenizes "Hello {name}"', () => {
      const t = firstToken('"Hello {name}"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('Hello {name}');
    });

    it('tokenizes empty string ""', () => {
      const t = firstToken('""');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('');
    });
  });

  describe('booleans', () => {
    it('tokenizes true', () => expect(firstToken('true').type).toBe(TokenType.True));
    it('tokenizes false', () => expect(firstToken('false').type).toBe(TokenType.False));
  });

  describe('newline handling', () => {
    it('emits Newline token for \\n', () => {
      expect(tokenTypes('\n')).toContain(TokenType.Newline);
    });

    it('tracks line numbers across multiple lines', () => {
      const { tokens } = tokenize('x\ny\nz', 'test.re');
      const identifiers = tokens.filter(t => t.type === TokenType.Identifier);
      expect(identifiers[0].location.line).toBe(1);
      expect(identifiers[1].location.line).toBe(2);
      expect(identifiers[2].location.line).toBe(3);
    });

    it('resets column to 1 after newline', () => {
      const { tokens } = tokenize('x\ny', 'test.re');
      const second = tokens.find(t => t.value === 'y')!;
      expect(second.location.column).toBe(1);
    });

    it('tracks column correctly within a line', () => {
      const { tokens } = tokenize('x y', 'test.re');
      const y = tokens.find(t => t.value === 'y')!;
      expect(y.location.column).toBe(3);
    });
  });

  describe('whitespace skipping', () => {
    it('skips spaces', () => expect(tokenTypes('  x  ')).toEqual([TokenType.Identifier]));
    it('skips tabs', () => expect(tokenTypes('\tx\t')).toEqual([TokenType.Identifier]));
    it('skips \\r in \\r\\n', () => {
      const types = tokenTypes('x\r\ny');
      expect(types).toEqual([TokenType.Identifier, TokenType.Newline, TokenType.Identifier]);
    });
  });

  describe('multi-token sequences', () => {
    it('tokenizes "function add(a, b)"', () => {
      const types = tokenTypes('function add(a, b)');
      expect(types).toEqual([
        TokenType.Function,
        TokenType.Identifier,
        TokenType.LeftParen,
        TokenType.Identifier,
        TokenType.Comma,
        TokenType.Identifier,
        TokenType.RightParen,
      ]);
    });

    it('includes correct values in sequence', () => {
      const { tokens } = tokenize('x = 42', 'test.re');
      const nonEof = tokens.filter(t => t.type !== TokenType.EOF);
      expect(nonEof.map(t => t.value)).toEqual(['x', '=', '42']);
    });
  });

  describe('location tracking', () => {
    it('records filename in location', () => {
      const { tokens } = tokenize('x', 'myfile.re');
      expect(tokens[0].location.filename).toBe('myfile.re');
    });

    it('starts at line 1, column 1', () => {
      const t = firstToken('x');
      expect(t.location.line).toBe(1);
      expect(t.location.column).toBe(1);
    });
  });

  describe('error recovery', () => {
    it('produces error for invalid character @ and continues', () => {
      const { tokens, errors } = tokenize('@x', 'test.re');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('@');
      expect(errors[0].stage).toBe('lexer');
      // x still tokenized after error
      expect(tokens.some(t => t.type === TokenType.Identifier && t.value === 'x')).toBe(true);
    });

    it('produces error for standalone !', () => {
      const { errors } = tokenize('!', 'test.re');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('!');
    });

    it('produces error for unterminated string', () => {
      const { errors } = tokenize('"hello', 'test.re');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Unterminated');
      expect(errors[0].stage).toBe('lexer');
    });

    it('error location is correct for invalid character', () => {
      const { errors } = tokenize('x @', 'test.re');
      expect(errors[0].location.column).toBe(3);
      expect(errors[0].location.line).toBe(1);
    });
  });

  describe('EOF token', () => {
    it('always appends EOF at end', () => {
      const { tokens } = tokenize('', 'test.re');
      expect(tokens.at(-1)?.type).toBe(TokenType.EOF);
    });

    it('EOF value is empty string', () => {
      const { tokens } = tokenize('x', 'test.re');
      expect(tokens.at(-1)?.value).toBe('');
    });
  });

  describe('complete program tokenization', () => {
    it('tokenizes a small function correctly', () => {
      const src = 'function add(a, b)\nreturn a + b\nend';
      const types = tokenTypes(src);
      expect(types).toEqual([
        TokenType.Function,
        TokenType.Identifier,   // add
        TokenType.LeftParen,
        TokenType.Identifier,   // a
        TokenType.Comma,
        TokenType.Identifier,   // b
        TokenType.RightParen,
        TokenType.Newline,
        TokenType.Return,
        TokenType.Identifier,   // a
        TokenType.Plus,
        TokenType.Identifier,   // b
        TokenType.Newline,
        TokenType.End,
      ]);
    });
  });

  // P1-S08: New foundation tokens
  describe('P1-S08 new keywords', () => {
    it.each([
      ['for', TokenType.For],
      ['in', TokenType.In],
      ['break', TokenType.Break],
      ['continue', TokenType.Continue],
      ['struct', TokenType.Struct],
      ['enum', TokenType.Enum],
      ['match', TokenType.Match],
      ['const', TokenType.Const],
      ['import', TokenType.Import],
      ['from', TokenType.From],
      ['none', TokenType.None],
      ['some', TokenType.Some],
      ['self', TokenType.Self],
      ['impl', TokenType.Impl],
    ])('tokenizes keyword "%s"', (src, expected) => {
      expect(tokenTypes(src)).toEqual([expected]);
    });
  });

  describe('P1-S08 new symbols and operators', () => {
    it.each([
      ['%', TokenType.Percent],
      ['[', TokenType.LeftBracket],
      [']', TokenType.RightBracket],
      ['{', TokenType.LeftBrace],
      ['}', TokenType.RightBrace],
      [':', TokenType.Colon],
      ['.', TokenType.Dot],
      ['..', TokenType.DotDot],
      ['..=', TokenType.DotDotEquals],
      ['|', TokenType.Pipe],
      ['=>', TokenType.Arrow],
      ['+=', TokenType.PlusEquals],
      ['-=', TokenType.MinusEquals],
      [';', TokenType.Semicolon],
    ])('tokenizes "%s"', (src, expected) => {
      expect(tokenTypes(src)).toEqual([expected]);
    });

    it('# skips the rest of the line (comment — no token emitted)', () => {
      expect(tokenTypes('# this is a comment')).toEqual([]);
    });

    it('# comment followed by newline still emits Newline', () => {
      const types = tokenTypes('# comment\nx');
      expect(types).toEqual([TokenType.Newline, TokenType.Identifier]);
    });

    it('# comment does not consume the newline itself', () => {
      const { tokens } = tokenize('x # comment\ny', 'test.re');
      const identifiers = tokens.filter(t => t.type === TokenType.Identifier);
      expect(identifiers[0]?.value).toBe('x');
      expect(identifiers[1]?.value).toBe('y');
      expect(identifiers[1]?.location.line).toBe(2);
    });

    // P2-S01: Additional comment coverage
    it('# inside a string literal is NOT treated as a comment', () => {
      const { tokens } = tokenize('"hello # world"', 'test.re');
      const strings = tokens.filter(t => t.type === TokenType.String);
      expect(strings).toHaveLength(1);
      expect(strings[0]?.value).toBe('hello # world');
    });

    it('empty comment # followed by newline emits only Newline', () => {
      expect(tokenTypes('#\nx')).toEqual([TokenType.Newline, TokenType.Identifier]);
    });

    it('program with only comments produces no meaningful tokens', () => {
      const { tokens } = tokenize('# first comment\n# second comment\n', 'test.re');
      const meaningful = tokens.filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
      expect(meaningful).toHaveLength(0);
    });

    it('=> does not interfere with standalone = or ==', () => {
      expect(tokenTypes('=')).toEqual([TokenType.Equals]);
      expect(tokenTypes('==')).toEqual([TokenType.EqualsEquals]);
      expect(tokenTypes('=>')).toEqual([TokenType.Arrow]);
    });

    it('+= does not interfere with standalone +', () => {
      expect(tokenTypes('+')).toEqual([TokenType.Plus]);
      expect(tokenTypes('+=')).toEqual([TokenType.PlusEquals]);
    });

    it('-= does not interfere with standalone -', () => {
      expect(tokenTypes('-')).toEqual([TokenType.Minus]);
      expect(tokenTypes('-=')).toEqual([TokenType.MinusEquals]);
    });

    it('.. does not interfere with standalone .', () => {
      expect(tokenTypes('.')).toEqual([TokenType.Dot]);
      expect(tokenTypes('..')).toEqual([TokenType.DotDot]);
      expect(tokenTypes('..=')).toEqual([TokenType.DotDotEquals]);
    });
  });

  // P1-S09: String escape sequences
  describe('P1-S09 string escape sequences', () => {
    it('stores \\n escape as backslash-n in token value', () => {
      const t = firstToken('"hello\\nworld"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('hello\\nworld');
    });

    it('stores \\t escape as backslash-t in token value', () => {
      const t = firstToken('"hello\\tworld"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('hello\\tworld');
    });

    it('stores \\\\ as double-backslash in token value', () => {
      const t = firstToken('"back\\\\slash"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('back\\\\slash');
    });

    it('stores \\" escape and does not end the string', () => {
      const t = firstToken('"say \\"hi\\""');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('say \\"hi\\"');
    });

    it('stores \\r escape as backslash-r in token value', () => {
      const t = firstToken('"line\\rend"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('line\\rend');
    });

    it('produces error for invalid escape sequence', () => {
      const { errors } = tokenize('"bad\\q"', 'test.re');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('Invalid escape sequence');
      expect(errors[0].message).toContain('\\q');
      expect(errors[0].stage).toBe('lexer');
    });

    it('string with \\" does not terminate prematurely', () => {
      const { tokens, errors } = tokenize('"a\\"b"', 'test.re');
      expect(errors).toHaveLength(0);
      const str = tokens.find(t => t.type === TokenType.String);
      expect(str?.value).toBe('a\\"b');
    });

    it('multiple escape sequences in one string', () => {
      const t = firstToken('"\\n\\t\\\\\\r"');
      expect(t.type).toBe(TokenType.String);
      expect(t.value).toBe('\\n\\t\\\\\\r');
    });
  });
});

