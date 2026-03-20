# RustEase

> Write simple, expressive code — compile it to Rust.

RustEase is a compiler that transpiles a human-readable language (`.re` files) into valid Rust code. Write clean, English-like syntax without dealing with Rust's ownership, borrowing, or lifetimes — RustEase handles the translation for you.

## Quick Start

```bash
# Install
npm install -g rustease

# Write a program
echo 'function main()
    print("Hello, World!")
end' > hello.re

# Compile and run
rustease run hello.re
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- [Rust toolchain](https://rustup.rs/) (`cargo` and `rustc`)

## Installation

```bash
npm install -g rustease
```

Or run without installing:

```bash
npx rustease run hello.re
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `rustease build <file>` | Compile `.re` to Rust and run `cargo build` |
| `rustease run <file>` | Compile and execute with `cargo run` |
| `rustease emit-rust <file>` | Print generated Rust code to stdout |

### Options

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output directory (default: `./output`) |
| `--emit-tokens` | Print token stream as JSON |
| `--emit-ast` | Print AST as JSON |
| `--version` | Show version number |
| `--help` | Show help |

### Example

```bash
# See the generated Rust code
rustease emit-rust examples/fibonacci.re

# Build an executable
rustease build examples/hello.re -o ./my-project

# Compile and run immediately
rustease run examples/fizzbuzz.re
```

## Language Overview

RustEase uses indentation-style blocks with `function`/`end` delimiters and infers types automatically.

### Hello World

```
function main()
    print("Hello, World!")
end
```

### Variables & Type Inference

```
function main()
    name = "RustEase"
    count = 42
    pi = 3.14
    active = true
    print("Welcome to {name}!")
end
```

Types are inferred automatically: `int` → `i32`, `float` → `f64`, `string` → `String`, `bool` → `bool`.

### Functions

```
function fibonacci(n)
    if n <= 1
        return n
    end
    a = 0
    b = 1
    i = 2
    while i <= n
        temp = b
        b = a + b
        a = temp
        i = i + 1
    end
    return b
end

function main()
    result = fibonacci(10)
    print(result)
end
```

### Control Flow

```
function main()
    x = 10
    if x > 5
        print("big")
    else if x > 0
        print("small")
    else
        print("zero or negative")
    end

    i = 0
    while i < 5
        print(i)
        i = i + 1
    end
end
```

### Supported Features

| Feature | RustEase Syntax | Rust Output |
|---------|----------------|-------------|
| Functions | `function name() ... end` | `fn name() { ... }` |
| Variables | `x = 42` | `let mut x: i32 = 42;` |
| Constants | `const PI = 3.14` | `const PI: f64 = 3.14;` |
| If/Else | `if ... else ... end` | `if ... { } else { }` |
| While loops | `while ... end` | `while ... { }` |
| For loops | `for x in items ... end` | `for x in items { }` |
| Structs | `struct Point ... end` | `struct Point { ... }` |
| Enums | `enum Color ... end` | `enum Color { ... }` |
| Match | `match x ... end` | `match x { ... }` |
| Closures | `\|x\| x * 2` | `\|x\| x * 2` |
| Impl blocks | `impl Point ... end` | `impl Point { ... }` |
| String interpolation | `"Hello {name}"` | `format!("Hello {}", name)` |
| Print | `print(x)` | `println!("{}", x)` |
| Logical ops | `and`, `or`, `not` | `&&`, `\|\|`, `!` |

## Architecture

RustEase follows a classic compiler pipeline:

```
.re source → Lexer → Parser → AST → Semantic Analyzer → Code Generator → .rs output
```

```
src/
├── lexer/       # Tokenization
├── parser/      # Recursive descent parser
├── ast/         # AST node definitions
├── semantic/    # Type inference & scope analysis
├── codegen/     # Rust code generation
├── cli/         # Command-line interface
└── errors/      # Error handling
```

## Development

```bash
# Clone the repo
git clone https://github.com/RustEase/RustEase.git
cd RustEase

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm run dev -- run examples/hello.re
```

## Examples

See the [`examples/`](examples/) directory for sample programs:

- [`hello.re`](examples/hello.re) — Hello World
- [`fibonacci.re`](examples/fibonacci.re) — Recursive function with loops
- [`fizzbuzz.re`](examples/fizzbuzz.re) — Control flow demonstration
- [`arithmetic.re`](examples/arithmetic.re) — Arithmetic operations
- [`string-demo.re`](examples/string-demo.re) — String operations
- [`multi-function.re`](examples/multi-function.re) — Multiple functions

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) — see the [LICENSE](LICENSE) file for details.

