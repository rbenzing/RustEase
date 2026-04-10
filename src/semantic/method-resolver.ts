import type { SourceLocation, CompilerError } from '../errors/errors.js';
import { createError } from '../errors/errors.js';
import type { YlType, FunctionInfo } from './types.js';
import { INT, FLOAT, STRING, BOOL, VOID, UNKNOWN, isPrimitive, isUnknown, typesEqual, typeToString } from './types.js';

export interface MethodCallResult {
  returnType: YlType;
  markMutable: boolean;
}

/**
 * Resolve the return type of a method call, given pre-computed argument types.
 * Does NOT import from analyzer.ts — no circular dependency.
 *
 * @param objectType     The type of the receiver object
 * @param methodName     The method being called
 * @param argCount       Number of arguments provided
 * @param argTypes       Pre-computed types for each argument
 * @param location       Source location for error reporting
 * @param errors         Mutable errors array to push into
 * @param reportErrors   Whether to emit semantic errors
 * @param structMethods  Method map for the struct (only when objectType.kind === 'struct')
 */
export function resolveMethodCall(
  objectType: YlType,
  methodName: string,
  argCount: number,
  argTypes: YlType[],
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
  structMethods?: Map<string, FunctionInfo>,
): MethodCallResult {
  if (objectType.kind === 'map') {
    return resolveMapMethod(objectType, methodName, argCount, argTypes, location, errors, reportErrors);
  }

  const isArrayType = objectType.kind === 'array';
  if (isArrayType || isUnknown(objectType)) {
    return resolveArrayMethod(objectType, methodName, argCount, argTypes, location, errors, reportErrors, isArrayType);
  }

  if (isPrimitive(objectType, 'string')) {
    return resolveStringMethod(methodName, argCount, argTypes, location, errors, reportErrors);
  }

  if (objectType.kind === 'option') {
    return resolveOptionMethod(objectType, methodName, argCount, location, errors, reportErrors);
  }

  if (objectType.kind === 'result') {
    return resolveResultMethod(objectType, methodName, argCount, location, errors, reportErrors);
  }

  if (objectType.kind === 'struct') {
    return resolveStructMethod(objectType, methodName, location, errors, reportErrors, structMethods);
  }

  if (reportErrors) {
    errors.push(createError('semantic',
      `Cannot call method '${methodName}' on type '${typeToString(objectType)}'`,
      location));
  }
  return { returnType: UNKNOWN, markMutable: false };
}

// ─── Map methods ──────────────────────────────────────────────────────────────

function resolveMapMethod(
  objectType: { kind: 'map'; keyType: YlType; valueType: YlType },
  methodName: string,
  argCount: number,
  argTypes: YlType[],
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
): MethodCallResult {
  switch (methodName) {
    case 'length':
      return { returnType: INT, markMutable: false };
    case 'contains': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'contains' requires exactly 1 argument, got ${argCount}`, location));
      }
      if (argCount >= 1) {
        const argType = argTypes[0]!;
        if (reportErrors && !isUnknown(objectType.keyType) && !isUnknown(argType) &&
            !typesEqual(argType, objectType.keyType)) {
          errors.push(createError('semantic',
            `'contains' key must be '${typeToString(objectType.keyType)}', got '${typeToString(argType)}'`,
            location));
        }
      }
      return { returnType: BOOL, markMutable: false };
    }
    case 'remove': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'remove' requires exactly 1 argument, got ${argCount}`, location));
      }
      return { returnType: VOID, markMutable: true };
    }
    case 'keys':
      return { returnType: { kind: 'array', elementType: objectType.keyType }, markMutable: false };
    case 'values':
      return { returnType: { kind: 'array', elementType: objectType.valueType }, markMutable: false };
    default:
      if (reportErrors) {
        errors.push(createError('semantic', `Unknown map method '${methodName}'`, location));
      }
      return { returnType: UNKNOWN, markMutable: false };
  }
}

// ─── Array methods ────────────────────────────────────────────────────────────

