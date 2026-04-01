import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import { analyze } from '../../src/semantic/analyzer.js';
import { INT, FLOAT, STRING, BOOL, VOID } from '../../src/semantic/types.js';
import { levenshtein, findClosest } from '../../src/semantic/suggest.js';

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

  describe('variable type annotations (S-11)', () => {
    it('x: int = 5 infers type as int with no errors', () => {
      const result = analyzeSource('function foo()\nx: int = 5\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
    });

    it('items: array<int> = [] resolves type as array<int>, not array<unknown>', () => {
      const result = analyzeSource('function foo()\nitems: array<int> = []\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:items')).toEqual({ kind: 'array', elementType: INT });
    });

    it('x: float = 5 emits a type conflict error (int inferred, float annotated)', () => {
      const result = analyzeSource('function foo()\nx: float = 5\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('conflicts with inferred type');
    });

    it('unannotated variable still infers type correctly', () => {
      const result = analyzeSource('function foo()\nx = 42\nend');
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
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

    it('print with multiple args produces no errors', () => {
      const result = analyzeSource('function foo()\nprint("a", "b")\nend');
      expect(result.errors).toHaveLength(0);
    });

    it('print with 0 args produces an error', () => {
      const result = analyzeSource('function foo()\nprint()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('print');
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

  describe('struct support', () => {
    it('registers struct declaration with fields', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.structDeclarations.has('Point')).toBe(true);
      const fields = result.structDeclarations.get('Point')!;
      expect(fields.get('x')).toEqual(INT);
      expect(fields.get('y')).toEqual(INT);
    });

    it('struct literal creation returns struct type', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: 1, y: 2}
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:p');
      expect(t).toMatchObject({ kind: 'struct', name: 'Point' });
    });

    it('field access on struct returns field type', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: 1, y: 2}
val = p.x
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:val')).toEqual(INT);
    });

    it('unknown struct literal produces error', () => {
      const result = analyzeSource(`function foo()
p = Ghost{x: 1}
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Unknown struct');
    });

    it('missing field in struct literal produces error', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: 1}
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Missing field");
    });

    it('unknown field in struct literal produces error', () => {
      const source = `struct Point
x: int
end
function foo()
p = Point{x: 1, z: 99}
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unknown field");
    });

    it('field type mismatch in struct literal produces error', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: "hello", y: 5}
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Field 'x' expects 'int', got 'string'");
    });

    it('struct literal with correct field types produces no error', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: 5, y: 10}
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
    });

    it('field with unknown type does not produce false positive', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: unknown_var, y: 10}
end`;
      const result = analyzeSource(source);
      // Should not have a field type mismatch error for x (unknown_var resolves to unknown type)
      const typeMismatchErrors = result.errors.filter(e => e.message.includes("expects"));
      expect(typeMismatchErrors).toHaveLength(0);
    });

    it('duplicate struct name produces error', () => {
      const source = `struct Point
x: int
end
struct Point
x: int
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Duplicate struct");
    });
  });

  describe('impl blocks & methods', () => {
    it('impl for unknown struct produces error', () => {
      const source = `impl Ghost
function greet()
end
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("impl for unknown struct");
    });

    it('registers method on struct via impl', () => {
      const source = `struct Counter
count: int
end
impl Counter
function increment()
end
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.implMethods.get('Counter')?.has('increment')).toBe(true);
    });

    it('method call on struct instance returns declared return type', () => {
      const source = `struct Counter
count: int
end
impl Counter
function get_count() -> int
return 0
end
end
function foo()
c = Counter{count: 0}
n = c.get_count()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:n')).toEqual(INT);
    });

    it('detects mutating method when it assigns to self field', () => {
      const source = `struct Counter
count: int
end
impl Counter
function increment()
self.count = self.count + 1
end
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.mutatingMethods.has('Counter.increment')).toBe(true);
    });
  });

  describe('enum support', () => {
    it('registers enum declaration with variants', () => {
      const source = `enum Color
Red
Green
Blue
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.enumTypes.has('Color')).toBe(true);
    });

    it('enum variant access returns enum type', () => {
      const source = `enum Color
Red
Green
Blue
end
function foo()
c = Color.Red
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:c');
      expect(t).toMatchObject({ kind: 'enum', name: 'Color' });
    });

    it('undefined enum access produces error', () => {
      const result = analyzeSource(`function foo()
c = Ghost.Red
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Undefined enum");
    });

    it('undefined variant on known enum produces error', () => {
      const source = `enum Color
Red
Green
end
function foo()
c = Color.Purple
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Undefined variant");
    });
  });

  describe('match statements', () => {
    it('match with literal pattern produces no error', () => {
      const result = analyzeSource(`function foo()
x = 5
match x
1 =>
print("one")
_ =>
print("other")
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('match with wildcard pattern produces no error', () => {
      const result = analyzeSource(`function foo()
x = "hello"
match x
_ =>
print("any")
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('match with enum pattern produces no error', () => {
      const source = `enum Color
Red
Green
end
function foo()
c = Color.Red
match c
Color.Red =>
print("red")
_ =>
print("other")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
    });

    it('match with undefined enum in pattern produces error', () => {
      const result = analyzeSource(`function foo()
x = 1
match x
Ghost.Red =>
print("ghost")
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Undefined enum");
    });

    it('match pattern type mismatch produces error', () => {
      const result = analyzeSource(`function foo()
x = 5
match x
"hello" =>
print("string")
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("does not match");
    });
  });

  describe('data-carrying enum variants (S-12)', () => {
    it('registers data types on enum variants', () => {
      const source = `enum Shape
Circle(float)
Rectangle(float, float)
end
function foo()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      const shapeType = result.enumTypes.get('Shape');
      expect(shapeType).toBeDefined();
      if (shapeType && shapeType.kind === 'enum') {
        const circle = shapeType.variants.find(v => v.name === 'Circle');
        expect(circle).toBeDefined();
        expect(circle!.data).toHaveLength(1);
        const rect = shapeType.variants.find(v => v.name === 'Rectangle');
        expect(rect).toBeDefined();
        expect(rect!.data).toHaveLength(2);
      }
    });

    it('valid data-carrying constructor produces no error', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle(5.0)
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
    });

    it('valid multi-arg constructor produces no error', () => {
      const source = `enum Shape
Rectangle(float, float)
end
function foo()
s = Shape.Rectangle(3.0, 4.0)
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
    });

    it('wrong argument count on constructor produces error', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle(5.0, 3.0)
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toContain('expects 1 argument');
    });

    it('missing arguments on data-carrying variant produces error', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.message).toContain('expects 1 argument');
    });

    it('destructuring in match arm provides correctly typed bindings', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle(5.0)
match s
Shape.Circle(r) =>
x = r
end
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:r')).toEqual(FLOAT);
    });

    it('destructuring with two bindings provides correctly typed bindings', () => {
      const source = `enum Shape
Rectangle(float, float)
end
function foo()
s = Shape.Rectangle(3.0, 4.0)
match s
Shape.Rectangle(w, h) =>
x = w
end
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:w')).toEqual(FLOAT);
      expect(result.variableTypes.get('foo:h')).toEqual(FLOAT);
    });

    it('wrong binding count on destructuring pattern produces error', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle(5.0)
match s
Shape.Circle(r, extra) =>
print("bad")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes('binding'))).toBe(true);
    });

    it('unqualified destructuring pattern binds with correct types', () => {
      const source = `enum Shape
Circle(float)
end
function foo()
s = Shape.Circle(5.0)
match s
Circle(r) =>
x = r
end
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:r')).toEqual(FLOAT);
    });
  });

  describe('match exhaustiveness checking (S-08)', () => {
    it('non-exhaustive match on 3-variant enum produces error listing missing variants', () => {
      const source = `enum Direction
North
South
East
end
function foo()
d = Direction.North
match d
Direction.North =>
print("north")
Direction.South =>
print("south")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      const msg = result.errors.find(e => e.message.includes('Non-exhaustive match'));
      expect(msg).toBeDefined();
      expect(msg!.message).toContain("Direction");
      expect(msg!.message).toContain("'East'");
    });

    it('exhaustive match covering all variants produces no error', () => {
      const source = `enum Color
Red
Green
Blue
end
function foo()
c = Color.Red
match c
Color.Red =>
print("red")
Color.Green =>
print("green")
Color.Blue =>
print("blue")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.filter(e => e.message.includes('Non-exhaustive'))).toHaveLength(0);
    });

    it('match with wildcard _ produces no error even with missing variants', () => {
      const source = `enum Status
Active
Inactive
Pending
end
function foo()
s = Status.Active
match s
Status.Active =>
print("active")
_ =>
print("other")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.filter(e => e.message.includes('Non-exhaustive'))).toHaveLength(0);
    });

    it('match with identifier catch-all produces no error', () => {
      const source = `enum Status
Active
Inactive
end
function foo()
s = Status.Active
match s
Status.Active =>
print("active")
other =>
print("fallback")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.filter(e => e.message.includes('Non-exhaustive'))).toHaveLength(0);
    });

    it('match on non-enum value (int) produces no exhaustiveness error', () => {
      const result = analyzeSource(`function foo()
x = 42
match x
1 =>
print("one")
2 =>
print("two")
end
end`);
      expect(result.errors.filter(e => e.message.includes('Non-exhaustive'))).toHaveLength(0);
    });

    it('match on enum with single variant plus wildcard produces no error', () => {
      const source = `enum Flag
On
Off
end
function foo()
f = Flag.On
match f
Flag.On =>
print("on")
_ =>
print("off")
end
end`;
      const result = analyzeSource(source);
      expect(result.errors.filter(e => e.message.includes('Non-exhaustive'))).toHaveLength(0);
    });
  });

  describe('for loops & ranges', () => {
    it('for loop with int range infers int loop variable', () => {
      const result = analyzeSource(`function foo()
for i in 0..10
print(i)
end
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:i')).toEqual(INT);
    });

    it('for loop over array infers element type for loop variable', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
for item in arr
print(item)
end
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:item')).toEqual(INT);
    });

    it('for loop over string array infers string loop variable', () => {
      const result = analyzeSource(`function foo()
names = ["alice", "bob"]
for name in names
print(name)
end
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:name')).toEqual(STRING);
    });

    it('range with non-int start produces error', () => {
      const result = analyzeSource(`function foo()
for i in "a"..10
print(i)
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Range start must be int");
    });

    it('range with non-int end produces error', () => {
      const result = analyzeSource(`function foo()
for i in 0.."z"
print(i)
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Range end must be int");
    });

    it('for loop over non-iterable type produces error', () => {
      const result = analyzeSource(`function foo()
x = 42
for item in x
print(item)
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot iterate");
    });

    it('for (k, v) over map<string, int> gives key=string and value=int', () => {
      const result = analyzeSource(`function foo()
m: map<string, int> = {"a": 1, "b": 2}
for (k, v) in m
print(k)
print(v)
end
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:k')).toEqual(STRING);
      expect(result.variableTypes.get('foo:v')).toEqual(INT);
    });

    it('for (k, v) over non-map type produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
for (k, v) in arr
print(k)
end
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Destructuring is only supported for map types");
    });
  });

  describe('closures', () => {
    it('closure expression produces function type', () => {
      const result = analyzeSource(`function foo()
f = |x| x + 1
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:f');
      expect(t).toMatchObject({ kind: 'function' });
    });

    it('array.map with closure returns array type', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
mapped = arr.map(|x| x + 1)
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:mapped');
      expect(t).toMatchObject({ kind: 'array' });
    });

    it('array.filter with closure returns same array type', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
filtered = arr.filter(|x| x > 0)
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:filtered');
      expect(t).toMatchObject({ kind: 'array', elementType: INT });
    });

    it('array.map without closure argument produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
mapped = arr.map()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'map' requires exactly 1 closure argument");
    });

    it('array.any with closure returns bool', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
b = arr.any(|x| x > 2)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('array.find with closure returns option type', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
found = arr.find(|x| x > 2)
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:found');
      expect(t).toMatchObject({ kind: 'option' });
    });
  });

  describe('arrays & maps', () => {
    it('array literal infers array type', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:arr')).toEqual({ kind: 'array', elementType: INT });
    });

    it('empty array literal infers array<unknown>', () => {
      const result = analyzeSource(`function foo()
arr = []
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:arr');
      expect(t).toMatchObject({ kind: 'array' });
    });

    it('array indexing returns element type', () => {
      const result = analyzeSource(`function foo()
arr = [10, 20, 30]
x = arr[0]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
    });

    it('array.push marks array as mutable', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2]
arr.push(3)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.mutableVariables.has('foo:arr')).toBe(true);
    });

    it('array.pop marks array as mutable and returns element type', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
v = arr.pop()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.mutableVariables.has('foo:arr')).toBe(true);
      expect(result.variableTypes.get('foo:v')).toEqual(INT);
    });

    it('array.length returns int', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
n = arr.length()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:n')).toEqual(INT);
    });

    it('unknown array method produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
x = arr.sort()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unknown array method");
    });

    it('map literal infers map type', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1, "b": 2}
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:m')).toEqual({ kind: 'map', keyType: STRING, valueType: INT });
    });

    it('empty map literal infers map<unknown,unknown>', () => {
      const result = analyzeSource(`function foo()
m = {}
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:m');
      expect(t).toMatchObject({ kind: 'map' });
    });

    it('map indexing returns value type', () => {
      const result = analyzeSource(`function foo()
m = {"key": 42}
v = m["key"]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:v')).toEqual(INT);
    });

    it('map.contains returns bool', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
b = m.contains("a")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('map.keys returns array of key type', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
k = m.keys()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:k')).toEqual({ kind: 'array', elementType: STRING });
    });

    it('map.values returns array of value type', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
v = m.values()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:v')).toEqual({ kind: 'array', elementType: INT });
    });

    it('map.remove marks map as mutable', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
m.remove("a")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.mutableVariables.has('foo:m')).toBe(true);
    });

    it('map.length returns int', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
n = m.length()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:n')).toEqual(INT);
    });

    it('unknown map method produces error', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
x = m.sort()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unknown map method");
    });

    it('array elements of different types produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, "hello"]
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Array elements must have the same type");
    });
  });

  describe('option & result', () => {
    it('some(x) returns option type wrapping x type', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:opt')).toEqual({ kind: 'option', innerType: INT });
    });

    it('none returns option<unknown>', () => {
      const result = analyzeSource(`function foo()
n = none
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:n');
      expect(t).toMatchObject({ kind: 'option' });
    });

    it('ok(x) returns result type', () => {
      const result = analyzeSource(`function foo()
r = ok(42)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:r')).toEqual({ kind: 'result', okType: INT, errType: STRING });
    });

    it('err(msg) returns result type', () => {
      const result = analyzeSource(`function foo()
r = err("failed")
end`);
      expect(result.errors).toHaveLength(0);
      const t = result.variableTypes.get('foo:r');
      expect(t).toMatchObject({ kind: 'result' });
    });

    it('option.unwrap() returns inner type', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
val = opt.unwrap()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:val')).toEqual(INT);
    });

    it('option.is_some() returns bool', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
b = opt.is_some()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('option.is_none() returns bool', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
b = opt.is_none()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('result.is_ok() returns bool', () => {
      const result = analyzeSource(`function foo()
r = ok(10)
b = r.is_ok()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('result.is_err() returns bool', () => {
      const result = analyzeSource(`function foo()
r = ok(10)
b = r.is_err()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('result.unwrap() returns ok type', () => {
      const result = analyzeSource(`function foo()
r = ok(10)
val = r.unwrap()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:val')).toEqual(INT);
    });

    it('some with wrong arg count produces error', () => {
      const result = analyzeSource(`function foo()
opt = some(1, 2)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'some' requires exactly 1 argument");
    });

    it('unknown option method produces error', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
x = opt.flatten()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unknown option method");
    });
  });

  describe('constants', () => {
    it('global const type is inferred from literal', () => {
      const result = analyzeSource(`const MAX = 100
function foo()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.globalConstants.get('MAX')).toEqual(INT);
    });

    it('global const is visible inside functions', () => {
      const result = analyzeSource(`const GREETING = "hello"
function foo()
x = GREETING
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(STRING);
    });

    it('reassigning global const produces error', () => {
      const result = analyzeSource(`const MAX = 100
function foo()
MAX = 200
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot reassign constant");
    });

    it('const local variable cannot be reassigned', () => {
      const result = analyzeSource(`function foo()
const x = 10
x = 20
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot reassign constant variable");
    });

    // S-03: Negative const literals
    it('const MIN = -5 produces no errors and infers int type (S-03)', () => {
      const result = analyzeSource(`const MIN = -5
function foo()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.globalConstants.get('MIN')).toEqual(INT);
    });

    it('const RATE = -0.5 produces no errors and infers float type (S-03)', () => {
      const result = analyzeSource(`const RATE = -0.5
function foo()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.globalConstants.get('RATE')).toEqual(FLOAT);
    });

    it('negative const is visible and usable inside functions (S-03)', () => {
      const result = analyzeSource(`const MIN = -5
function foo()
x = MIN
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
    });
  });

  describe('break & continue', () => {
    it('break inside while loop is valid', () => {
      const result = analyzeSource(`function foo()
while true
break
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('continue inside while loop is valid', () => {
      const result = analyzeSource(`function foo()
while true
continue
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('break inside for loop is valid', () => {
      const result = analyzeSource(`function foo()
for i in 0..5
break
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('break outside loop produces error', () => {
      const result = analyzeSource(`function foo()
break
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("break can only be used inside a loop");
    });

    it('continue outside loop produces error', () => {
      const result = analyzeSource(`function foo()
continue
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("continue can only be used inside a loop");
    });
  });

  describe('extended built-in functions', () => {
    it('int("42") returns int', () => {
      const result = analyzeSource(`function foo()
x = int("42")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(INT);
    });

    it('float("3.14") returns float', () => {
      const result = analyzeSource(`function foo()
x = float("3.14")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(FLOAT);
    });

    it('string(42) returns string', () => {
      const result = analyzeSource(`function foo()
x = string(42)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:x')).toEqual(STRING);
    });

    it('int with wrong arg type produces error', () => {
      const result = analyzeSource(`function foo()
x = int(true)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'int' requires numeric or string argument");
    });

    it('assert(true) is valid', () => {
      const result = analyzeSource(`function foo()
assert(true)
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('assert with message is valid', () => {
      const result = analyzeSource(`function foo()
assert(true, "should be true")
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('assert with non-bool arg produces error', () => {
      const result = analyzeSource(`function foo()
assert(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'assert' first argument must be bool");
    });

    it('panic("msg") is valid', () => {
      const result = analyzeSource(`function foo()
panic("something went wrong")
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('panic with wrong arg type produces error', () => {
      const result = analyzeSource(`function foo()
panic(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'panic' requires string argument");
    });

    it('read_file returns string', () => {
      const result = analyzeSource(`function foo()
content = read_file("test.txt")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:content')).toEqual(STRING);
    });

    it('write_file with two string args is valid', () => {
      const result = analyzeSource(`function foo()
write_file("test.txt", "hello")
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('file_exists returns bool', () => {
      const result = analyzeSource(`function foo()
b = file_exists("test.txt")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('env("VAR") returns string', () => {
      const result = analyzeSource(`function foo()
v = env("HOME")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:v')).toEqual(STRING);
    });

    it('env_or("VAR", "default") returns string', () => {
      const result = analyzeSource(`function foo()
v = env_or("HOME", "/tmp")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:v')).toEqual(STRING);
    });

    it('args() returns array<string>', () => {
      const result = analyzeSource(`function foo()
a = args()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:a')).toEqual({ kind: 'array', elementType: STRING });
    });

    it('args_count() returns int', () => {
      const result = analyzeSource(`function foo()
n = args_count()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:n')).toEqual(INT);
    });

    it('read_line() returns string', () => {
      const result = analyzeSource(`function foo()
line = read_line()
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:line')).toEqual(STRING);
    });

    it('prompt("msg") returns string', () => {
      const result = analyzeSource(`function foo()
answer = prompt("Enter name: ")
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:answer')).toEqual(STRING);
    });

    it('read_line with args produces error', () => {
      const result = analyzeSource(`function foo()
line = read_line("extra")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'read_line' takes no arguments");
    });

    it('args with args produces error', () => {
      const result = analyzeSource(`function foo()
a = args("extra")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'args' takes no arguments");
    });

    it('env with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
v = env(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'env' requires string argument");
    });

    it('read_file with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
content = read_file(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'read_file' requires string argument");
    });

    it('string() with wrong arg count produces error', () => {
      const result = analyzeSource(`function foo()
s = string()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'string' requires exactly 1 argument");
    });

    it('assert(42) with non-bool first arg produces error', () => {
      const result = analyzeSource(`function foo()
assert(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'assert' first argument must be bool");
    });

    it('assert(true, 42) with non-string second arg produces error', () => {
      const result = analyzeSource(`function foo()
assert(true, 42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'assert' second argument must be string");
    });

    it('panic(42) with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
panic(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'panic' requires string argument");
    });

    it('env_or("VAR", 42) with non-string second arg produces error', () => {
      const result = analyzeSource(`function foo()
v = env_or("HOME", 42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'env_or' second argument must be string");
    });

    it('prompt(42) with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
v = prompt(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'prompt' requires string argument");
    });

    it('write_file(42, "data") with non-string first arg produces error', () => {
      const result = analyzeSource(`function foo()
write_file(42, "data")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'write_file' first argument must be string");
    });

    it('write_file("path", 42) with non-string second arg produces error', () => {
      const result = analyzeSource(`function foo()
write_file("path", 42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'write_file' second argument must be string");
    });

    it('append_file(42, "data") with non-string first arg produces error', () => {
      const result = analyzeSource(`function foo()
append_file(42, "data")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'append_file' first argument must be string");
    });

    it('append_file("path", 42) with non-string second arg produces error', () => {
      const result = analyzeSource(`function foo()
append_file("path", 42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'append_file' second argument must be string");
    });

    it('file_exists(42) with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
b = file_exists(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'file_exists' requires string argument");
    });

    it('err(42) with non-string arg produces error', () => {
      const result = analyzeSource(`function foo()
r = err(42)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'err' requires a string argument");
    });

    it('ok() with wrong arg count produces error', () => {
      const result = analyzeSource(`function foo()
r = ok()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'ok' requires exactly 1 argument");
    });
  });

  describe('index assignment', () => {
    it('array index assignment with correct type produces no error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
arr[0] = 5
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('map index assignment with correct type produces no error', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
m["a"] = 99
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('map index assignment with wrong value type produces error', () => {
      const result = analyzeSource(`function foo()
m = {"a": 1}
m["a"] = "wrong"
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot assign 'string' to map value of type 'int'");
    });

    it('array index assignment with wrong element type produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
arr[0] = "wrong"
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot assign 'string' to array element of type 'int'");
    });

    it('array index assignment with non-int index produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
arr["x"] = 5
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Array index must be int");
    });

    it('index assignment to non-array/non-map produces error', () => {
      const result = analyzeSource(`function foo()
x = 42
x[0] = 5
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot index-assign to non-array/map type");
    });

    it('array index assignment marks array as mutable', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
arr[0] = 5
end`);
      expect(result.mutableVariables.has('foo:arr')).toBe(true);
    });
  });

  describe('field assignment', () => {
    it('field assignment on struct marks variable as mutable', () => {
      const source = `struct Point
x: int
y: int
end
function foo()
p = Point{x: 1, y: 2}
p.x = 10
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.mutableVariables.has('foo:p')).toBe(true);
    });

    it('field assignment to unknown field produces error', () => {
      const source = `struct Point
x: int
end
function foo()
p = Point{x: 1}
p.z = 99
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Struct 'Point' has no field 'z'");
    });

    it('field assignment with wrong type produces error', () => {
      const source = `struct Point
x: int
end
function foo()
p = Point{x: 1}
p.x = "hello"
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot assign 'string' to field 'x' of type 'int'");
    });

    it('field assignment on non-struct variable does not crash', () => {
      const result = analyzeSource(`function foo()
x = 42
x.y = 10
end`);
      // Should not throw; may or may not produce errors, but no crash
      expect(result).toBeDefined();
    });
  });

  describe('array method additional paths', () => {
    it('arr.reduce(0, closure) returns type of initial value', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
sum = arr.reduce(0, |acc, x| acc + x)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:sum')).toEqual(INT);
    });

    it('arr.all(closure) returns bool', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
b = arr.all(|x| x > 0)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
    });

    it('arr.push with wrong element type produces error', () => {
      const result = analyzeSource(`function foo()
arr = [1, 2, 3]
arr.push("wrong")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot push 'string' to array of 'int'");
    });
  });

  describe('option method additional paths', () => {
    it('opt.unwrap() with args produces error', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
val = opt.unwrap(99)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'unwrap' takes no arguments");
    });

    it('opt.unwrap_or(default) returns inner type', () => {
      const result = analyzeSource(`function foo()
opt = some(42)
val = opt.unwrap_or(0)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:val')).toEqual(INT);
    });
  });

  describe('result method additional paths', () => {
    it('res.unwrap_or(default) returns ok type', () => {
      const result = analyzeSource(`function foo()
r = ok(42)
val = r.unwrap_or(0)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:val')).toEqual(INT);
    });

    it('res.badMethod() produces error for unknown result method', () => {
      const result = analyzeSource(`function foo()
r = ok(42)
x = r.flatten()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unknown result method");
    });
  });

  describe('struct method additional paths', () => {
    it('calling undefined method on struct produces error', () => {
      const source = `struct Counter
count: int
end
impl Counter
function increment()
end
end
function foo()
c = Counter{count: 0}
c.unknown_method()
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Struct 'Counter' has no method 'unknown_method'");
    });

    it('calling method on int type produces error', () => {
      const result = analyzeSource(`function foo()
x = 42
x.some_method()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot call method 'some_method' on type 'int'");
    });
  });

  describe('field access errors', () => {
    it('accessing unknown field on struct produces error', () => {
      const source = `struct Point
x: int
end
function foo()
p = Point{x: 1}
v = p.z
end`;
      const result = analyzeSource(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Struct 'Point' has no field 'z'");
    });
  });

  describe('collectCallSites paths', () => {
    it('user function call inside binary expression is tracked for parameter inference', () => {
      const result = analyzeSource(`function add(a, b)
return a + b
end
function main()
x = add(1, 2) + 3
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.functionTypes.get('add')?.parameterTypes).toEqual([INT, INT]);
    });

    it('user function call as method argument is tracked for parameter inference', () => {
      const result = analyzeSource(`function make_item()
return 99
end
function main()
items = [1, 2, 3]
items.push(make_item())
end`);
      expect(result.errors).toHaveLength(0);
    });

    it('user function call inside array literal is tracked for parameter inference', () => {
      const result = analyzeSource(`function double(n)
return n * 2
end
function main()
arr = [double(1), double(2)]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.functionTypes.get('double')?.parameterTypes).toEqual([INT]);
    });
  });

  describe('unary and grouped expressions', () => {
    it('not on non-bool produces error', () => {
      const result = analyzeSource(`function foo()
x = not 42
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'not' requires bool operand");
    });

    it('unary minus on non-numeric produces error', () => {
      const result = analyzeSource(`function foo()
s = "hello"
x = -s
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Unary '-' requires numeric operand");
    });

    it('grouped expression infers correct type', () => {
      const result = analyzeSource(`function foo()
x = 5
y = (x + 1)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:y')).toEqual(INT);
    });
  });

  describe('binary expression edge cases', () => {
    it('string concatenation with + returns string type', () => {
      const result = analyzeSource(`function foo()
s = "hello" + " world"
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('foo:s')).toEqual(STRING);
    });

    it('comparison type mismatch produces error', () => {
      const result = analyzeSource(`function foo()
b = 1 == "x"
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("Cannot compare");
    });

    it('and on non-bool operands produces error', () => {
      const result = analyzeSource(`function foo()
b = 1 and 2
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'and' requires bool operands");
    });

    it('or on non-bool operands produces error', () => {
      const result = analyzeSource(`function foo()
b = 1 or 2
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain("'or' requires bool operands");
    });
  });

  describe('additional coverage paths', () => {
    // collectTypes ExpressionStatement: struct receiver marked mutable when calling mutating method (lines 332-338)
    it('calling a mutating struct method marks receiver variable as mutable', () => {
      const source = `struct Counter
count: int
end
impl Counter
function increment()
self.count = self.count + 1
end
end
function main()
c = Counter{count: 0}
c.increment()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.mutableVariables.has('main:c')).toBe(true);
    });

    // collectTypes ReturnStatement: collectCallSites exercised for user func call in return (lines 342-346)
    it('user function call inside return statement is tracked for parameter inference', () => {
      const result = analyzeSource(`function double(x)
return x * 2
end
function main()
return double(5)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.functionTypes.get('double')?.parameterTypes).toEqual([INT]);
    });

    // collectTypes MatchStatement: arm bodies are processed in pass 1 (lines 318-322)
    it('match statement arm bodies are collected in pass 1', () => {
      const result = analyzeSource(`function main()
x = 1
match x
1 =>
msg = "one"
_ =>
msg = "other"
end
end`);
      expect(result.errors).toHaveLength(0);
    });

    // inferExprType SelfExpression: self in method body returns struct type (line 1033-1034)
    it('self expression in method body resolves to struct type enabling field access', () => {
      const source = `struct Point
x: int
y: int
end
impl Point
function get_x() -> int
return self.x
end
end
function main()
p = Point{x: 5, y: 10}
val = p.get_x()
end`;
      const result = analyzeSource(source);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:val')).toEqual(INT);
    });

    // inferReturnType: return inside for loop body (lines 1452-1455)
    it('return inside for loop body correctly infers function return type', () => {
      const result = analyzeSource(`function find_first()
for i in 0..10
return 42
end
end`);
      expect(result.functionTypes.get('find_first')?.returnType).toEqual(INT);
    });

    // inferReturnType: return inside match arm (lines 1456-1461)
    it('return inside match arm correctly infers function return type', () => {
      const result = analyzeSource(`function check(x)
match x
1 =>
return "one"
_ =>
return "other"
end
end`);
      expect(result.functionTypes.get('check')?.returnType).toEqual(STRING);
    });

    // collectTypes ForStatement: loop var type inferred from non-range iterable (lines 304-308)
    // exercised through main() to ensure pass-1 sets variableTypes for main:x
    it('for loop over array variable infers loop var element type in pass 1', () => {
      const result = analyzeSource(`function main()
items = [1, 2, 3]
for x in items
y = x + 1
end
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:x')).toEqual(INT);
    });
  });

  describe('stmtsMutateSelf — nested mutation detection', () => {
    it('detects mutation through if thenBranch', () => {
      const result = analyzeSource(`struct Player
  hp: int
end
impl Player
  function heal_if_low()
    if self.hp < 50
      self.hp = 100
    end
  end
end`);
      expect(result.mutatingMethods.has('Player.heal_if_low')).toBe(true);
    });

    it('detects mutation through while loop body', () => {
      const result = analyzeSource(`struct Acc
  val: int
end
impl Acc
  function add_until(target)
    while self.val < target
      self.val = self.val + 1
    end
  end
end`);
      expect(result.mutatingMethods.has('Acc.add_until')).toBe(true);
    });

    it('detects mutation through for loop body', () => {
      const result = analyzeSource(`struct Bag
  total: int
end
impl Bag
  function add_all(items)
    for x in items
      self.total = self.total + x
    end
  end
end`);
      expect(result.mutatingMethods.has('Bag.add_all')).toBe(true);
    });
  });

  describe('impl method with type annotations', () => {
    it('stores annotated return type and param types in implMethods', () => {
      const result = analyzeSource(`struct Math
  x: int
end
impl Math
  function add(n: int) -> int
    return 0
  end
end
function main()
  m = Math { x: 10 }
end`);
      expect(result.implMethods.get('Math')?.get('add')?.returnType).toEqual(INT);
      expect(result.implMethods.get('Math')?.get('add')?.parameterTypes[0]).toEqual(INT);
    });
  });

  describe('builtin error validation — type mismatch on second arguments', () => {
    it('env_or errors when second argument is not string', () => {
      const result = analyzeSource(`function main()
  env_or("HOME", 42)
end`);
      expect(result.errors.some(e => e.message.includes("'env_or' second argument must be string"))).toBe(true);
    });

    it('write_file errors when second argument is not string', () => {
      const result = analyzeSource(`function main()
  write_file("path", 42)
end`);
      expect(result.errors.some(e => e.message.includes("'write_file' second argument must be string"))).toBe(true);
    });

    it('append_file errors when second argument is not string', () => {
      const result = analyzeSource(`function main()
  append_file("path", 42)
end`);
      expect(result.errors.some(e => e.message.includes("'append_file' second argument must be string"))).toBe(true);
    });
  });

  describe('err() with non-string argument', () => {
    it('errors when err() receives a non-string argument', () => {
      const result = analyzeSource(`function main()
  x = err(42)
end`);
      expect(result.errors.some(e => e.message.includes("'err' requires a string argument"))).toBe(true);
    });
  });

  describe('ClosureExpression with array body (multi-statement)', () => {
    it('handles closure with multi-statement body without crashing', () => {
      const result = analyzeSource(`function main()
  items = [1, 2, 3]
  doubled = items.map(|x| { y = x * 2; y })
end`);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('NoneLiteral type', () => {
    it('infers option type for none literal', () => {
      const result = analyzeSource(`function main()
  x = none
end`);
      expect(result.variableTypes.get('main:x')).toEqual({ kind: 'option', innerType: { kind: 'unknown' } });
    });
  });

  describe('closure variable call', () => {
    it('calls a variable that holds a closure without errors', () => {
      const result = analyzeSource(`function main()
  double = |x| x * 2
  result = double(5)
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:result')).toBeDefined();
    });
  });

  describe('map and array heterogeneous type errors', () => {
    it('errors on map with heterogeneous values', () => {
      const result = analyzeSource(`function main()
  m = {"a": 1, "b": "two"}
end`);
      expect(result.errors.some(e => e.message.includes('Map values must have the same type'))).toBe(true);
    });

    it('errors on map with heterogeneous keys', () => {
      const result = analyzeSource(`function main()
  m = {1: "a", "b": "c"}
end`);
      expect(result.errors.some(e => e.message.includes('Map keys must have the same type'))).toBe(true);
    });

    it('errors on array with heterogeneous elements', () => {
      const result = analyzeSource(`function main()
  arr = [1, "two", 3]
end`);
      expect(result.errors.some(e => e.message.includes('Array elements must have the same type'))).toBe(true);
    });
  });

  describe('index expression type errors', () => {
    it('errors when indexing into a non-array/map type', () => {
      const result = analyzeSource(`function main()
  x = 42
  y = x[0]
end`);
      expect(result.errors.some(e => e.message.includes('Cannot index into non-array/map type'))).toBe(true);
    });

    it('errors when using non-int index on array', () => {
      const result = analyzeSource(`function main()
  arr = [1, 2, 3]
  y = arr["bad"]
end`);
      expect(result.errors.some(e => e.message.includes('Array index must be int'))).toBe(true);
    });

    it('errors on map key type mismatch', () => {
      const result = analyzeSource(`function main()
  m = {"a": 1, "b": 2}
  x = m[42]
end`);
      expect(result.errors.some(e => e.message.includes("Map key must be 'string'"))).toBe(true);
    });
  });

  describe('array slicing (S-15)', () => {
    it('arr[1..3] on array<int> returns array<int>', () => {
      const result = analyzeSource(`function main()
arr = [1, 2, 3, 4, 5]
s = arr[1..3]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:s')).toEqual({ kind: 'array', elementType: INT });
    });

    it('arr[1..=3] on array<int> returns array<int> (inclusive)', () => {
      const result = analyzeSource(`function main()
arr = [1, 2, 3, 4, 5]
s = arr[1..=3]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:s')).toEqual({ kind: 'array', elementType: INT });
    });

    it('arr[0] still returns element type int (regression)', () => {
      const result = analyzeSource(`function main()
arr = [10, 20, 30]
x = arr[0]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:x')).toEqual(INT);
    });

    it('arr[1..3] on array<string> returns array<string>', () => {
      const result = analyzeSource(`function main()
words = ["a", "b", "c", "d"]
s = words[1..3]
end`);
      expect(result.errors).toHaveLength(0);
      expect(result.variableTypes.get('main:s')).toEqual({ kind: 'array', elementType: STRING });
    });
  });

  describe('unreachable code detection (S-05)', () => {
    it('warns on code after return in function body', () => {
      const result = analyzeSource(`function foo()
return 1
x = 2
end`);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('Unreachable') && w.message.includes('return'))).toBe(true);
    });

    it('warns on code after break in while loop', () => {
      const result = analyzeSource(`function foo()
while true
break
x = 2
end
end`);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('Unreachable') && w.message.includes('break'))).toBe(true);
    });

    it('warns on code after continue in for loop', () => {
      const result = analyzeSource(`function foo()
for i in [1, 2, 3]
continue
x = 2
end
end`);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.message.includes('Unreachable') && w.message.includes('continue'))).toBe(true);
    });

    it('produces no warning when no unreachable code exists', () => {
      const result = analyzeSource(`function foo()
x = 1
return x
end`);
      expect(result.warnings.filter(w => w.message.includes('Unreachable'))).toHaveLength(0);
    });

    it('emits only one warning per block even with multiple statements after terminal', () => {
      const result = analyzeSource(`function foo()
return 1
x = 2
y = 3
end`);
      const unreachableWarnings = result.warnings.filter(w => w.message.includes('Unreachable'));
      expect(unreachableWarnings).toHaveLength(1);
    });
  });

  describe('unused variable warnings (S-04)', () => {
    it('unused variable produces a warning containing "never used" and the variable name', () => {
      const result = analyzeSource(`function foo()
x = 5
end`);
      const warn = result.warnings.find(w => w.message.includes('never used') && w.message.includes("'x'"));
      expect(warn).toBeDefined();
    });

    it('used variable produces no unused warning', () => {
      const result = analyzeSource(`function foo()
x = 5
print(x)
end`);
      expect(result.warnings.every(w => !w.message.includes('never used'))).toBe(true);
    });

    it('underscore-prefixed variable produces no unused warning', () => {
      const result = analyzeSource(`function foo()
_x = 5
end`);
      expect(result.warnings.every(w => !w.message.includes('never used'))).toBe(true);
    });

    it('unused for-loop variable produces a warning', () => {
      const result = analyzeSource(`function foo()
for i in [1, 2, 3]
print("hello")
end
end`);
      const warn = result.warnings.find(w => w.message.includes('never used') && w.message.includes("'i'"));
      expect(warn).toBeDefined();
    });

    it('multiple unused variables produce multiple warnings', () => {
      const result = analyzeSource(`function foo()
x = 5
y = 10
end`);
      const unusedWarnings = result.warnings.filter(w => w.message.includes('never used'));
      expect(unusedWarnings.length).toBeGreaterThanOrEqual(2);
    });

    it('unused function parameters produce no warning', () => {
      const result = analyzeSource(`function foo(x, y)
end`);
      expect(result.warnings.every(w => !w.message.includes('never used'))).toBe(true);
    });
  });

  describe('"Did You Mean?" suggestions for undefined variables (S-07)', () => {
    it('typo in variable name suggests closest known variable', () => {
      const result = analyzeSource(`function foo()
name = "Alice"
print(naem)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors.find(e => e.message.includes('Undefined variable'));
      expect(err).toBeDefined();
      expect(err!.message).toContain("did you mean 'name'");
    });

    it('completely unknown variable name produces no suggestion', () => {
      const result = analyzeSource(`function foo()
x = completely_wrong_name
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors.find(e => e.message.includes('Undefined variable'));
      expect(err).toBeDefined();
      expect(err!.message).not.toContain('did you mean');
    });
  });

  describe('"Did You Mean?" suggestions for undefined functions (S-07)', () => {
    it('typo in builtin function name suggests correct builtin', () => {
      const result = analyzeSource(`function foo()
prnt("hello")
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors.find(e => e.message.includes('Undefined function'));
      expect(err).toBeDefined();
      expect(err!.message).toContain("did you mean 'print'");
    });

    it('tostring typo suggests to_string (closest builtin)', () => {
      const result = analyzeSource(`function foo()
x = 42
tostring(x)
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors.find(e => e.message.includes('Undefined function'));
      expect(err).toBeDefined();
      expect(err!.message).toContain("did you mean 'to_string'");
    });

    it('completely unknown function name produces no suggestion', () => {
      const result = analyzeSource(`function foo()
totally_unknown_func()
end`);
      expect(result.errors.length).toBeGreaterThan(0);
      const err = result.errors.find(e => e.message.includes('Undefined function'));
      expect(err).toBeDefined();
      expect(err!.message).not.toContain('did you mean');
    });
  });
});

describe('analyze() — if expressions (S-13)', () => {
  it('infers the type of an if expression from the then-branch', () => {
    const result = analyzeSource('function foo()\ncount = 5\nx = if count > 0 then count else 0\nend');
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:x')).toEqual(INT);
  });

  it('infers string type from an if expression with string branches', () => {
    const result = analyzeSource('function foo()\nflag = true\ns = if flag then "yes" else "no"\nend');
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:s')).toEqual(STRING);
  });

  it('reports error when then and else branches have different types', () => {
    const result = analyzeSource('function foo()\ncount = 5\nx = if count > 0 then count else "zero"\nend');
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors.find(e => e.message.includes('Conditional expression branches have different types'));
    expect(err).toBeDefined();
    expect(err!.message).toContain("'int'");
    expect(err!.message).toContain("'string'");
  });

  it('reports no error when branch types match', () => {
    const result = analyzeSource('function foo()\na = 1\nb = 2\nx = if a > b then a else b\nend');
    const branchErrors = result.errors.filter(e => e.message.includes('Conditional expression'));
    expect(branchErrors).toHaveLength(0);
  });
});

describe('analyze() — default parameter values (S-14)', () => {
  it('calling greet() with default param produces no error', () => {
    const src = 'function greet(name = "World")\nprint(name)\nend\nfunction main()\ngreet()\nend';
    const result = analyzeSource(src);
    const argErrors = result.errors.filter(e => e.message.includes('argument'));
    expect(argErrors).toHaveLength(0);
  });

  it('calling greet("Alice") overriding default produces no error', () => {
    const src = 'function greet(name = "World")\nprint(name)\nend\nfunction main()\ngreet("Alice")\nend';
    const result = analyzeSource(src);
    const argErrors = result.errors.filter(e => e.message.includes('argument'));
    expect(argErrors).toHaveLength(0);
  });

  it('calling add(1) with one required and one default param produces no error', () => {
    const src = 'function add(a, b = 0)\nreturn a + b\nend\nfunction main()\nx = add(1)\nend';
    const result = analyzeSource(src);
    const argErrors = result.errors.filter(e => e.message.includes('argument'));
    expect(argErrors).toHaveLength(0);
  });

  it('calling add() missing required param produces error', () => {
    const src = 'function add(a, b = 0)\nreturn a + b\nend\nfunction main()\nx = add()\nend';
    const result = analyzeSource(src);
    const argErrors = result.errors.filter(e => e.message.includes('argument'));
    expect(argErrors.length).toBeGreaterThan(0);
    expect(argErrors[0]!.message).toContain("'add'");
  });

  it('non-default param after default param produces error', () => {
    const src = 'function bad(a = 1, b)\nreturn a + b\nend';
    const result = analyzeSource(src);
    const orderErrors = result.errors.filter(e => e.message.includes('Non-default parameter'));
    expect(orderErrors.length).toBeGreaterThan(0);
  });

  it('infers param type from default value expression', () => {
    const src = 'function greet(name = "World")\nprint(name)\nend';
    const result = analyzeSource(src);
    const paramType = result.functionTypes.get('greet')?.parameterTypes[0];
    expect(paramType).toEqual({ kind: 'primitive', name: 'string' });
  });

  it('paramDefaults is populated in functionTypes', () => {
    const src = 'function greet(name = "World")\nprint(name)\nend';
    const result = analyzeSource(src);
    const fnInfo = result.functionTypes.get('greet');
    expect(fnInfo?.paramDefaults).toHaveLength(1);
    expect(fnInfo?.paramDefaults?.[0]).toBeDefined();
  });
});

describe('levenshtein()', () => {
  it('returns 0 for two empty strings', () => {
    expect(levenshtein('', '')).toBe(0);
  });

  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('returns 1 for a single substitution', () => {
    expect(levenshtein('abc', 'abd')).toBe(1);
  });

  it('returns 3 for kitten → sitting', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
});

describe('findClosest()', () => {
  it('returns the closest candidate within threshold', () => {
    expect(findClosest('naem', ['name', 'age', 'foo'])).toBe('name');
  });

  it('returns null when all candidates exceed the threshold', () => {
    expect(findClosest('xyz', ['name', 'age', 'foo'])).toBeNull();
  });
});



// ─── Tuple support (S-17) ────────────────────────────────────────────────────

describe('analyze() — tuple literals (S-17)', () => {
  it('(1, "hello") infers tuple type with int and string elements', () => {
    const result = analyzeSource(`function foo()
t = (1, "hello")
end`);
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:t')).toEqual({
      kind: 'tuple',
      elements: [INT, STRING],
    });
  });

  it('(1, 2, 3) infers tuple type with three int elements', () => {
    const result = analyzeSource(`function foo()
t = (1, 2, 3)
end`);
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:t')).toEqual({
      kind: 'tuple',
      elements: [INT, INT, INT],
    });
  });

  it('t.0 access on tuple returns first element type', () => {
    const result = analyzeSource(`function foo()
t = (1, "hello")
x = t.0
end`);
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:x')).toEqual(INT);
  });

  it('t.1 access on tuple returns second element type', () => {
    const result = analyzeSource(`function foo()
t = (1, "hello")
s = t.1
end`);
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:s')).toEqual(STRING);
  });

  it('tuple with bool element infers bool type at that index', () => {
    const result = analyzeSource(`function foo()
t = (42, true)
b = t.1
end`);
    expect(result.errors).toHaveLength(0);
    expect(result.variableTypes.get('foo:b')).toEqual(BOOL);
  });

  it('out-of-range tuple index produces error', () => {
    const result = analyzeSource(`function foo()
t = (1, 2)
x = t.5
end`);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain('out of range');
  });
});
