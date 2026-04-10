# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-04-10

### Added
- Math built-ins: `abs`, `sqrt`, `pow`, `floor`, `ceil`, `round`, `min`, `max`, `clamp`
- Extended collection methods: `sort`, `reverse`, `contains`, `join`, `split`, `trim`, `replace`, `starts_with`, `ends_with`, `find`, `zip`, `enumerate`
- Process execution built-in: `exec()`
- `try` expression for error-propagating return values
- Data-carrying enums with destructuring in match arms
- Conditional (ternary) expressions
- Default parameter values on functions
- Array slicing syntax
- Map iteration with key/value destructuring
- Variable type annotations (`x: int = 5`)
- Triple-quoted multi-line strings
- Multi-argument `print()` support
- Module system: `import` declarations with DFS cycle detection and multi-file semantic merge
- Duplicate top-level name detection across imported files

### Changed
- Generated `Cargo.toml` now targets `edition = "2024"`
- `while true` loops emit `loop {}` (required by Rust 2024 deny-level lint)
- Struct field access on `Vec` elements now emits `.clone()` for non-Copy types
- `match` statement branches receive isolated `declaredVars` copies (fixes spurious `let` re-declarations)
- `print()` uses `{:?}` specifier when passed an array value
- Builtin functions extracted into a dedicated registry (`builtins.ts`)
- Method resolution extracted into `method-resolver.ts` (reduced `analyzer.ts` by ~292 lines)
- AST nodes carry `resolvedType` annotations set during semantic analysis (replaces repeated `getExprType` calls)
- Per-branch/per-loop `assignmentCount` copies eliminate spurious `let mut` on re-assignments
- `std::io` and `std::env` use-imports dropped where fully-qualified paths are used

### Fixed
- `gen` reserved as a lexer keyword (`TokenType.Gen`) for Rust 2024 compatibility
- Impl method parameter types now inferred from call-site arguments
- Brace escape in string interpolation
- Negative constant declarations
- Source context with caret display in compiler error output
- "Did you mean?" suggestions via Levenshtein distance on undefined identifiers
- Match exhaustiveness checking
- Struct field validation in semantic analyzer

### Internal
- Test suite expanded from 393 → 955 tests across 8 suites (all passing)
- Analyzer coverage: 74% → 93%; codegen: 86% → 96%; parser: 92% → 97%
- `--noUnusedLocals` / `--noUnusedParameters` dead-code pass: removed unused `match` local in `parseInterpolation`, dropped `isStringMatch` and `analysis` params from `generateMatchPattern`, removed dead `parseExpressionStatement` helper, removed unused `CompilerError` type import
- Release scripts (`bundle.js`, `package-exe.js`) now fail fast with a clear error when `dist/` is missing

## [1.0.0] - 2026-03-20

### Added
- RustEase compiler: transpiles `.re` source files to valid Rust code
- Lexer with full token type support
- Recursive descent parser producing typed AST
- Semantic analyzer with type inference and scope validation
- Rust code generator with proper formatting
- CLI with `build`, `run`, and `emit-rust` commands
- Debug flags: `--emit-tokens`, `--emit-ast`
- Language features: functions, variables, if/else, while loops, arithmetic, comparisons, logical operators, string interpolation, built-in functions (print, length, to_string)
- Example programs: hello, fibonacci, fizzbuzz, arithmetic, string-demo, multi-function
- Comprehensive test suite: unit tests, integration tests, golden tests