function resolveArrayMethod(
  objectType: YlType,
  methodName: string,
  argCount: number,
  argTypes: YlType[],
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
  isArrayType: boolean,
): MethodCallResult {
  const arrType = isArrayType ? (objectType as { kind: 'array'; elementType: YlType }) : null;

  switch (methodName) {
    case 'push': {
      if (argCount >= 1 && reportErrors && arrType) {
        const argType = argTypes[0]!;
        if (!isUnknown(argType) && !isUnknown(arrType.elementType) &&
            !typesEqual(argType, arrType.elementType)) {
          errors.push(createError('semantic',
            `Cannot push '${typeToString(argType)}' to array of '${typeToString(arrType.elementType)}'`,
            location));
        }
      }
      return { returnType: VOID, markMutable: true };
    }
    case 'pop': {
      const elemType = arrType ? arrType.elementType : UNKNOWN;
      return { returnType: elemType, markMutable: true };
    }
    case 'length':
      return { returnType: INT, markMutable: false };
    case 'map': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'map' requires exactly 1 closure argument, got ${argCount}`, location));
      }
      if (argCount >= 1) {
        const closureType = argTypes[0]!;
        if (closureType.kind === 'function') {
          return { returnType: { kind: 'array', elementType: closureType.returnType }, markMutable: false };
        }
      }
      return { returnType: { kind: 'array', elementType: UNKNOWN }, markMutable: false };
    }
    case 'filter': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'filter' requires exactly 1 closure argument, got ${argCount}`, location));
      }
      const filterType: YlType = arrType ?? { kind: 'array', elementType: UNKNOWN };
      return { returnType: filterType, markMutable: false };
    }
    case 'reduce': {
      if (reportErrors && argCount !== 2) {
        errors.push(createError('semantic',
          `'reduce' requires exactly 2 arguments (initial value and closure), got ${argCount}`,
          location));
      }
      if (argCount >= 1) {
        return { returnType: argTypes[0]!, markMutable: false };
      }
      return { returnType: UNKNOWN, markMutable: false };
    }
    case 'any':
    case 'all': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'${methodName}' requires exactly 1 closure argument, got ${argCount}`, location));
      }
      return { returnType: BOOL, markMutable: false };
    }
    case 'find': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'find' requires exactly 1 closure argument, got ${argCount}`, location));
      }
      const findElemType = arrType ? arrType.elementType : UNKNOWN;
      return { returnType: { kind: 'option', innerType: findElemType }, markMutable: false };
    }
    case 'sort':
      return { returnType: VOID, markMutable: true };
    case 'sort_by':
      return { returnType: VOID, markMutable: true };
    case 'enumerate':
      return { returnType: { kind: 'array', elementType: UNKNOWN }, markMutable: false };
    case 'zip':
      return { returnType: { kind: 'array', elementType: UNKNOWN }, markMutable: false };
    case 'sum': {
      const elemType = arrType ? arrType.elementType : UNKNOWN;
      const sumType = isPrimitive(elemType, 'float') ? FLOAT : INT;
      return { returnType: sumType, markMutable: false };
    }
    case 'min':
    case 'max': {
      const elemType2 = arrType ? arrType.elementType : UNKNOWN;
      return { returnType: { kind: 'option', innerType: elemType2 }, markMutable: false };
    }
    case 'flat_map':
      return { returnType: { kind: 'array', elementType: UNKNOWN }, markMutable: false };
    case 'take':
    case 'skip': {
      const sliceType: YlType = arrType ?? { kind: 'array', elementType: UNKNOWN };
      return { returnType: sliceType, markMutable: false };
    }
    case 'chain': {
      const chainType: YlType = arrType ?? { kind: 'array', elementType: UNKNOWN };
      return { returnType: chainType, markMutable: false };
    }
    case 'partition': {
      const partElem = arrType ? arrType.elementType : UNKNOWN;
      const partArr: YlType = { kind: 'array', elementType: partElem };
      return { returnType: { kind: 'tuple', elements: [partArr, partArr] }, markMutable: false };
    }
    case 'reverse':
    case 'unique': {
      const revType: YlType = arrType ?? { kind: 'array', elementType: UNKNOWN };
      return { returnType: revType, markMutable: false };
    }
    case 'first':
    case 'last': {
      const flElem = arrType ? arrType.elementType : UNKNOWN;
      return { returnType: { kind: 'option', innerType: flElem }, markMutable: false };
    }
    case 'count':
      return { returnType: INT, markMutable: false };
    default:
      if (reportErrors) {
        errors.push(createError('semantic', `Unknown array method '${methodName}'`, location));
      }
      return { returnType: UNKNOWN, markMutable: false };
  }
}

// ─── String methods ───────────────────────────────────────────────────────────

