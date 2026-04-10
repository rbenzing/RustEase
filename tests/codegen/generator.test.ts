import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import { analyze } from '../../src/semantic/analyzer.js';
import { generate } from '../../src/codegen/generator.js';

function compileToRust(source: string): string {
  const { tokens } = tokenize(source, 'test.re');
  const { program } = parse(tokens);
  const analysis = analyze(program);
  return generate(program, analysis);
}

describe('generate()', () => {
  describe('function declarations', () => {
    it('generates a simple function with no params and no body', () => {
      const rust = compileToRust('function foo()\nend');
      expect(rust).toContain('fn foo() {');
      expect(rust).toContain('}');
    });

    it('generates fn main() without return type', () => {
      const rust = compileToRust('function main()\nend');
      expect(rust).toContain('fn main() {');
      expect(rust).not.toMatch(/fn main\(\).*->/);
    });

    it('generates function with typed parameters and return type', () => {
      const rust = compileToRust('function add(a, b)\nreturn a + b\nend');
      expect(rust).toMatch(/fn add\(a: i32, b: i32\) -> i32/);
    });

    it('generates function with void return type — no annotation', () => {
      const rust = compileToRust('function foo()\nx = 1\nend');
      expect(rust).toMatch(/fn foo\(\) \{/);
      expect(rust).not.toMatch(/fn foo\(\) -> /);
    });
  });

  describe('variable declarations', () => {
    it('generates let x: i32 = 10; for immutable variable', () => {
      const rust = compileToRust('function foo()\nx = 10\nend');
      expect(rust).toContain('let x: i32 = 10;');
    });

    it('generates let mut x: i32 = 10; for mutable variable', () => {
      const rust = compileToRust('function foo()\nx = 10\nx = 20\nend');
      expect(rust).toContain('let mut x: i32 = 10;');
    });

    it('generates reassignment without let', () => {
      const rust = compileToRust('function foo()\nx = 10\nx = 20\nend');
      const lines = rust.split('\n');
      const reassign = lines.find(l => l.trim() === 'x = 20;');
      expect(reassign).toBeDefined();
      expect(reassign).not.toContain('let');
    });

    it('generates correct types for various literals', () => {
      const rust = compileToRust('function foo()\na = 3.14\nb = true\nend');
      expect(rust).toContain('let a: f64 = 3.14;');
      expect(rust).toContain('let b: bool = true;');
    });
  });

  describe('return statements', () => {
    it('generates explicit return statement', () => {
      const rust = compileToRust('function foo()\nreturn 42\nend');
      expect(rust).toContain('return 42;');
    });

    it('generates implicit return — last expression without semicolon', () => {
      const rust = compileToRust('function foo()\n42\nend');
      const lines = rust.split('\n').map(l => l.trim()).filter(Boolean);
      const last = lines[lines.length - 2]; // before closing '}'
      expect(last).toBe('42');
    });
  });

  describe('if / else / else if', () => {
    it('generates if statement', () => {
      const rust = compileToRust('function foo()\nif true\nx = 1\nend\nend');
      expect(rust).toContain('if true {');
      expect(rust).toContain('let x: i32 = 1;');
    });

    it('generates if/else statement', () => {
      const rust = compileToRust('function foo()\nif true\nx = 1\nelse\nx = 2\nend\nend');
      expect(rust).toContain('if true {');
      expect(rust).toContain('} else {');
    });

    it('generates if/else if/else statement', () => {
      const rust = compileToRust('function foo()\nif true\nx = 1\nelse if false\nx = 2\nelse\nx = 3\nend\nend');
      expect(rust).toContain('} else if false {');
      expect(rust).toContain('} else {');
    });
  });

  describe('while loops', () => {
    it('generates while loop', () => {
      const rust = compileToRust('function foo()\nx = 0\nwhile x > 0\nx = x - 1\nend\nend');
      expect(rust).toContain('while x > 0 {');
    });
  });

  describe('binary expressions', () => {
    it('generates arithmetic operators', () => {
      const rust = compileToRust('function foo()\na = 1 + 2\nb = 3 - 1\nc = 2 * 3\nd = 6 / 2\nend');
      expect(rust).toContain('1 + 2');
      expect(rust).toContain('3 - 1');
      expect(rust).toContain('2 * 3');
      expect(rust).toContain('6 / 2');
    });

    // P2-S02: Modulo operator codegen
    it('generates modulo operator as % (P2-S02)', () => {
      const rust = compileToRust('function foo()\nx = 10 % 3\nend');
      expect(rust).toContain('10 % 3');
    });

    it('generates modulo with correct type annotation int % int → i32 (P2-S02)', () => {
      const rust = compileToRust('function main()\nx = 10 % 3\nend');
      expect(rust).toContain('let x: i32 = 10 % 3');
    });

    it('generates comparison operators', () => {
      const rust = compileToRust('function foo()\na = 1 == 1\nb = 1 != 2\nc = 2 > 1\nd = 1 < 2\ne = 2 >= 2\nf = 1 <= 2\nend');
      expect(rust).toContain('1 == 1');
      expect(rust).toContain('1 != 2');
      expect(rust).toContain('2 > 1');
      expect(rust).toContain('1 < 2');
    });

    it('translates and to &&', () => {
      const rust = compileToRust('function foo()\na = true\nb = false\nc = a and b\nend');
      expect(rust).toContain('a && b');
    });

    it('translates or to ||', () => {
      const rust = compileToRust('function foo()\na = true\nb = false\nc = a or b\nend');
      expect(rust).toContain('a || b');
    });
  });

  describe('unary expressions', () => {
    it('translates not x to !x', () => {
      const rust = compileToRust('function foo()\na = true\nb = not a\nend');
      expect(rust).toContain('!a');
    });

    it('generates unary minus', () => {
      const rust = compileToRust('function foo()\na = 5\nb = -a\nend');
      expect(rust).toContain('-a');
    });
  });

  describe('string interpolation', () => {
    it('plain string generates String::from()', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nend');
      expect(rust).toContain('String::from("hello")');
    });

    it('single interpolation slot generates format!()', () => {
      const rust = compileToRust('function foo()\nname = "world"\ns = "Hello {name}"\nend');
      expect(rust).toContain('format!("Hello {}", name)');
    });

    it('multiple interpolation slots generates format!() with all vars', () => {
      const rust = compileToRust('function foo()\nfirst = "Jo"\nlast = "Doe"\ns = "Hi {first} {last}"\nend');
      expect(rust).toContain('format!("Hi {} {}", first, last)');
    });
  });

  describe('built-in functions', () => {
    it('print(x) generates println!("{}", x);', () => {
      const rust = compileToRust('function main()\nx = 42\nprint(x)\nend');
      expect(rust).toContain('println!("{}", x);');
    });

    it('print("Hello {name}") generates println!("Hello {}", name);', () => {
      const rust = compileToRust('function main()\nname = "world"\nprint("Hello {name}")\nend');
      expect(rust).toContain('println!("Hello {}", name);');
    });

    it('print with plain string generates println!("{}", ...)', () => {
      const rust = compileToRust('function main()\nprint("hello")\nend');
      expect(rust).toContain('println!("{}", String::from("hello"));');
    });

    it('print(x) single-arg still works (regression)', () => {
      const rust = compileToRust('function main()\nx = 42\nprint(x)\nend');
      expect(rust).toContain('println!("{}", x);');
    });

    it('print("result:", x) with 2 args generates println!("{} {}", ...)', () => {
      const rust = compileToRust('function main()\nx = 99\nprint("result:", x)\nend');
      expect(rust).toContain('println!("{} {}", String::from("result:"), x);');
    });

    it('print(a, b, c) with 3 args generates println!("{} {} {}", a, b, c)', () => {
      const rust = compileToRust('function main()\na = 1\nb = 2\nc = 3\nprint(a, b, c)\nend');
      expect(rust).toContain('println!("{} {} {}", a, b, c);');
    });

    it('length(x) generates x.len()', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nn = length(s)\nend');
      expect(rust).toContain('s.len()');
    });

    it('to_string(x) generates x.to_string()', () => {
      const rust = compileToRust('function foo()\nn = 42\ns = to_string(n)\nend');
      expect(rust).toContain('n.to_string()');
    });
  });

  describe('indentation', () => {
    it('indents body of function by 4 spaces', () => {
      const rust = compileToRust('function foo()\nx = 1\nend');
      const lines = rust.split('\n');
      const xLine = lines.find(l => l.includes('let x:'));
      expect(xLine).toBeDefined();
      expect(xLine!.startsWith('    ')).toBe(true);
    });

    it('indents nested if block by 8 spaces', () => {
      const rust = compileToRust('function foo()\nif true\nx = 1\nend\nend');
      const lines = rust.split('\n');
      const xLine = lines.find(l => l.includes('let x:'));
      expect(xLine).toBeDefined();
      expect(xLine!.startsWith('        ')).toBe(true);
    });
  });

  describe('string methods', () => {
    it('s.length() generates s.len()', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nn = s.length()\nend');
      expect(rust).toContain('s.len()');
    });

    it('s.contains(sub) generates s.contains(sub.as_str())', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nb = s.contains("ell")\nend');
      expect(rust).toContain('s.contains(String::from("ell").as_str())');
    });

    it('s.starts_with(prefix) generates s.starts_with(prefix.as_str())', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nb = s.starts_with("he")\nend');
      expect(rust).toContain('s.starts_with(String::from("he").as_str())');
    });

    it('s.ends_with(suffix) generates s.ends_with(suffix.as_str())', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nb = s.ends_with("lo")\nend');
      expect(rust).toContain('s.ends_with(String::from("lo").as_str())');
    });

    it('s.to_upper() generates s.to_uppercase()', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nu = s.to_upper()\nend');
      expect(rust).toContain('s.to_uppercase()');
    });

    it('s.to_lower() generates s.to_lowercase()', () => {
      const rust = compileToRust('function foo()\ns = "HELLO"\nl = s.to_lower()\nend');
      expect(rust).toContain('s.to_lowercase()');
    });

    it('s.trim() generates s.trim().to_string()', () => {
      const rust = compileToRust('function foo()\ns = "  hi  "\nt = s.trim()\nend');
      expect(rust).toContain('s.trim().to_string()');
    });

    it('s.replace(old, new) generates s.replace(old.as_str(), new.as_str())', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nr = s.replace("l", "r")\nend');
      expect(rust).toContain('s.replace(String::from("l").as_str(), String::from("r").as_str())');
    });

    it('s.split(sep) generates split chain', () => {
      const rust = compileToRust('function foo()\ns = "a,b,c"\nparts = s.split(",")\nend');
      expect(rust).toContain('s.split(String::from(",").as_str()).map(|s| s.to_string()).collect::<Vec<String>>()');
    });

    it('s.char_at(idx) generates chars().nth() chain', () => {
      const rust = compileToRust('function foo()\ns = "hello"\nc = s.char_at(0)\nend');
      expect(rust).toContain('s.chars().nth(0 as usize).unwrap().to_string()');
    });
  });

  describe('complete multi-function program', () => {
    it('generates multiple functions separated by blank line', () => {
      const src = [
        'function add(a, b)',
        'return a + b',
        'end',
        'function main()',
        'result = add(1, 2)',
        'print(result)',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toMatch(/fn add\(a: i32, b: i32\) -> i32/);
      expect(rust).toContain('fn main()');
      expect(rust).toContain('return a + b;');
      expect(rust).toContain('let result: i32 = add(1, 2);');
      expect(rust).toContain('println!("{}", result);');
      // Blank line between functions
      expect(rust).toMatch(/\}\n\nfn /);
    });
  });

  describe('struct declarations', () => {
    it('generates struct with fields and derive macros', () => {
      const rust = compileToRust('struct Point\nx: int\ny: int\nend\nfunction main()\nend');
      expect(rust).toContain('#[derive(Debug, Clone)]');
      expect(rust).toContain('struct Point {');
      expect(rust).toContain('x: i32,');
      expect(rust).toContain('y: i32,');
    });

    it('maps struct field types correctly — string, float, bool', () => {
      const rust = compileToRust('struct Item\nname: string\nprice: float\nactive: bool\nend\nfunction main()\nend');
      expect(rust).toContain('name: String,');
      expect(rust).toContain('price: f64,');
      expect(rust).toContain('active: bool,');
    });

    it('generates struct literal creation', () => {
      const rust = compileToRust('struct Point\nx: int\ny: int\nend\nfunction main()\np = Point { x: 1, y: 2 }\nend');
      expect(rust).toContain('Point { x: 1, y: 2 }');
    });

    it('generates field access on struct instance', () => {
      const rust = compileToRust('struct Point\nx: int\ny: int\nend\nfunction main()\np = Point { x: 10, y: 20 }\nv = p.x\nend');
      expect(rust).toContain('p.x');
    });

    it('generates field assignment on struct instance', () => {
      const rust = compileToRust('struct Point\nx: int\ny: int\nend\nfunction main()\np = Point { x: 1, y: 2 }\np.x = 10\nend');
      expect(rust).toContain('p.x = 10;');
    });
  });

  describe('impl blocks', () => {
    it('generates impl block with &self method', () => {
      const rust = compileToRust([
        'struct Circle',
        'radius: float',
        'end',
        'impl Circle',
        'function area() -> float',
        'return 3.14 * self.radius * self.radius',
        'end',
        'end',
        'function main()',
        'end',
      ].join('\n'));
      expect(rust).toContain('impl Circle {');
      expect(rust).toContain('fn area(&self) -> f64 {');
    });

    it('generates &mut self for mutating method', () => {
      const rust = compileToRust([
        'struct Circle',
        'radius: float',
        'end',
        'impl Circle',
        'function scale(factor: float)',
        'self.radius = self.radius * factor',
        'end',
        'end',
        'function main()',
        'end',
      ].join('\n'));
      expect(rust).toContain('fn scale(&mut self, factor: f64) {');
    });

    it('generates method with return type annotation', () => {
      const rust = compileToRust([
        'struct Circle',
        'radius: float',
        'end',
        'impl Circle',
        'function area() -> float',
        'return 3.14 * self.radius * self.radius',
        'end',
        'end',
        'function main()',
        'end',
      ].join('\n'));
      expect(rust).toContain('-> f64');
    });

    it('generates self expression as "self"', () => {
      const rust = compileToRust([
        'struct Circle',
        'radius: float',
        'end',
        'impl Circle',
        'function area() -> float',
        'return 3.14 * self.radius * self.radius',
        'end',
        'end',
        'function main()',
        'end',
      ].join('\n'));
      expect(rust).toContain('self.radius');
    });
  });

  describe('enum declarations', () => {
    it('generates enum with variants and derive macros', () => {
      const rust = compileToRust('enum Color\nRed\nGreen\nBlue\nend\nfunction main()\nend');
      expect(rust).toContain('#[derive(Debug, Clone, PartialEq)]');
      expect(rust).toContain('enum Color {');
      expect(rust).toContain('Red,');
      expect(rust).toContain('Green,');
      expect(rust).toContain('Blue,');
    });

    it('generates enum variant access expression', () => {
      const rust = compileToRust('enum Color\nRed\nBlue\nend\nfunction main()\nc = Color.Red\nend');
      expect(rust).toContain('Color::Red');
    });

    it('generates data-carrying enum with tuple variant syntax', () => {
      const rust = compileToRust('enum Shape\nCircle(float)\nRectangle(float, float)\nend\nfunction main()\nend');
      expect(rust).toContain('Circle(f64),');
      expect(rust).toContain('Rectangle(f64, f64),');
    });

    it('generates data-carrying variant constructor', () => {
      const rust = compileToRust([
        'enum Shape',
        'Circle(float)',
        'end',
        'function main()',
        's = Shape.Circle(5.0)',
        'end',
      ].join('\n'));
      expect(rust).toContain('Shape::Circle(5.0)');
    });

    it('generates multi-arg variant constructor', () => {
      const rust = compileToRust([
        'enum Shape',
        'Rectangle(float, float)',
        'end',
        'function main()',
        's = Shape.Rectangle(3.0, 4.0)',
        'end',
      ].join('\n'));
      expect(rust).toContain('Shape::Rectangle(3.0, 4.0)');
    });
  });

  describe('match statements', () => {
    it('generates match with integer literal patterns', () => {
      const rust = compileToRust('function main()\nx = 42\nmatch x\n1 => print("one")\n42 => print("forty-two")\nend\nend');
      expect(rust).toContain('match x {');
      expect(rust).toContain('1 => {');
      expect(rust).toContain('42 => {');
    });

    it('generates match with wildcard pattern', () => {
      const rust = compileToRust('function main()\nx = 5\nmatch x\n1 => print("one")\n_ => print("other")\nend\nend');
      expect(rust).toContain('_ => {');
    });

    it('generates match with enum patterns', () => {
      const rust = compileToRust([
        'enum Op',
        'Add',
        'Sub',
        'end',
        'function main()',
        'op = Op.Add',
        'match op',
        'Op.Add => print("add")',
        'Op.Sub => print("sub")',
        'end',
        'end',
      ].join('\n'));
      expect(rust).toContain('Op::Add => {');
      expect(rust).toContain('Op::Sub => {');
    });

    it('generates match with data-carrying qualified destructuring pattern', () => {
      const rust = compileToRust([
        'enum Shape',
        'Circle(float)',
        'end',
        'function main()',
        's = Shape.Circle(5.0)',
        'match s',
        'Shape.Circle(r) =>',
        'print(r)',
        'end',
        'end',
      ].join('\n'));
      expect(rust).toContain('Shape::Circle(r) => {');
    });

    it('generates match with two-binding destructuring pattern', () => {
      const rust = compileToRust([
        'enum Shape',
        'Rectangle(float, float)',
        'end',
        'function main()',
        's = Shape.Rectangle(3.0, 4.0)',
        'match s',
        'Shape.Rectangle(w, h) =>',
        'print(w)',
        'end',
        'end',
      ].join('\n'));
      expect(rust).toContain('Shape::Rectangle(w, h) => {');
    });

    it('generates match with unqualified destructuring pattern', () => {
      const rust = compileToRust([
        'enum Shape',
        'Circle(float)',
        'end',
        'function main()',
        's = Shape.Circle(5.0)',
        'match s',
        'Circle(r) =>',
        'print(r)',
        'end',
        'end',
      ].join('\n'));
      expect(rust).toContain('Shape::Circle(r) => {');
    });

    it('generates string match with .as_str() conversion', () => {
      const rust = compileToRust('function main()\ns = "hello"\nmatch s\n"hello" => print("hi")\n_ => print("other")\nend\nend');
      expect(rust).toContain('.as_str() {');
      expect(rust).toContain('"hello" => {');
    });
  });

  describe('for loops and ranges', () => {
    it('generates exclusive range for loop', () => {
      const rust = compileToRust('function main()\nfor i in 0..10\nprint(i)\nend\nend');
      expect(rust).toContain('for i in 0..10 {');
    });

    it('generates inclusive range for loop', () => {
      const rust = compileToRust('function main()\nfor i in 1..=5\nprint(i)\nend\nend');
      expect(rust).toContain('for i in 1..=5 {');
    });

    it('generates for loop over collection with borrow', () => {
      const rust = compileToRust('function main()\nnames = ["Alice", "Bob"]\nfor name in names\nprint(name)\nend\nend');
      expect(rust).toContain('for name in &names {');
    });
  });

  describe('closures', () => {
    it('generates single-expression closure', () => {
      const rust = compileToRust('function main()\ndouble = |x| x * 2\nend');
      expect(rust).toContain('|x| x * 2');
    });

    it('generates multi-parameter closure', () => {
      const rust = compileToRust('function main()\nadd = |a, b| a + b\nend');
      expect(rust).toContain('|a, b| a + b');
    });

    it('generates multi-statement closure body', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\nresults = numbers.map(|x| { y = x * 2; y + 1 })\nend');
      expect(rust).toContain('|x| { let y = x * 2; y + 1 }');
    });

    it('generates closure used in .map()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\ndoubled = numbers.map(|x| x * 2)\nend');
      expect(rust).toContain('.iter().map(|x| x * 2).collect::<Vec<_>>()');
    });

    it('generates closure used in .filter()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3, 4]\nevens = numbers.filter(|x| x % 2 == 0)\nend');
      expect(rust).toContain('.iter().filter(|x| x % 2 == 0).cloned().collect::<Vec<_>>()');
    });

    it('generates closure used in .reduce()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\ntotal = numbers.reduce(0, |acc, x| acc + x)\nend');
      expect(rust).toContain('.iter().fold(0, |acc, x| acc + x)');
    });

    it('generates closure used in .any()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\nhas_big = numbers.any(|x| x > 2)\nend');
      expect(rust).toContain('.iter().any(|x| x > 2)');
    });

    it('generates closure used in .all()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\nall_pos = numbers.all(|x| x > 0)\nend');
      expect(rust).toContain('.iter().all(|x| x > 0)');
    });

    it('generates closure used in .find()', () => {
      const rust = compileToRust('function main()\nnumbers = [1, 2, 3]\nfound = numbers.find(|x| x > 1)\nend');
      expect(rust).toContain('.iter().find(|x| x > 1).cloned()');
    });
  });

  describe('array literals and methods', () => {
    it('generates vec! for array literal', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nend');
      expect(rust).toContain('vec![1, 2, 3]');
    });

    it('generates vec![] for empty array', () => {
      const rust = compileToRust('function main()\narr = []\nend');
      expect(rust).toContain('vec![]');
    });

    it('generates array index with as usize cast', () => {
      const rust = compileToRust('function main()\narr = [10, 20, 30]\nv = arr[0]\nend');
      expect(rust).toContain('arr[0 as usize]');
    });

    it('generates arr.push() call', () => {
      const rust = compileToRust('function main()\narr = [1, 2]\narr.push(3)\nend');
      expect(rust).toContain('arr.push(3)');
    });

    it('generates arr.pop() call', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nv = arr.pop()\nend');
      expect(rust).toContain('arr.pop()');
    });

    it('generates arr.length() as arr.len()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nn = arr.length()\nend');
      expect(rust).toContain('arr.len()');
    });
  });

  describe('map literals and methods', () => {
    it('generates HashMap::from for map literal', () => {
      const rust = compileToRust('function main()\nm = { "a": 1, "b": 2 }\nend');
      expect(rust).toContain('HashMap::from(');
    });

    it('emits use std::collections::HashMap for map literal', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nend');
      expect(rust).toContain('use std::collections::HashMap;');
    });

    it('generates HashMap::new() for empty map', () => {
      const rust = compileToRust('function main()\nm = {}\nend');
      expect(rust).toContain('HashMap::new()');
    });

    it('generates map string key indexing', () => {
      const rust = compileToRust('function main()\nscores = { "Alice": 95 }\nv = scores["Alice"]\nend');
      expect(rust).toContain('scores["Alice"]');
    });

    it('generates map insert for index assignment', () => {
      const rust = compileToRust('function main()\nscores = { "Alice": 95 }\nscores["Bob"] = 87\nend');
      expect(rust).toContain('scores.insert(');
    });

    it('generates map .keys() method', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nks = m.keys()\nend');
      expect(rust).toContain('.keys().cloned().collect::<Vec<_>>()');
    });

    it('generates map .values() method', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nvs = m.values()\nend');
      expect(rust).toContain('.values().cloned().collect::<Vec<_>>()');
    });

    it('generates map .contains() as contains_key()', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nb = m.contains("a")\nend');
      expect(rust).toContain('.contains_key(');
    });

    it('generates map .remove() call', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nm.remove("a")\nend');
      expect(rust).toContain('.remove(');
    });
  });

  describe('Option and Result', () => {
    it('generates Some(42) for some(42)', () => {
      const rust = compileToRust('function main()\nv = some(42)\nend');
      expect(rust).toContain('Some(42)');
    });

    it('generates None for none literal', () => {
      const rust = compileToRust('function main()\nv = none\nend');
      expect(rust).toContain('None');
    });

    it('generates Ok(...) for ok()', () => {
      const rust = compileToRust('function main()\nv = ok(100)\nend');
      expect(rust).toContain('Ok(100)');
    });

    it('generates Err(...) for err()', () => {
      const rust = compileToRust('function main()\nv = err("oops")\nend');
      expect(rust).toContain('Err(String::from("oops"))');
    });
  });

  describe('const declarations', () => {
    it('generates const with i32 type for integer', () => {
      const rust = compileToRust('const MAX = 100\nfunction main()\nend');
      expect(rust).toContain('const MAX: i32 = 100;');
    });

    it('generates const with &str type for string', () => {
      const rust = compileToRust('const APP_NAME = "RustEase"\nfunction main()\nend');
      expect(rust).toContain('const APP_NAME: &str = "RustEase";');
    });

    it('generates const with f64 type for float', () => {
      const rust = compileToRust('const PI = 3.14\nfunction main()\nend');
      expect(rust).toContain('const PI: f64 = 3.14;');
    });

    it('generates const with bool type', () => {
      const rust = compileToRust('const FLAG = true\nfunction main()\nend');
      expect(rust).toContain('const FLAG: bool = true;');
    });

    it('emits const declarations before functions', () => {
      const rust = compileToRust('const X = 1\nfunction main()\nend');
      const constIdx = rust.indexOf('const X');
      const fnIdx = rust.indexOf('fn main');
      expect(constIdx).toBeLessThan(fnIdx);
    });
  });

  describe('break and continue', () => {
    it('generates break statement', () => {
      const rust = compileToRust('function main()\nx = 0\nwhile x < 10\nbreak\nend\nend');
      expect(rust).toContain('break;');
    });

    it('generates continue statement', () => {
      const rust = compileToRust('function main()\nfor i in 0..10\ncontinue\nend\nend');
      expect(rust).toContain('continue;');
    });
  });

  describe('built-in functions — assert, panic, file I/O, env, stdin', () => {
    it('generates assert!(cond) for assert(cond)', () => {
      const rust = compileToRust('function main()\nassert(true)\nend');
      expect(rust).toContain('assert!(true);');
    });

    it('generates assert!(cond, msg) for assert(cond, msg)', () => {
      const rust = compileToRust('function main()\nassert(1 == 1, "math works")\nend');
      expect(rust).toContain('assert!(1 == 1, "{}", String::from("math works"));');
    });

    it('generates panic!("{}", msg) for panic(msg)', () => {
      const rust = compileToRust('function main()\npanic("oops")\nend');
      expect(rust).toContain('panic!("{}", String::from("oops"));');
    });

    it('generates std::fs::read_to_string for read_file()', () => {
      const rust = compileToRust('function main()\ncontent = read_file("test.txt")\nend');
      expect(rust).toContain('std::fs::read_to_string(String::from("test.txt")).unwrap()');
    });

    it('generates std::fs::write for write_file()', () => {
      const rust = compileToRust('function main()\nwrite_file("out.txt", "hello")\nend');
      expect(rust).toContain('std::fs::write(String::from("out.txt"), String::from("hello")).unwrap()');
    });

    it('generates std::path::Path::new for file_exists()', () => {
      const rust = compileToRust('function main()\nb = file_exists("test.txt")\nend');
      expect(rust).toContain('std::path::Path::new(&String::from("test.txt")).exists()');
    });

    it('generates std::env::var for env()', () => {
      const rust = compileToRust('function main()\nhome = env("HOME")\nend');
      expect(rust).toContain('std::env::var(String::from("HOME")).unwrap_or_default()');
    });

    it('does not emit use std::env for env() — fully-qualified path is used', () => {
      const rust = compileToRust('function main()\nhome = env("HOME")\nend');
      expect(rust).not.toContain('use std::env;');
    });

    it('generates multi-line block for read_line() assignment', () => {
      const rust = compileToRust('function main()\nline = read_line()\nend');
      expect(rust).toContain('let line: String = {');
      expect(rust).toContain('std::io::stdin().read_line(&mut input).unwrap();');
      expect(rust).toContain('input.trim().to_string()');
    });

    it('does not emit use std::io for read_line() — fully-qualified path is used', () => {
      const rust = compileToRust('function main()\nline = read_line()\nend');
      expect(rust).not.toContain('use std::io;');
    });

    it('generates multi-line block for prompt() assignment', () => {
      const rust = compileToRust('function main()\nname = prompt("Enter name: ")\nend');
      expect(rust).toContain('let name: String = {');
      expect(rust).toContain('print!("{}", String::from("Enter name: "));');
      expect(rust).toContain('input.trim().to_string()');
    });

    it('does not emit use std::io for prompt() — fully-qualified path is used', () => {
      const rust = compileToRust('function main()\nname = prompt("Enter: ")\nend');
      expect(rust).not.toContain('use std::io;');
    });

    it('generates env_or() with fallback value', () => {
      const rust = compileToRust('function main()\nport = env_or("PORT", "8080")\nend');
      expect(rust).toContain('std::env::var(String::from("PORT")).unwrap_or(String::from("8080").to_string())');
    });

    it('generates inline read_line() when used as expression argument', () => {
      const rust = compileToRust('function main()\nprint(read_line())\nend');
      expect(rust).toContain('{ let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }');
    });

    it('generates inline prompt() when used as expression argument', () => {
      const rust = compileToRust('function main()\nprint(prompt("Enter: "))\nend');
      expect(rust).toContain('{ print!("{}", String::from("Enter: ")); std::io::Write::flush(&mut std::io::stdout()).unwrap(); let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }');
    });
  });

  describe('use statement collection through nested control flow', () => {
    it('does not emit use std::io when read_line() is inside an if statement — fully-qualified path used', () => {
      const rust = compileToRust('function main()\nif true\nline = read_line()\nend\nend');
      expect(rust).not.toContain('use std::io;');
    });

    it('does not emit use std::env when env() is inside a while loop body — fully-qualified path used', () => {
      const rust = compileToRust('function main()\nx = 1\nwhile x > 0\nh = env("HOME")\nx = x - 1\nend\nend');
      expect(rust).not.toContain('use std::env;');
    });

    it('does not emit use std::io when read_line() is inside a for loop body — fully-qualified path used', () => {
      const rust = compileToRust('function main()\nfor i in 0..3\nline = read_line()\nend\nend');
      expect(rust).not.toContain('use std::io;');
    });

    it('emits use std::collections::HashMap when map literal is inside a match arm', () => {
      const rust = compileToRust('function main()\nx = 1\nmatch x\n1 => m = { "a": 1 }\n_ => m = {}\nend\nend');
      expect(rust).toContain('use std::collections::HashMap;');
    });

    it('does not emit use std::env when env() is in a return statement — fully-qualified path used', () => {
      const rust = compileToRust('function foo()\nreturn env("HOME")\nend\nfunction main()\nend');
      expect(rust).not.toContain('use std::env;');
    });

    it('does not emit use std::env when env() is inside a single-expression closure body — fully-qualified path used', () => {
      const rust = compileToRust('function main()\nnames = ["HOME"]\nresults = names.map(|k| env(k))\nend');
      expect(rust).not.toContain('use std::env;');
    });

    it('emits use std::collections::HashMap when map is inside a multi-statement closure body', () => {
      const rust = compileToRust([
        'function main()',
        'numbers = [1, 2, 3]',
        'results = numbers.map(|x| { m = { "a": x }; x })',
        'end',
      ].join('\n'));
      expect(rust).toContain('use std::collections::HashMap;');
    });
  });

  describe('index assignment on arrays', () => {
    it('generates arr[idx as usize] = val for array index assignment', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\narr[0] = 5\nend');
      expect(rust).toContain('arr[0 as usize] = 5;');
    });
  });

  describe('append_file as expression statement', () => {
    it('generates OpenOptions block for append_file() call', () => {
      const rust = compileToRust('function main()\nappend_file("log.txt", "data")\nend');
      expect(rust).toContain('std::fs::OpenOptions::new()');
      expect(rust).toContain('.append(true)');
      expect(rust).toContain('file.write_all(String::from("data").as_bytes()).unwrap();');
    });

    it('opens the correct path in append_file block', () => {
      const rust = compileToRust('function main()\nappend_file("out.log", "entry")\nend');
      expect(rust).toContain('.open(String::from("out.log")).unwrap();');
    });
  });

  describe('closure body containing control flow', () => {
    it('generates closure body with if statement', () => {
      const src = [
        'function main()',
        'numbers = [1, 2, 3]',
        'result = numbers.filter(|x| {',
        'if x > 1',
        'return true',
        'end',
        'return false',
        '})',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('if x > 1 { return true; }');
      expect(rust).toContain('return false;');
    });

    it('generates closure body with if/else statement', () => {
      const src = [
        'function main()',
        'numbers = [1, 2, 3]',
        'result = numbers.filter(|x| {',
        'if x > 1',
        'return true',
        'else',
        'return false',
        'end',
        '})',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('if x > 1 { return true; } else { return false; }');
    });

    it('generates closure body with while loop', () => {
      const src = [
        'function main()',
        'numbers = [1, 2, 3]',
        'result = numbers.map(|x| {',
        'y = x',
        'while y > 0',
        'y = y - 1',
        'end',
        'y',
        '})',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('while y > 0 { y = y - 1; }');
    });

    it('generates closure body with for loop', () => {
      const src = [
        'function main()',
        'numbers = [1, 2, 3]',
        'result = numbers.map(|x| {',
        'sum = 0',
        'for i in 0..x',
        'sum = sum + i',
        'end',
        'sum',
        '})',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('for i in 0..x { sum = sum + i; }');
    });
  });

  describe('for loop over map collection', () => {
    it('generates for loop over map variable with & borrow', () => {
      const rust = compileToRust('function main()\nm = { "a": 1 }\nfor k in m\nprint(k)\nend\nend');
      expect(rust).toContain('for k in &m {');
    });

    it('generates for (k, v) in counts.iter() for destructuring', () => {
      const rust = compileToRust('function main()\ncounts: map<string, int> = {"a": 1}\nfor (k, v) in counts\nprint(k)\nend\nend');
      expect(rust).toContain('for (k, v) in counts.iter() {');
    });

    it('generates simple for loop over collection without destructuring (regression)', () => {
      const rust = compileToRust('function main()\nnames = ["Alice", "Bob"]\nfor name in names\nprint(name)\nend\nend');
      expect(rust).toContain('for name in &names {');
      expect(rust).not.toContain('.iter()');
    });
  });

  describe('map with non-string key indexing', () => {
    it('generates m[&key] reference for non-string keyed map access', () => {
      const rust = compileToRust('function main()\nm = { 1: "one", 2: "two" }\nv = m[1]\nend');
      expect(rust).toContain('m[&1]');
    });
  });

  describe('map string key via variable (generateMapStringKey non-literal path)', () => {
    it('generates key.as_str() when indexing a string-keyed map with a variable', () => {
      const rust = compileToRust('function main()\nscores = { "Alice": 95 }\nk = "Alice"\nv = scores[k]\nend');
      expect(rust).toContain('scores[k.as_str()]');
    });
  });

  describe('type conversion built-ins', () => {
    it('generates int() from string arg as parse::<i32>().unwrap()', () => {
      const rust = compileToRust('function main()\ns = "42"\nm = int(s)\nend');
      expect(rust).toContain('s.parse::<i32>().unwrap()');
    });

    it('generates int() from non-string arg as as i32 cast', () => {
      const rust = compileToRust('function main()\nn = 42\nm = int(n)\nend');
      expect(rust).toContain('n as i32');
    });

    it('generates float() from string arg as parse::<f64>().unwrap()', () => {
      const rust = compileToRust('function main()\ns = "3.14"\nf = float(s)\nend');
      expect(rust).toContain('s.parse::<f64>().unwrap()');
    });

    it('generates float() from non-string arg as as f64 cast', () => {
      const rust = compileToRust('function main()\nn = 42\nf = float(n)\nend');
      expect(rust).toContain('n as f64');
    });

    it('generates string() as to_string()', () => {
      const rust = compileToRust('function main()\nn = 42\ns = string(n)\nend');
      expect(rust).toContain('n.to_string()');
    });
  });

  describe('args and args_count built-ins', () => {
    it('generates args() as std::env::args().collect::<Vec<String>>()', () => {
      const rust = compileToRust('function main()\na = args()\nend');
      expect(rust).toContain('std::env::args().collect::<Vec<String>>()');
    });

    it('generates args_count() as std::env::args().count() as i32', () => {
      const rust = compileToRust('function main()\nn = args_count()\nend');
      expect(rust).toContain('std::env::args().count() as i32');
    });
  });

  describe('float literal edge cases', () => {
    it('appends .0 to whole-number float literals so Rust treats them as f64', () => {
      const rust = compileToRust('function main()\nx = 2.0\nend');
      expect(rust).toContain('let x: f64 = 2.0');
    });
  });

  describe('array method calls without closure arg (defensive fallback paths)', () => {
    it('generates .map() with |x| x fallback when no closure arg', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.map()\nend');
      expect(rust).toContain('|x| x');
    });

    it('generates .filter() with |x| true fallback when no closure arg', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.filter()\nend');
      expect(rust).toContain('.iter().filter(|x| true)');
    });

    it('generates .any() with |x| true fallback when no closure arg', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.any()\nend');
      expect(rust).toContain('.iter().any(|x| true)');
    });

    it('generates .all() with |x| true fallback when no closure arg', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.all()\nend');
      expect(rust).toContain('.iter().all(|x| true)');
    });

    it('generates .find() with |x| true fallback when no closure arg', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.find()\nend');
      expect(rust).toContain('.iter().find(|x| true).cloned()');
    });

    it('generates .reduce() with default initial and closure fallback when no args', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.reduce()\nend');
      expect(rust).toContain('.iter().fold(0, |acc, x| acc)');
    });
  });

  describe('const declarations with non-literal expressions (constRustType/generateConstValue fallbacks)', () => {
    it('generates /* unknown */ type and /* unsupported const value */ for non-literal const', () => {
      const rust = compileToRust('const X = -5\nfunction main()\nend');
      expect(rust).toContain('const X:');
    });
  });

  // S-03: Negative const literals
  describe('negative const literals (S-03)', () => {
    it('generates const MIN: i32 = -5; for const MIN = -5', () => {
      const rust = compileToRust('const MIN = -5\nfunction main()\nend');
      expect(rust).toContain('const MIN: i32 = -5;');
    });

    it('generates const RATE: f64 = -0.5; for const RATE = -0.5', () => {
      const rust = compileToRust('const RATE = -0.5\nfunction main()\nend');
      expect(rust).toContain('const RATE: f64 = -0.5;');
    });

    it('positive const X = 10 still generates const X: i32 = 10; (regression)', () => {
      const rust = compileToRust('const X = 10\nfunction main()\nend');
      expect(rust).toContain('const X: i32 = 10;');
    });
  });

  describe('string method calls without args (defensive fallback paths)', () => {
    it('generates contains with empty string fallback when no arg', () => {
      const rust = compileToRust('function main()\ns = "hello"\nb = s.contains()\nend');
      expect(rust).toContain('s.contains("")');
    });

    it('generates split with empty separator fallback when no arg', () => {
      const rust = compileToRust('function main()\ns = "a,b,c"\nparts = s.split()\nend');
      expect(rust).toContain('.split(');
    });

    it('generates char_at with 0 index fallback when no arg', () => {
      const rust = compileToRust('function main()\ns = "hello"\nc = s.char_at()\nend');
      expect(rust).toContain('.chars().nth(0 as usize).unwrap().to_string()');
    });

    it('generates replace() with "" fallbacks when no args', () => {
      const rust = compileToRust('function main()\ns = "hello"\nr = s.replace()\nend');
      expect(rust).toContain('s.replace("", "")');
    });
  });

  describe('generateExprStatement fallback for non-function/method expressions', () => {
    it('emits standalone identifier with semicolon in void main', () => {
      // x as non-last statement in void main → hits generateExprStatement fallback (lines 672-673)
      const rust = compileToRust('function main()\nx = 5\nx\nreturn\nend');
      expect(rust).toContain('x;');
    });
  });

  describe('bool literal match patterns (lines 179-180)', () => {
    it('generates match arms for true and false literal patterns', () => {
      const rust = compileToRust('function main()\nb = true\nmatch b\ntrue => print("yes")\nfalse => print("no")\nend\nend');
      expect(rust).toContain('true => {');
      expect(rust).toContain('false => {');
    });
  });

  describe('getExprType for various expression kinds via print()', () => {
    it('covers GroupedExpression branch in getExprType via print((x))', () => {
      // print((x)) → getExprType called on GroupedExpression → line 34
      const rust = compileToRust('function main()\nx = 42\nprint((x))\nend');
      expect(rust).toContain('println!');
    });

    it('covers UnaryExpression branch in getExprType via int(-n)', () => {
      // int(-n) → getExprType called on UnaryExpression → line 36
      const rust = compileToRust('function main()\nn = 5\nm = int(-n)\nend');
      expect(rust).toContain('as i32');
    });

    it('covers ArrayLiteral branch in getExprType via print([1,2,3])', () => {
      // print([1,2,3]) → getExprType called on ArrayLiteral → lines 74-75
      const rust = compileToRust('function main()\nprint([1, 2, 3])\nend');
      expect(rust).toContain('println!');
    });

    it('covers MapLiteral branch in getExprType via print({a: 1})', () => {
      // print({a: 1}) → getExprType called on MapLiteral → lines 78-83
      const rust = compileToRust('function main()\nprint({"a": 1})\nend');
      expect(rust).toContain('println!');
    });

    it('covers some() branch in getExprType via print(some(5))', () => {
      // print(some(5)) → getExprType called on FunctionCall "some" → lines 55-57
      const rust = compileToRust('function main()\nprint(some(5))\nend');
      expect(rust).toContain('Some(5)');
    });

    it('covers ok() branch in getExprType via print(ok(42))', () => {
      // print(ok(42)) → getExprType called on FunctionCall "ok" → lines 59-62
      const rust = compileToRust('function main()\nprint(ok(42))\nend');
      expect(rust).toContain('Ok(42)');
    });

    it('covers arr.pop() branch in getExprType via print(arr.pop())', () => {
      // print(arr.pop()) → getExprType called on MethodCall "pop" → lines 94-96
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nprint(arr.pop())\nend');
      expect(rust).toContain('arr.pop()');
    });

    it('covers map.keys() branch in getExprType via print(m.keys())', () => {
      // print(m.keys()) → getExprType called on MethodCall "keys" → lines 100-103
      const rust = compileToRust('function main()\nm = {"a": 1}\nprint(m.keys())\nend');
      expect(rust).toContain('.keys()');
    });

    it('covers arr.find() branch in getExprType via print(arr.find(...))', () => {
      // print(arr.find(...)) → getExprType called on MethodCall "find" → lines 121-124
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.find(|x| x == 2)\nprint(result)\nend');
      expect(rust).toContain('.find(');
    });

    it('covers unwrap() branch in getExprType via print(opt.unwrap())', () => {
      // print(opt.unwrap()) → getExprType called on MethodCall "unwrap" → lines 129-131
      const rust = compileToRust('function main()\nopt = some(5)\nprint(opt.unwrap())\nend');
      expect(rust).toContain('.unwrap()');
    });
  });

  // S-10: Triple-quoted multi-line strings
  describe('S-10 triple-quoted strings codegen', () => {
    it('compiles triple-quoted string to valid Rust String::from', () => {
      const rust = compileToRust('function main()\ns = """hello world"""\nend');
      expect(rust).toContain('String::from("hello world")');
    });

    it('compiles triple-quoted string with embedded newline to Rust with \\n escape', () => {
      // Source contains actual newline inside triple-quoted string
      const rust = compileToRust('function main()\ns = """line 1\nline 2"""\nend');
      expect(rust).toContain('\\n');
      expect(rust).toContain('String::from(');
    });

    it('compiles triple-quoted string with interpolation using format!', () => {
      const rust = compileToRust('function main()\nname = "world"\ns = """hello {name}"""\nend');
      expect(rust).toContain('format!("hello {}", name)');
    });

    it('compiles empty triple-quoted string to String::from("")', () => {
      const rust = compileToRust('function main()\ns = """"""\nend');
      expect(rust).toContain('String::from("")');
    });

    it('triple-quoted string assigned and used with print', () => {
      const rust = compileToRust('function main()\nprint("""hello world""")\nend');
      expect(rust).toContain('println!');
      expect(rust).toContain('hello world');
    });
  });

  describe('array slicing (S-15)', () => {
    it('generates items[1..3].to_vec() for exclusive range slice', () => {
      const rust = compileToRust('function main()\nitems = [1, 2, 3, 4, 5]\ns = items[1..3]\nend');
      expect(rust).toContain('items[1..3].to_vec()');
    });

    it('generates items[1..=3].to_vec() for inclusive range slice', () => {
      const rust = compileToRust('function main()\nitems = [1, 2, 3, 4, 5]\ns = items[1..=3]\nend');
      expect(rust).toContain('items[1..=3].to_vec()');
    });

    it('generates arr[0 as usize] for regular int index (regression)', () => {
      const rust = compileToRust('function main()\narr = [10, 20, 30]\nv = arr[0]\nend');
      expect(rust).toContain('arr[0 as usize]');
    });
  });

  describe('default parameter values (S-14)', () => {
    it('generates call with default value inserted when arg is omitted', () => {
      const src = [
        'function greet(name = "World")',
        'print(name)',
        'end',
        'function main()',
        'greet()',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('greet(String::from("World"))');
    });

    it('generates call with provided value when arg is supplied', () => {
      const src = [
        'function greet(name = "World")',
        'print(name)',
        'end',
        'function main()',
        'greet("Alice")',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('greet(String::from("Alice"))');
    });

    it('generates call filling only missing trailing defaults', () => {
      const src = [
        'function add(a, b = 0)',
        'return a + b',
        'end',
        'function main()',
        'x = add(5)',
        'end',
      ].join('\n');
      const rust = compileToRust(src);
      expect(rust).toContain('add(5, 0)');
    });

    it('generates function signature with all params (no default in Rust signature)', () => {
      const src = 'function greet(name = "World")\nprint(name)\nend';
      const rust = compileToRust(src);
      // Rust function signature still takes the param as required
      expect(rust).toContain('fn greet(name: String)');
    });
  });

  describe('if expressions (S-13)', () => {
    it('generates if { } else { } for x = if x > 0 then x else 0', () => {
      const rust = compileToRust('function main()\nx = 5\ny = if x > 0 then x else 0\nend');
      expect(rust).toContain('if x > 0 { x } else { 0 }');
    });

    it('infers correct type for if expression variable', () => {
      const rust = compileToRust('function main()\nx = 5\ny = if x > 0 then x else 0\nend');
      expect(rust).toContain('let y: i32 =');
    });

    it('generates if expression in function argument position', () => {
      const rust = compileToRust('function main()\nx = 5\nprint(if x > 0 then x else 0)\nend');
      expect(rust).toContain('if x > 0 { x } else { 0 }');
    });

    it('generates string if expression correctly', () => {
      const rust = compileToRust('function main()\nflag = true\ns = if flag then "yes" else "no"\nend');
      expect(rust).toContain('if flag { String::from("yes") } else { String::from("no") }');
    });
  });

  describe('Math built-in functions', () => {
    it('sqrt(x) generates x.sqrt()', () => {
      const rust = compileToRust('function main()\nx = 9.0\nr = sqrt(x)\nend');
      expect(rust).toContain('x.sqrt()');
    });

    it('sqrt with float literal generates literal.sqrt()', () => {
      const rust = compileToRust('function main()\nr = sqrt(4.0)\nend');
      expect(rust).toContain('.sqrt()');
    });

    it('pow(x, n) with integer exponent generates x.powi(n)', () => {
      const rust = compileToRust('function main()\nx = 2.0\nr = pow(x, 3)\nend');
      expect(rust).toContain('x.powi(3)');
    });

    it('pow(x, n) with float exponent generates x.powf(n)', () => {
      const rust = compileToRust('function main()\nx = 2.0\nr = pow(x, 0.5)\nend');
      expect(rust).toContain('x.powf(0.5)');
    });

    it('abs(x) generates x.abs()', () => {
      const rust = compileToRust('function main()\nx = -5\nr = abs(x)\nend');
      expect(rust).toContain('x.abs()');
    });

    it('abs with float generates float.abs()', () => {
      const rust = compileToRust('function main()\nx = -3.14\nr = abs(x)\nend');
      expect(rust).toContain('x.abs()');
    });

    it('floor(x) generates x.floor()', () => {
      const rust = compileToRust('function main()\nx = 3.7\nr = floor(x)\nend');
      expect(rust).toContain('x.floor()');
    });

    it('ceil(x) generates x.ceil()', () => {
      const rust = compileToRust('function main()\nx = 3.2\nr = ceil(x)\nend');
      expect(rust).toContain('x.ceil()');
    });

    it('round(x) generates x.round()', () => {
      const rust = compileToRust('function main()\nx = 3.5\nr = round(x)\nend');
      expect(rust).toContain('x.round()');
    });

    it('min_val(a, b) generates a.min(b)', () => {
      const rust = compileToRust('function main()\na = 3\nb = 5\nr = min_val(a, b)\nend');
      expect(rust).toContain('a.min(b)');
    });

    it('min_val with float args generates a.min(b)', () => {
      const rust = compileToRust('function main()\na = 1.5\nb = 2.5\nr = min_val(a, b)\nend');
      expect(rust).toContain('a.min(b)');
    });

    it('max_val(a, b) generates a.max(b)', () => {
      const rust = compileToRust('function main()\na = 3\nb = 5\nr = max_val(a, b)\nend');
      expect(rust).toContain('a.max(b)');
    });

    it('max_val with float args generates a.max(b)', () => {
      const rust = compileToRust('function main()\na = 1.5\nb = 2.5\nr = max_val(a, b)\nend');
      expect(rust).toContain('a.max(b)');
    });

    it('sqrt result can be used in expression', () => {
      const rust = compileToRust('function main()\nx = 16.0\nr = sqrt(x) + 1.0\nend');
      expect(rust).toContain('x.sqrt()');
    });

    it('abs result can be assigned with correct float type', () => {
      const rust = compileToRust('function main()\nx = -2.5\nr = abs(x)\nend');
      expect(rust).toContain('x.abs()');
      expect(rust).toContain('f64');
    });
  });

  describe('Extended collection methods', () => {
    // ── sort ──────────────────────────────────────────────────────────────────
    it('arr.sort() generates arr.sort(); as in-place statement', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\narr.sort()\nend');
      expect(rust).toContain('arr.sort();');
    });

    it('arr.sort() marks receiver array as mutable', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\narr.sort()\nend');
      expect(rust).toContain('let mut arr');
    });

    // ── sort_by ───────────────────────────────────────────────────────────────
    it('arr.sort_by(closure) generates arr.sort_by(|a, b| a.cmp(b)); statement', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\narr.sort_by(|a, b| a.cmp(b))\nend');
      expect(rust).toContain('arr.sort_by(|a, b| a.cmp(b));');
    });

    it('arr.sort_by(closure) marks receiver array as mutable', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\narr.sort_by(|a, b| a.cmp(b))\nend');
      expect(rust).toContain('let mut arr');
    });

    // ── enumerate ─────────────────────────────────────────────────────────────
    it('arr.enumerate() generates arr.iter().enumerate().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.enumerate()\nend');
      expect(rust).toContain('.iter().enumerate().collect::<Vec<_>>()');
    });

    // ── zip ───────────────────────────────────────────────────────────────────
    it('arr.zip(other) generates arr.iter().zip(other.iter()).collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nother = [4, 5, 6]\nresult = arr.zip(other)\nend');
      expect(rust).toContain('.iter().zip(other.iter()).collect::<Vec<_>>()');
    });

    // ── sum ───────────────────────────────────────────────────────────────────
    it('arr.sum() on int array generates arr.iter().sum::<i32>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\ntotal = arr.sum()\nend');
      expect(rust).toContain('.iter().sum::<i32>()');
    });

    it('arr.sum() on float array generates arr.iter().sum::<f64>()', () => {
      const rust = compileToRust('function main()\narr = [1.0, 2.0, 3.0]\ntotal = arr.sum()\nend');
      expect(rust).toContain('.iter().sum::<f64>()');
    });

    // ── min ───────────────────────────────────────────────────────────────────
    it('arr.min() generates arr.iter().min().cloned()', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\nm = arr.min()\nend');
      expect(rust).toContain('.iter().min().cloned()');
    });

    // ── max ───────────────────────────────────────────────────────────────────
    it('arr.max() generates arr.iter().max().cloned()', () => {
      const rust = compileToRust('function main()\narr = [3, 1, 2]\nm = arr.max()\nend');
      expect(rust).toContain('.iter().max().cloned()');
    });

    // ── flat_map ──────────────────────────────────────────────────────────────
    it('arr.flat_map(closure) generates arr.iter().flat_map(|x| ...).collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.flat_map(|x| [x, x])\nend');
      expect(rust).toContain('.iter().flat_map(');
      expect(rust).toContain('.collect::<Vec<_>>()');
    });

    // ── take ──────────────────────────────────────────────────────────────────
    it('arr.take(n) generates arr.iter().take(n as usize).cloned().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3, 4, 5]\nresult = arr.take(3)\nend');
      expect(rust).toContain('.iter().take(3 as usize).cloned().collect::<Vec<_>>()');
    });

    it('arr.take(0) generates take(0 as usize) edge case', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.take(0)\nend');
      expect(rust).toContain('.iter().take(0 as usize)');
    });

    // ── skip ──────────────────────────────────────────────────────────────────
    it('arr.skip(n) generates arr.iter().skip(n as usize).cloned().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3, 4, 5]\nresult = arr.skip(2)\nend');
      expect(rust).toContain('.iter().skip(2 as usize).cloned().collect::<Vec<_>>()');
    });

    it('arr.skip(0) generates skip(0 as usize) edge case', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.skip(0)\nend');
      expect(rust).toContain('.iter().skip(0 as usize)');
    });

    // ── chain ─────────────────────────────────────────────────────────────────
    it('arr.chain(other) generates arr.iter().chain(other.iter()).cloned().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2]\nother = [3, 4]\nresult = arr.chain(other)\nend');
      expect(rust).toContain('.iter().chain(other.iter()).cloned().collect::<Vec<_>>()');
    });

    // ── partition ─────────────────────────────────────────────────────────────
    it('arr.partition(closure) generates arr.iter().partition(|&&x| ...)', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3, 4]\nresult = arr.partition(|x| x % 2 == 0)\nend');
      expect(rust).toContain('.iter().partition(|&&x|');
    });

    // ── reverse ───────────────────────────────────────────────────────────────
    it('arr.reverse() generates arr.iter().rev().cloned().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nresult = arr.reverse()\nend');
      expect(rust).toContain('.iter().rev().cloned().collect::<Vec<_>>()');
    });

    it('arr.reverse() on single-element array generates .iter().rev().cloned().collect::<Vec<_>>()', () => {
      const rust = compileToRust('function main()\narr = [1]\nresult = arr.reverse()\nend');
      expect(rust).toContain('.iter().rev().cloned().collect::<Vec<_>>()');
    });

    // ── unique ────────────────────────────────────────────────────────────────
    it('arr.unique() generates dedup-based unique collection', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 2, 3, 3]\nresult = arr.unique()\nend');
      expect(rust).toContain('.dedup(');
    });

    // ── first ─────────────────────────────────────────────────────────────────
    it('arr.first() generates arr.first().cloned()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nf = arr.first()\nend');
      expect(rust).toContain('.first().cloned()');
    });

    it('arr.first() on empty array still generates .first().cloned()', () => {
      const rust = compileToRust('function main()\narr = []\nf = arr.first()\nend');
      expect(rust).toContain('.first().cloned()');
    });

    // ── last ──────────────────────────────────────────────────────────────────
    it('arr.last() generates arr.last().cloned()', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nl = arr.last()\nend');
      expect(rust).toContain('.last().cloned()');
    });

    it('arr.last() on empty array still generates .last().cloned()', () => {
      const rust = compileToRust('function main()\narr = []\nl = arr.last()\nend');
      expect(rust).toContain('.last().cloned()');
    });

    // ── count ─────────────────────────────────────────────────────────────────
    it('arr.count() generates arr.len() as i32', () => {
      const rust = compileToRust('function main()\narr = [1, 2, 3]\nn = arr.count()\nend');
      expect(rust).toContain('.len() as i32');
    });

    it('arr.count() on single-element array generates .len() as i32', () => {
      const rust = compileToRust('function main()\narr = [42]\nn = arr.count()\nend');
      expect(rust).toContain('.len() as i32');
    });
  });

  describe('Process execution built-ins', () => {
    // Helper: run semantic analysis only (no codegen) so we can inspect errors
    function analyzeForErrors(source: string) {
      const { tokens } = tokenize(source, 'test.re');
      const { program } = parse(tokens);
      return analyze(program);
    }

    // ── run_command ─────────────────────────────────────────────────────────────

    it('run_command("ls") as statement generates Command::new("sh").arg("-c") chain', () => {
      const rust = compileToRust('function main()\nrun_command("ls")\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.arg("-c")');
      expect(rust).toContain('.status().unwrap()');
    });

    it('run_command with variable generates Command chain referencing the variable', () => {
      const rust = compileToRust('function main()\ncmd = "ls"\nrun_command(cmd)\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.arg("-c")');
      expect(rust).toContain('cmd');
    });

    it('run_command is used as statement — void return produces no let binding', () => {
      const rust = compileToRust('function main()\nrun_command("ls")\nend');
      expect(rust).toContain('.status().unwrap();');
      // void return: no variable should be bound on that line
      const lines = rust.split('\n');
      const cmdLine = lines.find(l => l.includes('status().unwrap()'));
      expect(cmdLine).toBeDefined();
      expect(cmdLine).not.toMatch(/let\s+\w+/);
    });

    // ── run_command_output ───────────────────────────────────────────────────────

    it('run_command_output("ls") generates Command output capture chain', () => {
      const rust = compileToRust('function main()\nout = run_command_output("ls")\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.arg("-c")');
      expect(rust).toContain('.output().unwrap().stdout');
      expect(rust).toContain('String::from_utf8_lossy(');
      expect(rust).toContain('.to_string()');
    });

    it('run_command_output with variable generates output capture chain using the variable', () => {
      const rust = compileToRust('function main()\ncmd = "ls"\nout = run_command_output(cmd)\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.output().unwrap().stdout');
    });

    it('run_command_output returns string — assigned variable is typed as String', () => {
      const rust = compileToRust('function main()\nout = run_command_output("ls")\nend');
      expect(rust).toContain('let out: String =');
    });

    // ── run_command_success ──────────────────────────────────────────────────────

    it('run_command_success("ls") generates Command status().unwrap().success() chain', () => {
      const rust = compileToRust('function main()\nok = run_command_success("ls")\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.arg("-c")');
      expect(rust).toContain('.status().unwrap().success()');
    });

    it('run_command_success with variable generates success check referencing the variable', () => {
      const rust = compileToRust('function main()\ncmd = "ls"\nok = run_command_success(cmd)\nend');
      expect(rust).toContain('std::process::Command::new("sh")');
      expect(rust).toContain('.status().unwrap().success()');
    });

    it('run_command_success returns bool — assigned variable is typed as bool', () => {
      const rust = compileToRust('function main()\nok = run_command_success("ls")\nend');
      expect(rust).toContain('let ok: bool =');
    });

    // ── Error cases: wrong argument type ────────────────────────────────────────

    it('run_command(42) with non-string arg produces a semantic error mentioning string', () => {
      const result = analyzeForErrors('function main()\nrun_command(42)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('string') && e.message.includes('run_command')
      )).toBe(true);
    });

    it('run_command_output(42) with non-string arg produces a semantic error mentioning string', () => {
      const result = analyzeForErrors('function main()\nout = run_command_output(42)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('string') && e.message.includes('run_command_output')
      )).toBe(true);
    });

    it('run_command_success(42) with non-string arg produces a semantic error mentioning string', () => {
      const result = analyzeForErrors('function main()\nok = run_command_success(42)\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('string') && e.message.includes('run_command_success')
      )).toBe(true);
    });

    // ── Error cases: too many arguments ─────────────────────────────────────────

    it('run_command("a", "b") with too many args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nrun_command("a", "b")\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command')
      )).toBe(true);
    });

    it('run_command_output("a", "b") with too many args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nout = run_command_output("a", "b")\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command_output')
      )).toBe(true);
    });

    it('run_command_success("a", "b") with too many args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nok = run_command_success("a", "b")\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command_success')
      )).toBe(true);
    });

    // ── Error cases: too few arguments ──────────────────────────────────────────

    it('run_command() with no args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nrun_command()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command')
      )).toBe(true);
    });

    it('run_command_output() with no args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nout = run_command_output()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command_output')
      )).toBe(true);
    });

    it('run_command_success() with no args produces a semantic error about argument count', () => {
      const result = analyzeForErrors('function main()\nok = run_command_success()\nend');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e =>
        e.message.includes('requires exactly 1 argument') && e.message.includes('run_command_success')
      )).toBe(true);
    });
  });
});



