import type { CompilerError } from '../errors/errors.js';
import type { Expression } from '../ast/nodes.js';

// ─── Enum variant ─────────────────────────────────────────────────────────────

export interface EnumVariant {
  name: string;
  data?: YlType[];  // for future data-carrying variants
}

// ─── Discriminated union type system ─────────────────────────────────────────

export type YlType =
  | { kind: 'primitive'; name: 'int' | 'float' | 'string' | 'bool' | 'void' }
  | { kind: 'array'; elementType: YlType }
  | { kind: 'tuple'; elements: YlType[] }
  | { kind: 'map'; keyType: YlType; valueType: YlType }
  | { kind: 'option'; innerType: YlType }
  | { kind: 'result'; okType: YlType; errType: YlType }
  | { kind: 'struct'; name: string; fields: Map<string, YlType> }
  | { kind: 'enum'; name: string; variants: EnumVariant[] }
  | { kind: 'function'; params: YlType[]; returnType: YlType }
  | { kind: 'named'; name: string }
  | { kind: 'unknown' };

// ─── Primitive constants ──────────────────────────────────────────────────────

export const INT: YlType    = { kind: 'primitive', name: 'int' };
export const FLOAT: YlType  = { kind: 'primitive', name: 'float' };
export const STRING: YlType = { kind: 'primitive', name: 'string' };
export const BOOL: YlType   = { kind: 'primitive', name: 'bool' };
export const VOID: YlType   = { kind: 'primitive', name: 'void' };
export const UNKNOWN: YlType = { kind: 'unknown' };

// ─── Type predicates ──────────────────────────────────────────────────────────

/** Returns true when `type` is a primitive, optionally matching a specific name. */
export function isPrimitive(type: YlType, name?: 'int' | 'float' | 'string' | 'bool' | 'void'): boolean {
  if (type.kind !== 'primitive') return false;
  return name === undefined || type.name === name;
}

/** Returns true for int and float. */
export function isNumeric(type: YlType): boolean {
  return type.kind === 'primitive' && (type.name === 'int' || type.name === 'float');
}

/** Returns true when the type represents an unknown / unresolved type. */
export function isUnknown(type: YlType): boolean {
  return type.kind === 'unknown';
}

// ─── Deep equality ────────────────────────────────────────────────────────────

/** Structural deep equality for two YlType values. */
export function typesEqual(a: YlType, b: YlType): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'primitive': return a.name === (b as typeof a).name;
    case 'unknown':   return true;
    case 'named':     return a.name === (b as typeof a).name;
    case 'array':     return typesEqual(a.elementType, (b as typeof a).elementType);
    case 'tuple': {
      const b2 = b as typeof a;
      return a.elements.length === b2.elements.length &&
        a.elements.every((e, i) => typesEqual(e, b2.elements[i]));
    }
    case 'map': {
      const b2 = b as typeof a;
      return typesEqual(a.keyType, b2.keyType) && typesEqual(a.valueType, b2.valueType);
    }
    case 'option': return typesEqual(a.innerType, (b as typeof a).innerType);
    case 'result': {
      const b2 = b as typeof a;
      return typesEqual(a.okType, b2.okType) && typesEqual(a.errType, b2.errType);
    }
    case 'struct': {
      const b2 = b as typeof a;
      if (a.name !== b2.name || a.fields.size !== b2.fields.size) return false;
      for (const [k, v] of a.fields) {
        const bv = b2.fields.get(k);
        if (bv === undefined || !typesEqual(v, bv)) return false;
      }
      return true;
    }
    case 'enum': {
      const b2 = b as typeof a;
      if (a.name !== b2.name || a.variants.length !== b2.variants.length) return false;
      return a.variants.every((v, i) => {
        const bv = b2.variants[i];
        if (v.name !== bv.name) return false;
        if ((v.data?.length ?? 0) !== (bv.data?.length ?? 0)) return false;
        return (v.data ?? []).every((t, j) => typesEqual(t, bv.data![j]));
      });
    }
    case 'function': {
      const b2 = b as typeof a;
      return typesEqual(a.returnType, b2.returnType) &&
        a.params.length === b2.params.length &&
        a.params.every((p, i) => typesEqual(p, b2.params[i]));
    }
  }
}