function resolveStringMethod(
  methodName: string,
  argCount: number,
  argTypes: YlType[],
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
): MethodCallResult {
  switch (methodName) {
    case 'length':
      return { returnType: INT, markMutable: false };
    case 'contains':
    case 'starts_with':
    case 'ends_with': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'${methodName}' requires exactly 1 argument, got ${argCount}`, location));
      }
      if (argCount >= 1) {
        const argType = argTypes[0]!;
        if (reportErrors && !isPrimitive(argType, 'string') && !isUnknown(argType)) {
          errors.push(createError('semantic',
            `'${methodName}' requires a string argument, got '${typeToString(argType)}'`,
            location));
        }
      }
      return { returnType: BOOL, markMutable: false };
    }
    case 'to_upper':
    case 'to_lower':
    case 'trim': {
      if (reportErrors && argCount !== 0) {
        errors.push(createError('semantic', `'${methodName}' takes no arguments, got ${argCount}`, location));
      }
      return { returnType: STRING, markMutable: false };
    }
    case 'replace': {
      if (reportErrors && argCount !== 2) {
        errors.push(createError('semantic', `'replace' requires exactly 2 arguments, got ${argCount}`, location));
      }
      for (const argType of argTypes) {
        if (reportErrors && !isPrimitive(argType, 'string') && !isUnknown(argType)) {
          errors.push(createError('semantic',
            `'replace' requires string arguments, got '${typeToString(argType)}'`,
            location));
        }
      }
      return { returnType: STRING, markMutable: false };
    }
    case 'split': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'split' requires exactly 1 argument, got ${argCount}`, location));
      }
      if (argCount >= 1) {
        const argType = argTypes[0]!;
        if (reportErrors && !isPrimitive(argType, 'string') && !isUnknown(argType)) {
          errors.push(createError('semantic',
            `'split' requires a string argument, got '${typeToString(argType)}'`,
            location));
        }
      }
      return { returnType: { kind: 'array', elementType: STRING }, markMutable: false };
    }
    case 'char_at': {
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'char_at' requires exactly 1 argument, got ${argCount}`, location));
      }
      if (argCount >= 1) {
        const argType = argTypes[0]!;
        if (reportErrors && !isPrimitive(argType, 'int') && !isUnknown(argType)) {
          errors.push(createError('semantic',
            `'char_at' requires an int argument, got '${typeToString(argType)}'`,
            location));
        }
      }
      return { returnType: STRING, markMutable: false };
    }
    default:
      if (reportErrors) {
        errors.push(createError('semantic', `Unknown string method '${methodName}'`, location));
      }
      return { returnType: UNKNOWN, markMutable: false };
  }
}

// ─── Option methods ───────────────────────────────────────────────────────────

function resolveOptionMethod(
  objectType: { kind: 'option'; innerType: YlType },
  methodName: string,
  argCount: number,
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
): MethodCallResult {
  const innerType = objectType.innerType;
  switch (methodName) {
    case 'unwrap':
      if (reportErrors && argCount !== 0) {
        errors.push(createError('semantic', `'unwrap' takes no arguments`, location));
      }
      return { returnType: innerType, markMutable: false };
    case 'unwrap_or':
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'unwrap_or' requires exactly 1 argument`, location));
      }
      return { returnType: innerType, markMutable: false };
    case 'is_some':
    case 'is_none':
      if (reportErrors && argCount !== 0) {
        errors.push(createError('semantic', `'${methodName}' takes no arguments`, location));
      }
      return { returnType: BOOL, markMutable: false };
    default:
      if (reportErrors) {
        errors.push(createError('semantic', `Unknown option method '${methodName}'`, location));
      }
      return { returnType: UNKNOWN, markMutable: false };
  }
}

// ─── Result methods ───────────────────────────────────────────────────────────

function resolveResultMethod(
  objectType: { kind: 'result'; okType: YlType; errType: YlType },
  methodName: string,
  argCount: number,
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
): MethodCallResult {
  const okType = objectType.okType;
  switch (methodName) {
    case 'unwrap':
      if (reportErrors && argCount !== 0) {
        errors.push(createError('semantic', `'unwrap' takes no arguments`, location));
      }
      return { returnType: okType, markMutable: false };
    case 'unwrap_or':
      if (reportErrors && argCount !== 1) {
        errors.push(createError('semantic', `'unwrap_or' requires exactly 1 argument`, location));
      }
      return { returnType: okType, markMutable: false };
    case 'is_ok':
    case 'is_err':
      if (reportErrors && argCount !== 0) {
        errors.push(createError('semantic', `'${methodName}' takes no arguments`, location));
      }
      return { returnType: BOOL, markMutable: false };
    default:
      if (reportErrors) {
        errors.push(createError('semantic', `Unknown result method '${methodName}'`, location));
      }
      return { returnType: UNKNOWN, markMutable: false };
  }
}

// ─── Struct methods ───────────────────────────────────────────────────────────

function resolveStructMethod(
  objectType: { kind: 'struct'; name: string; fields: Map<string, YlType> },
  methodName: string,
  location: SourceLocation,
  errors: CompilerError[],
  reportErrors: boolean,
  structMethods?: Map<string, FunctionInfo>,
): MethodCallResult {
  const methodInfo = structMethods?.get(methodName);
  if (methodInfo) {
    return { returnType: methodInfo.returnType, markMutable: false };
  }
  if (reportErrors) {
    errors.push(createError('semantic',
      `Struct '${objectType.name}' has no method '${methodName}'`,
      location));
  }
  return { returnType: UNKNOWN, markMutable: false };
}

