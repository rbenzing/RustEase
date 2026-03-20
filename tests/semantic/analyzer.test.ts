import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import { analyze } from '../../src/semantic/analyzer.js';
import { INT, FLOAT, STRING, BOOL, VOID } from '../../src/semantic/types.js';

function analyzeSource(source: string) {
  const { tokens } = tokenize(source, 'test.re');
  const { program } = parse(tokens);
  return analyze(program);
}

describe('analyze()', () => {
  describe('type inference from literals', () => {
    it('infers int from integer literal', () => {
      const result = analyzeSource('function foo()\nx = 10\nend');
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
    });

    it('infers float from float literal', () => {
      const result = analyzeSource('function foo()\nx = 3.14\nend');
      expect(result.variableTypes.get('foo:x')).toEqual(FLOAT);
    });

    it('infers string from string literal', () => {
      const result = analyzeSource('function foo()\nx = "hello"\nend');
      expect(result.variableTypes.get('foo:x')).toEqual(STRING);
    });

    it('infers bool from boolean literal', () => {
      const result = analyzeSource('function foo()\nx = true\nend');
      expect(result.variableTypes.get('foo:x')).toEqual(BOOL);
    });
  });

  describe('type inference from expressions', () => {
    it('infers int from int + int', () => {
      const result = analyzeSource('function foo()\na = 1\nb = 2\nc = a + b\nend');
      expect(result.variableTypes.get('foo:c')).toEqual(INT);
    });

    it('infers bool from comparison', () => {
      const result = analyzeSource('function foo()\na = 1\nb = a > 0\nend');
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });
  });

  describe('scope management', () => {
    it('variable accessible within function', () => {
      const result = analyzeSource('function foo()\nx = 10\ny = x + 1\nend');
      expect(result.errors).toHaveLength(0);
    });

    it('variable used before definition produces error', () => {
      const result = analyzeSource('function foo()\ny = x + 1\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Undefined variable');
    });
  });

  describe('mutability detection', () => {
    it('single assignment is not mutable', () => {
      const result = analyzeSource('function foo()\nx = 10\nend');
      expect(result.mutableVariables.has('foo:x')).toBe(false);
    });

    it('double assignment is mutable', () => {
      const result = analyzeSource('function foo()\nx = 10\nx = 20\nend');
      expect(result.mutableVariables.has('foo:x')).toBe(true);
    });
  });

  describe('function return type inference', () => {
    it('infers return type from explicit return', () => {
      const result = analyzeSource('function foo()\nreturn 42\nend');
      expect(result.functionTypes.get('foo')?.returnType).toEqual(INT);
    });

    it('infers return type from last expression (implicit return)', () => {
      const result = analyzeSource('function foo()\n10 + 20\nend');
      expect(result.functionTypes.get('foo')?.returnType).toEqual(INT);
    });

    it('void return for function with no return', () => {
      const result = analyzeSource('function foo()\nprint(1)\nend');
      expect(result.functionTypes.get('foo')?.returnType).toEqual(VOID);
    });
  });

  describe('parameter type inference', () => {
    it('infers parameter types from call site', () => {
      const result = analyzeSource('function add(a, b)\nreturn a + b\nend\nfunction main()\nadd(1, 2)\nend');
      expect(result.functionTypes.get('add')?.parameterTypes).toEqual([INT, INT]);
    });

    it('defaults uncalled function parameters to i32', () => {
      const result = analyzeSource('function foo(a, b)\nreturn a + b\nend');
      expect(result.functionTypes.get('foo')?.parameterTypes).toEqual([INT, INT]);
    });
  });

  describe('built-in function validation', () => {
    it('print accepts any type', () => {
      const result = analyzeSource('function foo()\nprint(42)\nprint("hi")\nprint(true)\nend');
      expect(result.errors).toHaveLength(0);
    });

    it('length requires string', () => {
      const result = analyzeSource('function foo()\nx = 42\nlength(x)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('length');
    });

    it('to_string accepts any type', () => {
      const result = analyzeSource('function foo()\nto_string(42)\nend');
      expect(result.errors).toHaveLength(0);
    });

    it('redefining built-in name produces error', () => {
      const result = analyzeSource('function print()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('redefine');
    });
  });

  describe('type mismatch errors', () => {
    it('type mismatch in binary op produces error', () => {
      const result = analyzeSource('function foo()\na = 1\nb = "hi"\nc = a + b\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Type mismatch');
    });
  });

  // P2-S02: Modulo operator semantic checks
  describe('modulo operator (P2-S02)', () => {
    it('int % int produces no error and infers int', () => {
      const result = analyzeSource('function foo()\nx = 10 % 3\nend');
      expect(result.errors).toHaveLength(0);
    });

    it('"hello" % 3 produces a semantic error', () => {
      const result = analyzeSource('function foo()\na = "hello"\nb = a % 3\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      const messages = result.errors.map(e => e.message);
      expect(messages.some(m => m.includes('%') || m.includes('numeric') || m.includes('Type mismatch'))).toBe(true);
    });
  });

  describe('main function validation', () => {
    it('main with parameters produces error', () => {
      const result = analyzeSource('function main(x)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('main');
    });
  });

  describe('warnings', () => {
    it('division by literal zero produces warning', () => {
      const result = analyzeSource('function foo()\nx = 10\ny = x / 0\nend');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('zero');
    });
  });

  describe('string methods', () => {
    it('s.length() returns int', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nn = s.length()\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:n')).toEqual(INT);
    });

    it('s.contains(sub) returns bool', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nb = s.contains("ell")\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('s.starts_with(prefix) returns bool', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nb = s.starts_with("he")\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('s.ends_with(suffix) returns bool', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nb = s.ends_with("lo")\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('s.to_upper() returns string', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nu = s.to_upper()\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:u')).toEqual(STRING);
    });

    it('s.to_lower() returns string', () => {
      const result = analyzeSource('function foo()\ns = "HELLO"\nl = s.to_lower()\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:l')).toEqual(STRING);
    });

    it('s.trim() returns string', () => {
      const result = analyzeSource('function foo()\ns = "  hi  "\nt = s.trim()\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:t')).toEqual(STRING);
    });

    it('s.replace(old, new) returns string', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nr = s.replace("l", "r")\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:r')).toEqual(STRING);
    });

    it('s.split(sep) returns array<string>', () => {
      const result = analyzeSource('function foo()\ns = "a,b,c"\nparts = s.split(",")\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:parts')).toEqual({ kind: 'array', elementType: STRING });
    });

    it('s.char_at(idx) returns string', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nc = s.char_at(0)\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:c')).toEqual(STRING);
    });

    it('unknown string method produces error', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nx = s.reverse()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unknown string method');
    });

    it('contains with wrong arg type produces error', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nb = s.contains(42)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'contains' requires a string argument");
    });

    it('char_at with wrong arg type produces error', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nc = s.char_at("x")\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'char_at' requires an int argument");
    });

    it('to_upper with args produces error', () => {
      const result = analyzeSource('function foo()\ns = "hello"\nu = s.to_upper("x")\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'to_upper' takes no arguments");
    });
  });

  describe('complete program', () => {
    it('analyzes multi-function program without errors', () => {
      const source = `function add(a, b)
return a + b
end
function main()
result = add(1, 2)
print(result)
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.functionTypes.get('add')?.returnType).toEqual(INT);
      expect(result.functionTypes.get('main')?.returnType).toEqual(VOID);
    });
  });
});

