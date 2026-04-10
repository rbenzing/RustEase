import type { CompilerError } from '../errors/errors.js';
import type { SourceLocation } from '../errors/errors.js';
import { createError } from '../errors/errors.js';
import type { YlType } from './types.js';
import { INT, FLOAT, STRING, BOOL, VOID, UNKNOWN, isPrimitive, isNumeric, isUnknown, typeToString } from './types.js';

// ─── BuiltinDescriptor interface ─────────────────────────────────────────────

export interface BuiltinDescriptor {
  name: string;
  /**
   * Validate argument types and return the call's return type.
   * `args` contains the pre-inferred YlType for each argument.
   * Push to `errors` only when `reportErrors` is true.
   */
  validate: (
    args: YlType[],
    location: SourceLocation,
    errors: CompilerError[],
    reportErrors: boolean,
  ) => YlType;
  /**
   * Generate Rust code for the call.
   * `genArgs` are the already-generated Rust expression strings for each argument.
   * `argTypes` are the YlType for each argument (for type-sensitive generation).
   * Returns the expression WITHOUT a trailing semicolon.
   */
  generateRust: (genArgs: string[], argTypes: YlType[]) => string;
  /** Rust use statements needed when this builtin is called (e.g. 'std::io'). */
  useStatements?: string[];
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const builtinRegistry = new Map<string, BuiltinDescriptor>();

function register(d: BuiltinDescriptor): void {
  builtinRegistry.set(d.name, d);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireExactArgs(
  name: string, expected: number, got: number,
  location: SourceLocation, errors: CompilerError[],
): void {
  if (got !== expected) {
    errors.push(createError('semantic',
      `'${name}' requires exactly ${expected} argument${expected === 1 ? '' : 's'}, got ${got}`,
      location));
  }
}

function requireStringArg(
  name: string, argType: YlType, position: string,
  location: SourceLocation, errors: CompilerError[],
): void {
  if (!isPrimitive(argType, 'string') && !isUnknown(argType)) {
    const msg = position
      ? `'${name}' ${position} must be string, got '${typeToString(argType)}'`
      : `'${name}' requires string argument, got '${typeToString(argType)}'`;
    errors.push(createError('semantic', msg, location));
  }
}

// ─── Builtin registrations ────────────────────────────────────────────────────

// print
register({
  name: 'print',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length === 0) {
      errors.push(createError('semantic', `'print' requires at least 1 argument`, location));
    }
    return VOID;
  },
  // NOTE: generator.ts special-cases 'print' before the registry to preserve exact original
  // behaviour (string-literal interpolation detection requires raw AST access).
  // This generateRust is a fallback that is not reached under normal codegen.
  generateRust: (genArgs, argTypes) => {
    if (genArgs.length > 1) {
      const fmtParts = genArgs.map(() => '{}').join(' ');
      return `println!("${fmtParts}", ${genArgs.join(', ')})`;
    }
    const arg0 = genArgs[0] ?? '""';
    const argType = argTypes[0] ?? UNKNOWN;
    const isEnumType = argType.kind === 'enum';
    const fmt = isEnumType ? '{:?}' : '{}';
    return `println!("${fmt}", ${arg0})`;
  },
});

// length
register({
  name: 'length',
  validate: (args, location, errors, reportErrors) => {
    if (args.length === 1) {
      const argType = args[0]!;
      const isArr = argType.kind === 'array';
      if (reportErrors && !isPrimitive(argType, 'string') && !isArr && !isUnknown(argType)) {
        errors.push(createError('semantic',
          `'length' requires string or array argument, got '${typeToString(argType)}'`, location));
      }
    }
    return INT;
  },
  generateRust: ([arg0]) => `${arg0 ?? '""'}.len()`,
});

// to_string
register({
  name: 'to_string',
  validate: (_args, _location, _errors, _reportErrors) => STRING,
  generateRust: ([arg0]) => `${arg0 ?? '""'}.to_string()`,
});

// int
register({
  name: 'int',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) requireExactArgs('int', 1, args.length, location, errors);
    if (args.length >= 1) {
      const argType = args[0]!;
      if (reportErrors && !isNumeric(argType) && !isPrimitive(argType, 'string') && !isUnknown(argType)) {
        errors.push(createError('semantic',
          `'int' requires numeric or string argument, got '${typeToString(argType)}'`, location));
      }
    }
    return INT;
  },
  generateRust: ([arg0], [argType]) => {
    const a = arg0 ?? '0';
    if (isPrimitive(argType ?? UNKNOWN, 'string')) return `${a}.parse::<i32>().unwrap()`;
    return `${a} as i32`;
  },
});

