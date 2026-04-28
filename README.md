# RustEase

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL_3.0-blue.svg)](https://opensource.org/licenses/AGPL-3.0)
[![TypeScript](https://img.shields.io/badge/Language-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js->=18.0.0-green.svg)](https://nodejs.org/)
[![Rust](https://img.shields.io/badge/Compiles_to-Rust-CE422B.svg)](https://www.rust-lang.org/)

> ✨ Write simple, expressive code — compile it to Rust.

RustEase is a compiler that transpiles a human-readable language (`.re` files) into valid Rust code. Write clean, English-like syntax without dealing with Rust's ownership, borrowing, or lifetimes — the compiler handles the complexity.

## 🚀 Quick Start

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

## 📋 Prerequisites

- [Node.js](https://nodejs.org/) >= 18.0.0
- [Rust toolchain](https://rustup.rs/) (`cargo` and `rustc`)

## 📦 Installation

```bash
npm install -g rustease
```

Or run without installing:

```bash
npx rustease run hello.re
```

## 🛠️ Usage

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

### Examples

```bash
# See the generated Rust code
rustease emit-rust examples/calculator.re

# Build an executable
rustease build examples/temperature-converter.re -o ./my-project

# Compile and run immediately
rustease run examples/guess-the-number.re
```

## 📚 Language Overview

RustEase uses indentation-style blocks with `function`/`end` delimiters and infers types automatically.

### Hello World

```re
function main()
    print("Hello, World!")
end
```

### Variables & Type Inference

```re
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

```re
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

```re
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
| String interpolation | `"Hello {name}"` | `format!("Hello {}, name)` |
| Print | `print(x)` | `println!("{}", x)` |
| Logical ops | `and`, `or`, `not` | `&&`, `\|\|`, `!` |
| Error propagation | `try expr` | `expr?` |

### Built-in Functions

#### Math

| Function | Description | Rust Output |
|----------|-------------|-------------|
| `sqrt(x)` | Square root (float) | `x.sqrt()` |
| `pow(x, n)` | Power — `x` must be float, `n` int or float | `x.powi(n)` / `x.powf(n)` |
| `abs(x)` | Absolute value (int or float) | `x.abs()` |
| `floor(x)` | Floor (float) | `x.floor()` |
| `ceil(x)` | Ceiling (float) | `x.ceil()` |
| `round(x)` | Round (float) | `x.round()` |
| `min_val(a, b)` | Minimum of two numbers | `a.min(b)` |
| `max_val(a, b)` | Maximum of two numbers | `a.max(b)` |

#### Collections

| Method | Description | Rust Output |
|--------|-------------|-------------|
| `arr.sort()` | Sort in place | `arr.sort();` |
| `arr.sort_by(\|a,b\| ...)` | Sort with comparator | `arr.sort_by(...);` |
| `arr.reverse()` | Reverse | `.iter().rev().cloned().collect()` |
| `arr.unique()` | Deduplicate | sort + dedup |
| `arr.first()` | First element (Option) | `.first().cloned()` |
| `arr.last()` | Last element (Option) | `.last().cloned()` |
| `arr.count()` | Length as int | `.len() as i32` |
| `arr.sum()` | Sum elements | `.iter().sum::<i32/f64>()` |
| `arr.min()` | Minimum (Option) | `.iter().min().cloned()` |
| `arr.max()` | Maximum (Option) | `.iter().max().cloned()` |
| `arr.take(n)` | First n elements | `.iter().take(n as usize)...` |
| `arr.skip(n)` | Drop first n elements | `.iter().skip(n as usize)...` |
| `arr.enumerate()` | Index-value pairs | `.iter().enumerate().collect()` |
| `arr.zip(other)` | Zip two arrays | `.iter().zip(other.iter()).collect()` |
| `arr.chain(other)` | Concatenate two arrays | `.iter().chain(other.iter())...` |
| `arr.flat_map(\|x\| ...)` | Flat map | `.iter().flat_map(...).collect()` |
| `arr.partition(\|x\| ...)` | Split by predicate | `.iter().partition(...)` |

#### Process Execution

| Function | Returns | Rust Output |
|----------|---------|-------------|
| `run_command(cmd)` | void | `Command::new("sh").arg("-c").arg(cmd).status().unwrap()` |
| `run_command_output(cmd)` | string | `String::from_utf8_lossy(&Command::...output()...stdout).to_string()` |
| `run_command_success(cmd)` | bool | `Command::new("sh").arg("-c").arg(cmd).status().unwrap().success()` |

### Error Handling

Functions can return `Result<T>` and propagate errors with `try`:

```re
function parse_number(s: string) -> Result<int>
    return ok(0)
end

function main() -> Result<int>
    n = try parse_number("42")
    print(n)
    return ok(0)
end
```

`try expr` compiles to `expr?` — if the inner `Result` is `Err`, the error is returned immediately. Using `try` in a function that does not return `Result` is a compile-time semantic error.

## 🏗️ Architecture

RustEase follows a classic compiler pipeline:

```
.re source → Lexer → Parser → AST → Semantic Analyzer → Code Generator → .rs output
```

**Directory Structure:**

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

## 👨‍💻 Development

```bash
# Clone the repo
git clone https://github.com/rbenzing/RustEase.git
cd RustEase

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run in development mode
npm run dev -- run examples/temperature-converter.re
```

## 📖 Examples

See the [`examples/`](examples/) directory for sample programs across three difficulty tiers:

### 🟢 Easy

- [`guess-the-number.re`](examples/guess-the-number.re) — Interactive guessing game with loops, user input, and `+=`
- [`temperature-converter.re`](examples/temperature-converter.re) — Functions, float math, and string interpolation
- [`todo-list.re`](examples/todo-list.re) — Arrays, push, for loops, and interactive commands

### 🟡 Medium

- [`calculator.re`](examples/calculator.re) — Enums, match expressions, and return values
- [`contact-book.re`](examples/contact-book.re) — Structs, impl blocks, and arrays of structs
- [`word-frequency.re`](examples/word-frequency.re) — Maps, string splitting, and data counting
- [`inventory-system.re`](examples/inventory-system.re) — Structs + enums + match + impl combined

### 🔴 Hard

- [`csv-processor.re`](examples/csv-processor.re) — File I/O pipeline, CSV parsing, and data aggregation
- [`task-manager-cli.re`](examples/task-manager-cli.re) — CLI args, file persistence, and CRUD operations
- [`markdown-parser.re`](examples/markdown-parser.re) — String processing, function dispatch, and HTML generation

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) — see the [LICENSE](LICENSE) file for details.