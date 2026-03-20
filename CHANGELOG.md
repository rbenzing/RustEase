# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