// ─── Tuple support (S-17) ────────────────────────────────────────────────────

describe('generate() — tuple literals (S-17)', () => {
  it('generates (1, String::from("hello"), true) for tuple literal (1, "hello", true)', () => {
    const rust = compileToRust('function foo()\nt = (1, "hello", true)\nend');
    expect(rust).toContain('(1, String::from("hello"), true)');
  });

  it('generates (1, 2) for tuple literal (1, 2)', () => {
    const rust = compileToRust('function foo()\nt = (1, 2)\nend');
    expect(rust).toContain('(1, 2)');
  });

  it('generates t.0 for tuple element access t.0', () => {
    const rust = compileToRust('function foo()\nt = (1, 2)\nx = t.0\nend');
    expect(rust).toContain('t.0');
  });

  it('generates t.1 for tuple element access t.1', () => {
    const rust = compileToRust('function foo()\nt = (1, 2)\nx = t.1\nend');
    expect(rust).toContain('t.1');
  });

  it('tuple variable has no type annotation (let Rust infer)', () => {
    const rust = compileToRust('function foo()\nt = (1, "hello")\nend');
    // Rust infers tuple type, so no explicit type annotation needed
    expect(rust).toContain('let t');
    expect(rust).toContain('(1, String::from("hello"))');
  });
});

// ─── Try expression code generation (v1.1) ──────────────────────────────────

describe('generate() — try expression (v1.1)', () => {
  it('"result = try some_fn()" generates "some_fn()?" in the Rust output', () => {
    const rust = compileToRust('function f()\nresult = try some_fn()\nend');
    expect(rust).toContain('some_fn()?');
  });

  it('"try some_fn()" as a standalone statement generates "some_fn()?;" in the Rust output', () => {
    const rust = compileToRust('function f()\ntry some_fn()\nend');
    expect(rust).toContain('some_fn()?;');
  });

  it('"x: int = try parse_fn()" generates "parse_fn()?" appended with ? in the Rust output', () => {
    const rust = compileToRust('function f()\nx: int = try parse_fn()\nend');
    expect(rust).toContain('parse_fn()?');
  });

  it('nested try: inner call gets ? suffix', () => {
    const rust = compileToRust('function f()\nresult = try outer_fn(try inner_fn())\nend');
    expect(rust).toContain('inner_fn()?');
    expect(rust).toContain('outer_fn(');
    expect(rust).toContain(')?');
  });
});