// float
register({
  name: 'float',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) requireExactArgs('float', 1, args.length, location, errors);
    if (args.length >= 1) {
      const argType = args[0]!;
      if (reportErrors && !isNumeric(argType) && !isPrimitive(argType, 'string') && !isUnknown(argType)) {
        errors.push(createError('semantic',
          `'float' requires numeric or string argument, got '${typeToString(argType)}'`, location));
      }
    }
    return FLOAT;
  },
  generateRust: ([arg0], [argType]) => {
    const a = arg0 ?? '0';
    if (isPrimitive(argType ?? UNKNOWN, 'string')) return `${a}.parse::<f64>().unwrap()`;
    return `${a} as f64`;
  },
});

// string
register({
  name: 'string',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) requireExactArgs('string', 1, args.length, location, errors);
    return STRING;
  },
  generateRust: ([arg0]) => `${arg0 ?? '""'}.to_string()`,
});

// assert
register({
  name: 'assert',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length < 1 || args.length > 2) {
        errors.push(createError('semantic',
          `'assert' requires 1 or 2 arguments, got ${args.length}`, location));
      } else {
        const arg0 = args[0]!;
        if (!isPrimitive(arg0, 'bool') && !isUnknown(arg0)) {
          errors.push(createError('semantic',
            `'assert' first argument must be bool, got '${typeToString(arg0)}'`, location));
        }
        if (args.length === 2) {
          const arg1 = args[1]!;
          if (!isPrimitive(arg1, 'string') && !isUnknown(arg1)) {
            errors.push(createError('semantic',
              `'assert' second argument must be string, got '${typeToString(arg1)}'`, location));
          }
        }
      }
    }
    return VOID;
  },
  generateRust: ([cond, msg]) => {
    const c = cond ?? 'true';
    if (msg !== undefined) return `assert!(${c}, "{}", ${msg})`;
    return `assert!(${c})`;
  },
});

// panic
register({
  name: 'panic',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 1) {
        errors.push(createError('semantic',
          `'panic' requires exactly 1 argument, got ${args.length}`, location));
      } else {
        requireStringArg('panic', args[0]!, '', location, errors);
      }
    }
    return VOID;
  },
  generateRust: ([msg]) => `panic!("{}", ${msg ?? '""'})`,
});

// env
register({
  name: 'env',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 1) {
        errors.push(createError('semantic',
          `'env' requires exactly 1 argument, got ${args.length}`, location));
      } else {
        requireStringArg('env', args[0]!, '', location, errors);
      }
    }
    return STRING;
  },
  generateRust: ([name]) => `std::env::var(${name ?? '""'}).unwrap_or_default()`,
});

// env_or
register({
  name: 'env_or',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 2) {
        errors.push(createError('semantic',
          `'env_or' requires exactly 2 arguments, got ${args.length}`, location));
      } else {
        if (!isPrimitive(args[0]!, 'string') && !isUnknown(args[0]!)) {
          errors.push(createError('semantic',
            `'env_or' first argument must be string, got '${typeToString(args[0]!)}'`, location));
        }
        if (!isPrimitive(args[1]!, 'string') && !isUnknown(args[1]!)) {
          errors.push(createError('semantic',
            `'env_or' second argument must be string, got '${typeToString(args[1]!)}'`, location));
        }
      }
    }
    return STRING;
  },
  generateRust: ([name, def]) =>
    `std::env::var(${name ?? '""'}).unwrap_or(${def ?? '""'}.to_string())`,
});

// read_line
register({
  name: 'read_line',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 0) {
      errors.push(createError('semantic',
        `'read_line' takes no arguments, got ${args.length}`, location));
    }
    return STRING;
  },
  generateRust: (_genArgs, _argTypes) =>
    '{ let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }',
});

// prompt
register({
  name: 'prompt',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 1) {
        errors.push(createError('semantic',
          `'prompt' requires exactly 1 argument, got ${args.length}`, location));
      } else {
        requireStringArg('prompt', args[0]!, '', location, errors);
      }
    }
    return STRING;
  },
  generateRust: ([msg]) => {
    const m = msg ?? 'String::from("")';
    return `{ print!("{}", ${m}); std::io::Write::flush(&mut std::io::stdout()).unwrap(); let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }`;
  },
});

// args
register({
  name: 'args',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 0) {
      errors.push(createError('semantic',
        `'args' takes no arguments, got ${args.length}`, location));
    }
    return { kind: 'array', elementType: STRING };
  },
  generateRust: () => 'std::env::args().collect::<Vec<String>>()',
});

