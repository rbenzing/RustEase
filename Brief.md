# 🧾 Project Brief: RustEase (Enhanced MVP v1.0)

## 📌 Objective
RustEase is a high-level, human-readable programming language that transpiles into Rust source code. It allows developers to write simple, expressive code using natural keywords while leveraging Rust’s safety, performance, and reliability.

The goal of the MVP is to deliver a usable scripting-style language that compiles to valid Rust and can execute real programs without exposing Rust’s complexity (ownership, borrowing, lifetimes).

---

# 🧠 Core Philosophy

- Human-readable syntax (English-like keywords)
- No lifetimes or borrowing exposed to user
- All values owned by default
- Deterministic and predictable compilation
- Generated Rust must be readable and debuggable
- Favor simplicity over completeness

---

# 🚀 MVP Feature Set (Enhanced)

## 1. Functions

Syntax:
function name(param1, param2)
    statements
end

Rules:
- Named functions only
- Parameters are implicitly typed
- Return type inferred
- Last expression can act as implicit return

---

## 2. Variables

Syntax:
x = 10
name = "Mark"

Rules:
- Implicit declaration
- Immutable by default (internally may become mutable in Rust if reassigned)
- Type inferred from first assignment

---

## 3. Primitive Types (Inferred)

int     → i32
float   → f64
string  → String
bool    → bool

---

## 4. Expressions

Supported:
- Arithmetic: + - * /
- Comparison: == != > < >= <=
- Logical: and, or, not
- Grouping: ( )

Example:
x = (a + b) * 2

---

## 5. Control Flow

### If / Else If / Else

Syntax:
if condition
    statements
else if condition
    statements
else
    statements
end

---

## 6. While Loops

Syntax:
while condition
    statements
end

---

## 7. Return Behavior

Explicit:
return x

Implicit:
function add(a, b)
    a + b
end

Rule:
- Last expression becomes return if no explicit return

---

## 8. String Interpolation

Syntax:
message = "Hello {name}"

Transpiles to Rust format! macro.

---

## 9. Built-in Functions (Standard Library Layer)

These are not implemented in the language core but mapped during codegen.

Supported:

print(x)
→ println!("{}", x)

length(x)
→ x.len()

to_string(x)
→ x.to_string()

---

## 10. Multi-Function Files

Multiple functions per file are supported.

Example:
function add(a, b)
    return a + b
end

function main()
    result = add(1, 2)
    print(result)
end

---

# ❌ Explicitly Excluded (MVP)

- Structs
- Classes
- Traits
- Generics
- Modules/imports
- Async/await
- Borrowing/references
- Lifetimes
- Pattern matching
- Macros (user-defined)

---

# 🏗️ Compiler Architecture

Pipeline:

Source (.yl)
→ Lexer
→ Parser
→ AST
→ Semantic Analysis
→ Code Generator
→ Rust (.rs)
→ cargo build/run

---

# 🔤 Lexer Specification

Token Types:

Identifier
Number
String
Boolean
Keyword
Operator
Symbol

Keywords:

function
end
if
else
while
return
and
or
not
true
false

Symbols:

( ) ,

Operators:

+ - * / == != > < >= <= =

---

# 🌳 AST Design

Program
- functions: list

FunctionDeclaration
- name
- parameters
- body

Statements:
- VariableAssignment
- ReturnStatement
- IfStatement
- WhileStatement
- ExpressionStatement

VariableAssignment
- identifier
- expression

ReturnStatement
- expression

IfStatement
- condition
- thenBranch
- elseIfBranches (list)
- elseBranch

WhileStatement
- condition
- body

Expressions:
- BinaryExpression
- Literal
- Identifier
- FunctionCall
- GroupedExpression

BinaryExpression:
- left
- operator
- right

Literal:
- value
- type

Identifier:
- name

FunctionCall:
- name
- arguments

---

# 🧠 Semantic Rules (MVP)

1. Variables must be defined before use
2. Type inferred on first assignment
3. Binary operations must be type-compatible
4. Function return type inferred from return/last expression
5. All values are owned
6. Reassignment allowed (internally treated as mutable in Rust)
7. Built-in functions validated at compile time

---

# ⚙️ Code Generation Rules

## General

- Always generate valid Rust
- Prefer owned values
- Insert conversions when needed

---

## Variables

Input:
x = 10

Output:
let x: i32 = 10;

Reassignment:
x = x + 1
→ let mut x = ...

---

## Functions

Input:
function add(a, b)
    return a + b
end

Output:
fn add(a: i32, b: i32) -> i32 {
    a + b
}

---

## While Loop

Input:
while x < 10
    x = x + 1
end

Output:
while x < 10 {
    x += 1;
}

---

## If Statement

Input:
if x > 5
    return 1
else
    return 0
end

Output:
if x > 5 {
    return 1;
} else {
    return 0;
}

---

## String Interpolation

Input:
"Hello {name}"

Output:
format!("Hello {}", name)

---

## Built-ins

print(x)
→ println!("{}", x)

length(x)
→ x.len()

---

# 🧪 Testing Strategy

## Unit Tests
- Lexer correctness
- Parser correctness
- AST validation
- Codegen correctness

---

## Golden Tests
Input (.yl) → Expected (.rs)

---

## Compilation Tests
- All generated Rust must pass:
cargo check

---

# 🖥️ CLI Specification

Commands:

rustease build file.yl
- Generates Rust
- Compiles project

rustease run file.yl
- Builds and executes

rustease emit-rust file.yl
- Outputs generated Rust

Optional Debug Flags:

--emit-tokens
--emit-ast

---

# 📂 Project Structure

rustease/
- cli/
- lexer/
- parser/
- ast/
- semantic/
- codegen/
- tests/
- examples/

---

# 🤖 AI Agent Task Breakdown

Agent 1: Lexer
- Token definitions
- Tokenizer implementation

Agent 2: Parser
- Recursive descent parser
- AST construction

Agent 3: AST
- Node definitions
- Data structures

Agent 4: Semantic Analyzer
- Type inference
- Scope validation

Agent 5: Code Generator
- AST → Rust transformation
- Built-in mapping

Agent 6: CLI
- Command handling
- File IO
- Pipeline orchestration

Agent 7: Testing
- Unit tests
- Golden tests
- Compile validation

---

# ⚠️ Risks & Mitigations

Hidden cloning
→ Accept in MVP, optimize later

Invalid Rust generation
→ Always compile output

Parser complexity
→ Keep grammar simple and strict

Scope creep
→ Enforce MVP boundaries

---

# ✅ Definition of Done

- Valid .yl file parses successfully
- AST is generated correctly
- Rust code is generated
- Rust compiles via cargo
- CLI commands function correctly
- Tests pass
- Example programs run successfully

---

# 🗺️ Post-MVP Roadmap

v1.1:
- Structs

v1.2:
- Modules/imports

v1.3:
- Error handling improvements

v2.0:
- Borrow inference (optional)
- Performance optimization

---

# 🔥 Summary

RustEase MVP delivers a human-readable scripting language with:

- Functions
- Variables
- If/else logic
- While loops
- Expressions
- String interpolation
- Built-in functions

All compiling into safe, valid Rust.

This creates a powerful, minimal, and extensible foundation for future growth.