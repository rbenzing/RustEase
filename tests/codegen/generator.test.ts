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
});