// ─── Rust type string generation ──────────────────────────────────────────────

/** Convert a YlType to its Rust type representation. */
export function toRustType(type: YlType): string {
  switch (type.kind) {
    case 'primitive': {
      const map: Record<string, string> = {
        int: 'i32', float: 'f64', string: 'String', bool: 'bool', void: '()',
      };
      return map[type.name];
    }
    case 'array':    return `Vec<${toRustType(type.elementType)}>`;
    case 'tuple':    return `(${type.elements.map(toRustType).join(', ')})`;
    case 'map':      return `HashMap<${toRustType(type.keyType)}, ${toRustType(type.valueType)}>`;
    case 'option':   return `Option<${toRustType(type.innerType)}>`;
    case 'result':   return `Result<${toRustType(type.okType)}, ${toRustType(type.errType)}>`;
    case 'struct':   return type.name;
    case 'enum':     return type.name;
    case 'named':    return type.name;
    case 'function': {
      const params = type.params.map(toRustType).join(', ');
      return `fn(${params}) -> ${toRustType(type.returnType)}`;
    }
    case 'unknown':  return '/* unknown */';
  }
}

/** Convert a YlType to a human-readable display string. */
export function typeToString(type: YlType): string {
  switch (type.kind) {
    case 'primitive': return type.name;
    case 'array':     return `array<${typeToString(type.elementType)}>`;
    case 'tuple':     return `(${type.elements.map(typeToString).join(', ')})`;
    case 'map':       return `map<${typeToString(type.keyType)}, ${typeToString(type.valueType)}>`;
    case 'option':    return `option<${typeToString(type.innerType)}>`;
    case 'result':    return `result<${typeToString(type.okType)}, ${typeToString(type.errType)}>`;
    case 'struct':    return `struct ${type.name}`;
    case 'enum':      return `enum ${type.name}`;
    case 'named':     return type.name;
    case 'function': {
      const params = type.params.map(typeToString).join(', ');
      return `fn(${params}) -> ${typeToString(type.returnType)}`;
    }
    case 'unknown':   return 'unknown';
  }
}

// ─── Existing interfaces (unchanged) ─────────────────────────────────────────

export interface TypeInfo {
  ylType: YlType;
  rustType: string;
}

export interface FunctionInfo {
  name: string;
  parameterTypes: YlType[];
  returnType: YlType;
  /** Default value expressions indexed by parameter position; undefined means no default. */
  paramDefaults?: (Expression | undefined)[];
}

export interface AnalysisResult {
  variableTypes: Map<string, YlType>;      // key: "functionName:varName" or "StructName.methodName:varName"
  mutableVariables: Set<string>;            // key: "functionName:varName"
  constVariables: Set<string>;             // key: "functionName:varName" — function-body const vars
  globalConstants: Map<string, YlType>;    // top-level const name → type
  functionTypes: Map<string, FunctionInfo>;
  enumTypes: Map<string, YlType>;          // enum name → { kind: 'enum', name, variants }
  structDeclarations: Map<string, Map<string, YlType>>;  // struct name → (fieldName → YlType)
  implMethods: Map<string, Map<string, FunctionInfo>>;   // struct name → (method name → FunctionInfo)
  mutatingMethods: Set<string>;            // key: "StructName.methodName" — methods that assign to self fields
  usedVariables: Set<string>;              // key: "functionName:varName" — variables that have been read
  variableLocations: Map<string, import('../errors/errors.js').SourceLocation>;  // key: "functionName:varName" → declaration location
  errors: CompilerError[];
  warnings: CompilerError[];
}