// args_count
register({
  name: 'args_count',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 0) {
      errors.push(createError('semantic',
        `'args_count' takes no arguments, got ${args.length}`, location));
    }
    return INT;
  },
  generateRust: () => 'std::env::args().count() as i32',
});

// read_file
register({
  name: 'read_file',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 1) {
        errors.push(createError('semantic',
          `'read_file' requires exactly 1 argument, got ${args.length}`, location));
      } else {
        requireStringArg('read_file', args[0]!, '', location, errors);
      }
    }
    return STRING;
  },
  generateRust: ([path]) => `std::fs::read_to_string(${path ?? 'String::from("")'}).unwrap()`,
});

// write_file
register({
  name: 'write_file',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 2) {
        errors.push(createError('semantic',
          `'write_file' requires exactly 2 arguments, got ${args.length}`, location));
      } else {
        if (!isPrimitive(args[0]!, 'string') && !isUnknown(args[0]!)) {
          errors.push(createError('semantic',
            `'write_file' first argument must be string, got '${typeToString(args[0]!)}'`, location));
        }
        if (!isPrimitive(args[1]!, 'string') && !isUnknown(args[1]!)) {
          errors.push(createError('semantic',
            `'write_file' second argument must be string, got '${typeToString(args[1]!)}'`, location));
        }
      }
    }
    return VOID;
  },
  generateRust: ([path, content]) =>
    `std::fs::write(${path ?? 'String::from("")'}, ${content ?? 'String::from("")'}).unwrap()`,
});

// append_file — statement form handled separately via generateAppendFileStatement
register({
  name: 'append_file',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 2) {
        errors.push(createError('semantic',
          `'append_file' requires exactly 2 arguments, got ${args.length}`, location));
      } else {
        if (!isPrimitive(args[0]!, 'string') && !isUnknown(args[0]!)) {
          errors.push(createError('semantic',
            `'append_file' first argument must be string, got '${typeToString(args[0]!)}'`, location));
        }
        if (!isPrimitive(args[1]!, 'string') && !isUnknown(args[1]!)) {
          errors.push(createError('semantic',
            `'append_file' second argument must be string, got '${typeToString(args[1]!)}'`, location));
        }
      }
    }
    return VOID;
  },
  // In statement context, generateStatement intercepts append_file before reaching generateBuiltinCall.
  // This fallback is only used in (unusual) expression contexts.
  generateRust: ([path, content]) =>
    `append_file(${path ?? 'String::from("")'}, ${content ?? 'String::from("")'})`,
});

// file_exists
register({
  name: 'file_exists',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors) {
      if (args.length !== 1) {
        errors.push(createError('semantic',
          `'file_exists' requires exactly 1 argument, got ${args.length}`, location));
      } else {
        requireStringArg('file_exists', args[0]!, '', location, errors);
      }
    }
    return BOOL;
  },
  generateRust: ([path]) =>
    `std::path::Path::new(&${path ?? 'String::from("")'}).exists()`,
});

// some
register({
  name: 'some',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 1) {
      errors.push(createError('semantic',
        `'some' requires exactly 1 argument, got ${args.length}`, location));
    }
    const innerType = args.length >= 1 ? args[0]! : UNKNOWN;
    return { kind: 'option', innerType };
  },
  generateRust: ([arg]) => `Some(${arg ?? '()'})`,
});

// ok
register({
  name: 'ok',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 1) {
      errors.push(createError('semantic',
        `'ok' requires exactly 1 argument, got ${args.length}`, location));
    }
    const okType = args.length >= 1 ? args[0]! : UNKNOWN;
    return { kind: 'result', okType, errType: STRING };
  },
  generateRust: ([arg]) => `Ok(${arg ?? '()'})`,
});

// err
register({
  name: 'err',
  validate: (args, location, errors, reportErrors) => {
    if (reportErrors && args.length !== 1) {
      errors.push(createError('semantic',
        `'err' requires exactly 1 argument, got ${args.length}`, location));
    }
    if (args.length >= 1 && reportErrors) {
      const argType = args[0]!;
      if (!isPrimitive(argType, 'string') && !isUnknown(argType)) {
        errors.push(createError('semantic',
          `'err' requires a string argument, got '${typeToString(argType)}'`, location));
      }
    }
    return { kind: 'result', okType: UNKNOWN, errType: STRING };
  },
  generateRust: ([arg]) => `Err(${arg ?? 'String::from("")'})`,
});
