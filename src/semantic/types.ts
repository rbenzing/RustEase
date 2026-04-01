import type { CompilerError } from '../errors/errors.js';
import type { Expression } from '../ast/nodes.js';

// ─── Enum variant ─────────────────────────────────────────────────────────────

export interface EnumVariant {
  name: string;
  data?: YlType[];  // for future data-carrying variants
}

// ─── Discriminated union type system ─────────────────────────────────────────

export type YlType =
  // New structured type variants
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
  | { kind: 'unknown' }
  // Legacy string literals kept for backward compatibility while analyzer.ts,
  // scope.ts, and generator.ts are migrated (P1-S05 / P1-S06).
  | 'int' | 'float' | 'string' | 'bool' | 'void' | 'unknown';

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
  if (typeof type === 'string') {
    if (type === 'unknown') return false;
    return name === undefined || type === name;
  }
  if (type.kind !== 'primitive') return false;
  return name === undefined || type.name === name;
}

/** Returns true for int and float (both legacy strings and new objects). */
export function isNumeric(type: YlType): boolean {
  if (typeof type === 'string') return type === 'int' || type === 'float';
  return type.kind === 'primitive' && (type.name === 'int' || type.name === 'float');
}

/** Returns true when the type represents an unknown / unresolved type. */
export function isUnknown(type: YlType): boolean {
  if (typeof type === 'string') return type === 'unknown';
  return type.kind === 'unknown';
}

// ─── Deep equality ────────────────────────────────────────────────────────────

/** Structural deep equality for two YlType values. */
export function typesEqual(a: YlType, b: YlType): boolean {
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  const na = normaliseLegacy(a);
  const nb = normaliseLegacy(b);
  if (na.kind !== nb.kind) return false;
  switch (na.kind) {
    case 'primitive': return na.name === (nb as typeof na).name;
    case 'unknown':   return true;
    case 'named':     return na.name === (nb as typeof na).name;
    case 'array':     return typesEqual(na.elementType, (nb as typeof na).elementType);
    case 'tuple': {
      const nb2 = nb as typeof na;
      return na.elements.length === nb2.elements.length &&
        na.elements.every((e, i) => typesEqual(e, nb2.elements[i]));
    }
    case 'map': {
      const nb2 = nb as typeof na;
      return typesEqual(na.keyType, nb2.keyType) && typesEqual(na.valueType, nb2.valueType);
    }
    case 'option': return typesEqual(na.innerType, (nb as typeof na).innerType);
    case 'result': {
      const nb2 = nb as typeof na;
      return typesEqual(na.okType, nb2.okType) && typesEqual(na.errType, nb2.errType);
    }
    case 'struct': {
      const nb2 = nb as typeof na;
      if (na.name !== nb2.name || na.fields.size !== nb2.fields.size) return false;
      for (const [k, v] of na.fields) {
        const bv = nb2.fields.get(k);
        if (bv === undefined || !typesEqual(v, bv)) return false;
      }
      return true;
    }
    case 'enum': {
      const nb2 = nb as typeof na;
      if (na.name !== nb2.name || na.variants.length !== nb2.variants.length) return false;
      return na.variants.every((v, i) => {
        const bv = nb2.variants[i];
        if (v.name !== bv.name) return false;
        if ((v.data?.length ?? 0) !== (bv.data?.length ?? 0)) return false;
        return (v.data ?? []).every((t, j) => typesEqual(t, bv.data![j]));
      });
    }
    case 'function': {
      const nb2 = nb as typeof na;
      return typesEqual(na.returnType, nb2.returnType) &&
        na.params.length === nb2.params.length &&
        na.params.every((p, i) => typesEqual(p, nb2.params[i]));
    }
  }
}

// ─── Rust type string generation ──────────────────────────────────────────────

/** Convert a YlType to its Rust type representation. Replaces the YL_TO_RUST_TYPE map. */
export function toRustType(type: YlType): string {
  if (typeof type === 'string') {
    const legacyMap: Record<string, string> = {
      int: 'i32', float: 'f64', string: 'String', bool: 'bool', void: '()', unknown: '/* unknown */',
    };
    return legacyMap[type] ?? '/* unknown */';
  }
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
  if (typeof type === 'string') return type;
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

// ─── Internal helper ──────────────────────────────────────────────────────────

/** Normalise a legacy string YlType to its structured equivalent for comparison. */
function normaliseLegacy(type: YlType): Exclude<YlType, string> {
  if (typeof type !== 'string') return type;
  if (type === 'unknown') return { kind: 'unknown' };
  return { kind: 'primitive', name: type as 'int' | 'float' | 'string' | 'bool' | 'void' };
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

// ─── Deprecated backward-compat alias ────────────────────────────────────────

/**
 * @deprecated Use `toRustType()` instead.
 *
 * Retained while generator.ts is migrated in P1-S06. Typed as
 * `Record<string, string>` (not `Record<YlType, string>`) so that callers
 * that index it with a legacy string YlType continue to compile.
 */
export const YL_TO_RUST_TYPE: Record<string, string> = {
  int: 'i32',
  float: 'f64',
  string: 'String',
  bool: 'bool',
  void: '()',
  unknown: '/* unknown */',
};
