import type {
  Program, FunctionDeclaration, Statement, Expression,
  BinaryOperator, ConstDeclaration, EnumDeclaration, StructDeclaration, ImplDeclaration,
} from '../ast/nodes.js';
import { getFunctions } from '../ast/nodes.js';
import type { SourceLocation } from '../errors/errors.js';
import { createError } from '../errors/errors.js';
import type { YlType, FunctionInfo, AnalysisResult, EnumVariant } from './types.js';
import { INT, FLOAT, STRING, BOOL, VOID, UNKNOWN, isPrimitive, isNumeric, isUnknown, typesEqual, typeToString } from './types.js';
import { Scope } from './scope.js';
import { findClosest } from './suggest.js';
import { builtinRegistry } from './builtins.js';
import { resolveMethodCall } from './method-resolver.js';

export function analyze(program: Program): AnalysisResult {
  const result: AnalysisResult = {
    variableTypes: new Map(),
    mutableVariables: new Set(),
    constVariables: new Set(),
    globalConstants: new Map(),
    functionTypes: new Map(),
    enumTypes: new Map(),
    structDeclarations: new Map(),
    implMethods: new Map(),
    mutatingMethods: new Set(),
    usedVariables: new Set(),
    variableLocations: new Map(),
    errors: [],
    warnings: [],
  };

  const userFunctions = new Map<string, FunctionDeclaration>();
  // Track call-site argument types for parameter inference
  const callSiteArgs = new Map<string, YlType[][]>();
  // Track which variables have been assigned (for mutability)
  const assignmentCount = new Map<string, number>();

  // Collect top-level struct declarations
  for (const decl of program.declarations) {
    if (decl.kind === 'StructDeclaration') {
      const structDecl = decl as StructDeclaration;
      if (result.structDeclarations.has(structDecl.name)) {
        result.errors.push(createError('semantic', `Duplicate struct name '${structDecl.name}'`, structDecl.location));
      } else {
        const fieldMap = new Map<string, YlType>();
        for (const field of structDecl.fields) {
          fieldMap.set(field.name, annotationToYlType(field.typeAnnotation));
        }
        result.structDeclarations.set(structDecl.name, fieldMap);
      }
    }
  }

  // Collect top-level enum declarations
  for (const decl of program.declarations) {
    if (decl.kind === 'EnumDeclaration') {
      const enumDecl = decl as EnumDeclaration;
      const ylType: YlType = {
        kind: 'enum',
        name: enumDecl.name,
        variants: enumDecl.variants.map(v => ({
          name: v.name,
          data: v.data?.map(t => annotationToYlType(t)),
        })),
      };
      result.enumTypes.set(enumDecl.name, ylType);
    }
  }

  // Collect top-level const declarations
  for (const decl of program.declarations) {
    if (decl.kind === 'ConstDeclaration') {
      const constDecl = decl as ConstDeclaration;
      const ylType = inferConstType(constDecl.value);
      result.globalConstants.set(constDecl.name, ylType);
    }
  }

  // Collect impl declarations — resolve method signatures from annotations
  for (const decl of program.declarations) {
    if (decl.kind === 'ImplDeclaration') {
      const implDecl = decl as ImplDeclaration;
      const structFields = result.structDeclarations.get(implDecl.structName);
      if (!structFields) {
        result.errors.push(createError('semantic', `impl for unknown struct '${implDecl.structName}'`, implDecl.location));
        continue;
      }
      const methods = new Map<string, FunctionInfo>();
      for (const method of implDecl.methods) {
        const paramTypes: YlType[] = method.parameters.map(p =>
          p.typeAnnotation ? annotationToYlType(p.typeAnnotation) : UNKNOWN
        );
        const returnType: YlType = method.returnTypeAnnotation
          ? annotationToYlType(method.returnTypeAnnotation)
          : VOID;
        methods.set(method.name, { name: method.name, parameterTypes: paramTypes, returnType });
        // Track methods that modify self fields
        if (stmtsMutateSelf(method.body)) {
          result.mutatingMethods.add(`${implDecl.structName}.${method.name}`);
        }
      }
      result.implMethods.set(implDecl.structName, methods);
    }
  }

  // Register all user functions
  for (const fn of getFunctions(program)) {
    if (builtinRegistry.has(fn.name)) {
      result.errors.push(createError('semantic', `Cannot redefine built-in function '${fn.name}'`, fn.location));
      continue;
    }
    userFunctions.set(fn.name, fn);
  }

  // Check main() has zero parameters
  const mainFn = userFunctions.get('main');
  if (mainFn && mainFn.parameters.length > 0) {
    result.errors.push(createError('semantic', "'main' function must have zero parameters", mainFn.location));
  }

  // Pass 1: Collect types from all function bodies
  for (const fn of getFunctions(program)) {
    if (!userFunctions.has(fn.name)) continue;
    const scope = new Scope();
    // Make global constants visible
    for (const [name, type] of result.globalConstants) {
      scope.define(name, type);
    }
    // Define parameters with unknown type initially
    for (const param of fn.parameters) {
      scope.define(param.name, UNKNOWN);
    }
    collectTypes(fn, fn.body, scope, result, callSiteArgs, assignmentCount, userFunctions);
  }

  // Resolve parameter types from call sites
  for (const fn of getFunctions(program)) {
    if (!userFunctions.has(fn.name)) continue;

    // Validate default parameter ordering: non-default params cannot follow default params
    let seenDefault = false;
    for (const param of fn.parameters) {
      if (param.defaultValue !== undefined) {
        seenDefault = true;
      } else if (seenDefault) {
        result.errors.push(createError('semantic',
          `Non-default parameter '${param.name}' cannot follow a default parameter`,
          param.location));
      }
    }

    const paramTypes: YlType[] = [];
    const paramDefaults: (import('../ast/nodes.js').Expression | undefined)[] = [];
    const calls = callSiteArgs.get(fn.name);
    for (let i = 0; i < fn.parameters.length; i++) {
      const param = fn.parameters[i];
      paramDefaults.push(param.defaultValue);

      let resolved: YlType = UNKNOWN;
      // Priority 1: explicit type annotation on the parameter
      if (param.typeAnnotation) {
        const annotType = annotationToYlType(param.typeAnnotation);
        if (!isUnknown(annotType)) resolved = annotType;
      }
      // Priority 2: type inferred from call sites
      if (isUnknown(resolved) && calls) {
        for (const args of calls) {
          if (i < args.length && !isUnknown(args[i]!)) {
            resolved = args[i]!;
            break;
          }
        }
      }
      // Priority 3: type inferred from default value expression
      if (isUnknown(resolved) && param.defaultValue !== undefined) {
        const tempScope = new Scope();
        for (const [name, type] of result.globalConstants) tempScope.define(name, type);
        const defaultType = inferExprType(fn, param.defaultValue, tempScope, result, userFunctions, false);
        if (!isUnknown(defaultType)) resolved = defaultType;
      }
      paramTypes.push(isUnknown(resolved) ? INT : resolved);
    }
    // Store function info (return type computed in pass 2)
    result.functionTypes.set(fn.name, { name: fn.name, parameterTypes: paramTypes, returnType: VOID, paramDefaults });
  }

  // Pass 2: Full validation with resolved parameter types
  for (const fn of getFunctions(program)) {
    if (!userFunctions.has(fn.name)) continue;
    const scope = new Scope();
    const fnInfo = result.functionTypes.get(fn.name)!;
    // Make global constants visible
    for (const [name, type] of result.globalConstants) {
      scope.define(name, type);
    }
    for (let i = 0; i < fn.parameters.length; i++) {
      const pType = fnInfo.parameterTypes[i];
      scope.define(fn.parameters[i].name, pType);
      result.variableTypes.set(`${fn.name}:${fn.parameters[i].name}`, pType);
    }
    validateBody(fn, fn.body, scope, result, assignmentCount, userFunctions);
    // Infer return type
    fnInfo.returnType = inferReturnType(fn, fn.body, scope, result, userFunctions);
  }

  // Analyze impl method bodies
  for (const decl of program.declarations) {
    if (decl.kind === 'ImplDeclaration') {
      const implDecl = decl as ImplDeclaration;
      const structFields = result.structDeclarations.get(implDecl.structName);
      if (!structFields) continue;
      const structType: YlType = { kind: 'struct', name: implDecl.structName, fields: structFields };

      for (const method of implDecl.methods) {
        const methodKey = `${implDecl.structName}.${method.name}`;
        // Use a synthetic FunctionDeclaration with name = methodKey for keyed tracking
        const syntheticFn: FunctionDeclaration = { ...method, name: methodKey };

        // Pass 1: collect types
        const scope1 = new Scope();
        for (const [name, type] of result.globalConstants) scope1.define(name, type);
        scope1.define('self', structType);
        const methodInfo = result.implMethods.get(implDecl.structName)?.get(method.name);
        for (let i = 0; i < method.parameters.length; i++) {
          const pType = methodInfo?.parameterTypes[i] ?? UNKNOWN;
          scope1.define(method.parameters[i].name, pType);
        }
        collectTypes(syntheticFn, method.body, scope1, result, callSiteArgs, assignmentCount, userFunctions);

        // Pass 2: validate
        const scope2 = new Scope();
        for (const [name, type] of result.globalConstants) scope2.define(name, type);
        scope2.define('self', structType);
        if (methodInfo) {
          for (let i = 0; i < method.parameters.length; i++) {
            const pType = methodInfo.parameterTypes[i] ?? UNKNOWN;
            scope2.define(method.parameters[i].name, pType);
            result.variableTypes.set(`${methodKey}:${method.parameters[i].name}`, pType);
          }
        }
        validateBody(syntheticFn, method.body, scope2, result, assignmentCount, userFunctions);
      }
    }
  }

  // --- Unused variable detection (S-04) ---
  // Collect all function parameter keys so we can skip them (params serve as documentation)
  const parameterKeys = new Set<string>();
  for (const fn of getFunctions(program)) {
    if (!userFunctions.has(fn.name)) continue;
    for (const param of fn.parameters) {
      parameterKeys.add(`${fn.name}:${param.name}`);
    }
  }
  for (const decl of program.declarations) {
    if (decl.kind === 'ImplDeclaration') {
      const implDecl = decl as ImplDeclaration;
      for (const method of implDecl.methods) {
        const methodKey = `${implDecl.structName}.${method.name}`;
        for (const param of method.parameters) {
          parameterKeys.add(`${methodKey}:${param.name}`);
        }
      }
    }
  }

  // Emit a warning for each declared variable that was never read
  for (const [key] of result.variableTypes) {
    if (parameterKeys.has(key)) continue;
    const colonIdx = key.indexOf(':');
    if (colonIdx === -1) continue;
    const varName = key.slice(colonIdx + 1);
    // Skip underscore-prefixed variables (Rust convention for intentionally unused)
    if (varName.startsWith('_')) continue;
    if (!result.usedVariables.has(key)) {
      const location = result.variableLocations.get(key);
      if (location) {
        result.warnings.push(createError('semantic', `Variable '${varName}' is declared but never used`, location));
      }
    }
  }

  return result;
}

/** Convert a type annotation string to a YlType. Supports compound types like array<int>, map<K,V>. */
function annotationToYlType(annotation: string): YlType {
  return parseTypeString(annotation.trim());
}

/** Recursively parse a type string into a YlType. */
function parseTypeString(s: string): YlType {
  const ltIdx = s.indexOf('<');
  if (ltIdx === -1) {
    switch (s) {
      case 'int': return INT;
      case 'float': return FLOAT;
      case 'string': return STRING;
      case 'bool': return BOOL;
      default: return UNKNOWN;
    }
  }
  const typeName = s.slice(0, ltIdx).trim();
  const inner = s.slice(ltIdx + 1, s.lastIndexOf('>')).trim();
  switch (typeName) {
    case 'array': return { kind: 'array', elementType: parseTypeString(inner) };
    case 'option': return { kind: 'option', innerType: parseTypeString(inner) };
    case 'map': {
      const [keyStr, valueStr] = splitAtTopLevelComma(inner);
      return { kind: 'map', keyType: parseTypeString(keyStr.trim()), valueType: parseTypeString(valueStr.trim()) };
    }
    case 'result': {
      const [okStr, errStr] = splitAtTopLevelComma(inner);
      return { kind: 'result', okType: parseTypeString(okStr.trim()), errType: parseTypeString(errStr.trim()) };
    }
    default: return UNKNOWN;
  }
}

/** Split a string at the first top-level comma (not nested in < >). */
function splitAtTopLevelComma(s: string): [string, string] {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '<') depth++;
    else if (s[i] === '>') depth--;
    else if (s[i] === ',' && depth === 0) {
      return [s.slice(0, i), s.slice(i + 1)];
    }
  }
  return [s, ''];
}

/** Returns true when a YlType contains 'unknown' at any depth. */
function typeContainsUnknown(type: YlType): boolean {
  switch (type.kind) {
    case 'unknown': return true;
    case 'primitive': return false;
    case 'array': return typeContainsUnknown(type.elementType);
    case 'map': return typeContainsUnknown(type.keyType) || typeContainsUnknown(type.valueType);
    case 'option': return typeContainsUnknown(type.innerType);
    case 'result': return typeContainsUnknown(type.okType) || typeContainsUnknown(type.errType);
    default: return false;
  }
}

/** Infer type of a top-level const value (must be a literal). */
function inferConstType(expr: Expression): YlType {
  if (expr.kind === 'Literal') {
    const litMap: Record<string, YlType> = { int: INT, float: FLOAT, string: STRING, bool: BOOL };
    return litMap[expr.literalType] ?? UNKNOWN;
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '-' && expr.operand.kind === 'Literal') {
    const litMap: Record<string, YlType> = { int: INT, float: FLOAT };
    return litMap[expr.operand.literalType] ?? UNKNOWN;
  }
  return UNKNOWN;
}

/** Mark the root identifier of an expression as mutable. */
function markRootAsMutable(fn: FunctionDeclaration, expr: Expression, result: AnalysisResult): void {
  if (expr.kind === 'Identifier') {
    result.mutableVariables.add(`${fn.name}:${expr.name}`);
  }
}

/** Returns true if any statement in the list assigns to a self field. */
function stmtsMutateSelf(stmts: Statement[]): boolean {
  for (const stmt of stmts) {
    if (stmt.kind === 'FieldAssignment' && stmt.object === 'self') return true;
    if (stmt.kind === 'IfStatement') {
      if (stmtsMutateSelf(stmt.thenBranch)) return true;
      for (const branch of stmt.elseIfBranches) {
        if (stmtsMutateSelf(branch.body)) return true;
      }
      if (stmt.elseBranch && stmtsMutateSelf(stmt.elseBranch)) return true;
    }
    if (stmt.kind === 'WhileStatement' && stmtsMutateSelf(stmt.body)) return true;
    if (stmt.kind === 'ForStatement' && stmtsMutateSelf(stmt.body)) return true;
  }
  return false;
}

// --- Pass 1: Type collection ---
function collectTypes(
  fn: FunctionDeclaration, stmts: Statement[], scope: Scope,
  result: AnalysisResult, callSiteArgs: Map<string, YlType[][]>,
  assignmentCount: Map<string, number>, userFunctions: Map<string, FunctionDeclaration>,
): void {
  for (const stmt of stmts) {
    switch (stmt.kind) {
      case 'VariableAssignment': {
        const key = `${fn.name}:${stmt.identifier}`;
        if (stmt.isConst) {
          result.constVariables.add(key);
        }
        const count = (assignmentCount.get(key) ?? 0) + 1;
        assignmentCount.set(key, count);
        if (count > 1) result.mutableVariables.add(key);
        const exprType = inferExprType(fn, stmt.expression, scope, result, userFunctions, false);
        // Propagate call-site argument types for function calls in the RHS
        collectCallSites(fn, stmt.expression, scope, result, callSiteArgs, userFunctions);
        // Determine effective type: annotation takes priority over inferred type
        let effectiveType = exprType;
        if (stmt.typeAnnotation) {
          const annotationType = annotationToYlType(stmt.typeAnnotation);
          if (!isUnknown(annotationType)) {
            // Emit conflict error only when the inferred type is fully resolved and mismatches
            if (!typeContainsUnknown(exprType) && !typesEqual(exprType, annotationType)) {
              result.errors.push(createError('semantic',
                `Type annotation '${stmt.typeAnnotation}' conflicts with inferred type '${typeToString(exprType)}'`,
                stmt.location));
            }
            effectiveType = annotationType;
          }
        }
        if (!scope.isDefined(stmt.identifier)) {
          scope.define(stmt.identifier, effectiveType);
        }
        result.variableTypes.set(key, effectiveType);
        // Track declaration location (only first declaration)
        if (!result.variableLocations.has(key)) {
          result.variableLocations.set(key, stmt.location);
        }
        break;
      }
      case 'IndexAssignment':
        // Mark the array variable as mutable
        markRootAsMutable(fn, stmt.object, result);
        break;
      case 'FieldAssignment':
        // Mark the struct variable as mutable when any field is assigned
        result.mutableVariables.add(`${fn.name}:${stmt.object}`);
        break;
      case 'IfStatement':
        collectTypes(fn, stmt.thenBranch, scope, result, callSiteArgs, assignmentCount, userFunctions);
        for (const branch of stmt.elseIfBranches) {
          collectTypes(fn, branch.body, scope, result, callSiteArgs, assignmentCount, userFunctions);
        }
        if (stmt.elseBranch) collectTypes(fn, stmt.elseBranch, scope, result, callSiteArgs, assignmentCount, userFunctions);
        break;
      case 'WhileStatement':
        collectTypes(fn, stmt.body, scope, result, callSiteArgs, assignmentCount, userFunctions);
        break;
      case 'ForStatement': {
        if (stmt.destructure) {
          // Map destructuring: for (k, v) in map_expr
          const iterType = inferExprType(fn, stmt.iterable, scope, result, userFunctions, false);
          let keyType: YlType = UNKNOWN;
          let valueType: YlType = UNKNOWN;
          if (iterType.kind === 'map') {
            keyType = iterType.keyType;
            valueType = iterType.valueType;
          }
          const keyKey = `${fn.name}:${stmt.destructure.key}`;
          const valKey = `${fn.name}:${stmt.destructure.value}`;
          result.variableTypes.set(keyKey, keyType);
          result.variableTypes.set(valKey, valueType);
          if (!result.variableLocations.has(keyKey)) {
            result.variableLocations.set(keyKey, stmt.location);
          }
          if (!result.variableLocations.has(valKey)) {
            result.variableLocations.set(valKey, stmt.location);
          }
          if (!scope.isDefined(stmt.destructure.key)) {
            scope.define(stmt.destructure.key, keyType);
          }
          if (!scope.isDefined(stmt.destructure.value)) {
            scope.define(stmt.destructure.value, valueType);
          }
        } else {
          // Determine loop variable type from iterable
          let loopVarType: YlType = INT;
          if (stmt.iterable.kind !== 'RangeExpression') {
            const iterType = inferExprType(fn, stmt.iterable, scope, result, userFunctions, false);
            if (iterType.kind === 'array') {
              loopVarType = iterType.elementType;
            }
          }
          const key = `${fn.name}:${stmt.variable}`;
          result.variableTypes.set(key, loopVarType);
          // Track for-loop variable declaration location (only first)
          if (!result.variableLocations.has(key)) {
            result.variableLocations.set(key, stmt.location);
          }
          if (!scope.isDefined(stmt.variable)) {
            scope.define(stmt.variable, loopVarType);
          }
        }
        collectTypes(fn, stmt.body, scope, result, callSiteArgs, assignmentCount, userFunctions);
        break;
      }
      case 'MatchStatement': {
        const matchExprTypeCollect = inferExprType(fn, stmt.expression, scope, result, userFunctions, false);
        for (const arm of stmt.arms) {
          // Pre-register pattern bindings so arm body can reference them during type collection
          if (arm.pattern.kind === 'EnumPattern' && arm.pattern.bindings && arm.pattern.bindings.length > 0) {
            const enumPat = arm.pattern;
            const resolvedName = enumPat.enumName ||
              (matchExprTypeCollect.kind === 'enum' ? matchExprTypeCollect.name : '');
            const enumTypeVal = resolvedName ? result.enumTypes.get(resolvedName) : undefined;
            if (enumTypeVal && enumTypeVal.kind === 'enum') {
              const variantDef = enumTypeVal.variants.find(v => v.name === enumPat.variant);
              const bindings = enumPat.bindings; // guarded non-null by outer if
              if (variantDef && variantDef.data && bindings) {
                for (let i = 0; i < Math.min(bindings.length, variantDef.data.length); i++) {
                  const bindType = variantDef.data[i] ?? UNKNOWN;
                  const bindName = bindings[i]!;
                  if (!scope.isDefined(bindName)) {
                    scope.define(bindName, bindType);
                  }
                  result.variableTypes.set(`${fn.name}:${bindName}`, bindType);
                }
              }
            }
          }
          collectTypes(fn, arm.body, scope, result, callSiteArgs, assignmentCount, userFunctions);
        }
        break;
      }
      case 'ExpressionStatement':
        collectCallSites(fn, stmt.expression, scope, result, callSiteArgs, userFunctions);
        // Mark mutability for push/pop and map-mutating method calls
        if (stmt.expression.kind === 'MethodCall') {
          const mc = stmt.expression;
          if (mc.method === 'push' || mc.method === 'pop' || mc.method === 'remove') {
            markRootAsMutable(fn, mc.object, result);
          }
          // Mark struct receiver as mutable when calling a method that modifies self
          if (mc.object.kind === 'Identifier') {
            const objType = inferExprType(fn, mc.object, scope, result, userFunctions, false);
            if (objType.kind === 'struct') {
              if (result.mutatingMethods.has(`${objType.name}.${mc.method}`)) {
                result.mutableVariables.add(`${fn.name}:${mc.object.name}`);
              }
            }
          }
        }
        break;
      case 'ReturnStatement':
        if (stmt.expression !== null) {
          collectCallSites(fn, stmt.expression, scope, result, callSiteArgs, userFunctions);
        }
        break;
    }
  }
}

function collectCallSites(
  fn: FunctionDeclaration, expr: Expression, scope: Scope,
  result: AnalysisResult, callSiteArgs: Map<string, YlType[][]>,
  userFunctions: Map<string, FunctionDeclaration>,
): void {
  if (expr.kind === 'FunctionCall' && !builtinRegistry.has(expr.name)) {
    const argTypes = expr.arguments.map(a => inferExprType(fn, a, scope, result, userFunctions, false));
    if (!callSiteArgs.has(expr.name)) callSiteArgs.set(expr.name, []);
    callSiteArgs.get(expr.name)!.push(argTypes);
  }
  // Recurse into sub-expressions
  if (expr.kind === 'BinaryExpression') {
    collectCallSites(fn, expr.left, scope, result, callSiteArgs, userFunctions);
    collectCallSites(fn, expr.right, scope, result, callSiteArgs, userFunctions);
  } else if (expr.kind === 'UnaryExpression') {
    collectCallSites(fn, expr.operand, scope, result, callSiteArgs, userFunctions);
  } else if (expr.kind === 'GroupedExpression') {
    collectCallSites(fn, expr.expression, scope, result, callSiteArgs, userFunctions);
  } else if (expr.kind === 'FunctionCall') {
    for (const arg of expr.arguments) {
      collectCallSites(fn, arg, scope, result, callSiteArgs, userFunctions);
    }
  } else if (expr.kind === 'MethodCall') {
    collectCallSites(fn, expr.object, scope, result, callSiteArgs, userFunctions);
    for (const arg of expr.arguments) {
      collectCallSites(fn, arg, scope, result, callSiteArgs, userFunctions);
    }
  } else if (expr.kind === 'ArrayLiteral') {
    for (const elem of expr.elements) {
      collectCallSites(fn, elem, scope, result, callSiteArgs, userFunctions);
    }
  } else if (expr.kind === 'MapLiteral') {
    for (const entry of expr.entries) {
      collectCallSites(fn, entry.key, scope, result, callSiteArgs, userFunctions);
      collectCallSites(fn, entry.value, scope, result, callSiteArgs, userFunctions);
    }
  } else if (expr.kind === 'IndexExpression') {
    collectCallSites(fn, expr.object, scope, result, callSiteArgs, userFunctions);
    collectCallSites(fn, expr.index, scope, result, callSiteArgs, userFunctions);
  } else if (expr.kind === 'IfExpression') {
    collectCallSites(fn, expr.condition, scope, result, callSiteArgs, userFunctions);
    collectCallSites(fn, expr.thenBranch, scope, result, callSiteArgs, userFunctions);
    collectCallSites(fn, expr.elseBranch, scope, result, callSiteArgs, userFunctions);
  } else if (expr.kind === 'TupleLiteral') {
    for (const elem of expr.elements) {
      collectCallSites(fn, elem, scope, result, callSiteArgs, userFunctions);
    }
  } else if (expr.kind === 'EnumVariantAccess' && expr.arguments) {
    for (const arg of expr.arguments) {
      collectCallSites(fn, arg, scope, result, callSiteArgs, userFunctions);
    }
  }
}

// --- Pass 2: Validation ---
function validateBody(
  fn: FunctionDeclaration, stmts: Statement[], scope: Scope,
  result: AnalysisResult, assignmentCount: Map<string, number>,
  userFunctions: Map<string, FunctionDeclaration>,
): void {
  let terminalKeyword: string | null = null;
  let warnedUnreachable = false;
  for (const stmt of stmts) {
    // Unreachable code detection: emit one warning per block after a terminal statement
    if (terminalKeyword !== null && !warnedUnreachable) {
      result.warnings.push(createError('semantic', `Unreachable code after '${terminalKeyword}'`, stmt.location));
      warnedUnreachable = true;
    }
    switch (stmt.kind) {
      case 'VariableAssignment': {
        const key2 = `${fn.name}:${stmt.identifier}`;
        // Check if this is a reassignment to a const variable
        if (result.constVariables.has(key2) && scope.isDefined(stmt.identifier)) {
          result.errors.push(createError('semantic', `Cannot reassign constant variable '${stmt.identifier}'`, stmt.location));
        }
        // Check if this is a reassignment to a top-level global constant
        if (result.globalConstants.has(stmt.identifier)) {
          result.errors.push(createError('semantic', `Cannot reassign constant '${stmt.identifier}'`, stmt.location));
        }
        const exprType = inferExprType(fn, stmt.expression, scope, result, userFunctions, true);
        // Determine effective type using annotation (annotation wins, no re-emit of conflict errors)
        let effectiveType2 = exprType;
        if (stmt.typeAnnotation) {
          const annotationType = annotationToYlType(stmt.typeAnnotation);
          if (!isUnknown(annotationType)) {
            effectiveType2 = annotationType;
          }
        }
        if (!scope.isDefined(stmt.identifier)) {
          scope.define(stmt.identifier, effectiveType2);
        }
        // Update variableTypes in Pass 2 to capture types resolved from function return types
        const prevType = result.variableTypes.get(key2);
        if (prevType !== undefined && isUnknown(prevType) && !isUnknown(effectiveType2)) {
          result.variableTypes.set(key2, effectiveType2);
        }
        break;
      }
      case 'ReturnStatement':
        if (stmt.expression !== null) {
          inferExprType(fn, stmt.expression, scope, result, userFunctions, true);
        }
        terminalKeyword = 'return';
        break;
      case 'IfStatement': {
        const condType = inferExprType(fn, stmt.condition, scope, result, userFunctions, true);
        if (!isPrimitive(condType, 'bool') && !isUnknown(condType)) {
          result.errors.push(createError('semantic', `Condition must be bool, got '${typeToString(condType)}'`, stmt.location));
        }
        validateBody(fn, stmt.thenBranch, scope, result, assignmentCount, userFunctions);
        for (const branch of stmt.elseIfBranches) {
          const branchCondType = inferExprType(fn, branch.condition, scope, result, userFunctions, true);
          if (!isPrimitive(branchCondType, 'bool') && !isUnknown(branchCondType)) {
            result.errors.push(createError('semantic', `Condition must be bool, got '${typeToString(branchCondType)}'`, branch.location));
          }
          validateBody(fn, branch.body, scope, result, assignmentCount, userFunctions);
        }
        if (stmt.elseBranch) validateBody(fn, stmt.elseBranch, scope, result, assignmentCount, userFunctions);
        break;
      }
      case 'WhileStatement': {
        const condType = inferExprType(fn, stmt.condition, scope, result, userFunctions, true);
        if (!isPrimitive(condType, 'bool') && !isUnknown(condType)) {
          result.errors.push(createError('semantic', `Condition must be bool, got '${typeToString(condType)}'`, stmt.location));
        }
        const loopScope = scope.createLoopScope();
        validateBody(fn, stmt.body, loopScope, result, assignmentCount, userFunctions);
        break;
      }
      case 'ForStatement': {
        if (stmt.destructure) {
          // Map destructuring: for (k, v) in map_expr
          const iterType = inferExprType(fn, stmt.iterable, scope, result, userFunctions, true);
          let keyType: YlType = UNKNOWN;
          let valueType: YlType = UNKNOWN;
          if (iterType.kind === 'map') {
            keyType = iterType.keyType;
            valueType = iterType.valueType;
          } else if (!isUnknown(iterType)) {
            result.errors.push(createError('semantic',
              `Destructuring is only supported for map types, got '${typeToString(iterType)}'`,
              stmt.iterable.location));
          }
          const keyKey = `${fn.name}:${stmt.destructure.key}`;
          const valKey = `${fn.name}:${stmt.destructure.value}`;
          result.variableTypes.set(keyKey, keyType);
          result.variableTypes.set(valKey, valueType);
          const forLoopScope = scope.createLoopScope();
          forLoopScope.define(stmt.destructure.key, keyType);
          forLoopScope.define(stmt.destructure.value, valueType);
          validateBody(fn, stmt.body, forLoopScope, result, assignmentCount, userFunctions);
        } else {
          let loopVarType: YlType = INT;
          if (stmt.iterable.kind === 'RangeExpression') {
            const startType = inferExprType(fn, stmt.iterable.start, scope, result, userFunctions, true);
            const endType = inferExprType(fn, stmt.iterable.end, scope, result, userFunctions, true);
            if (!isPrimitive(startType, 'int') && !isUnknown(startType)) {
              result.errors.push(createError('semantic', `Range start must be int, got '${typeToString(startType)}'`, stmt.iterable.location));
            }
            if (!isPrimitive(endType, 'int') && !isUnknown(endType)) {
              result.errors.push(createError('semantic', `Range end must be int, got '${typeToString(endType)}'`, stmt.iterable.location));
            }
            loopVarType = INT;
          } else {
            const iterType = inferExprType(fn, stmt.iterable, scope, result, userFunctions, true);
            if (iterType.kind === 'array') {
              loopVarType = iterType.elementType;
            } else if (!isUnknown(iterType)) {
              result.errors.push(createError('semantic', `Cannot iterate over non-iterable type '${typeToString(iterType)}'`, stmt.iterable.location));
            }
          }
          const forKey = `${fn.name}:${stmt.variable}`;
          result.variableTypes.set(forKey, loopVarType);
          const forLoopScope = scope.createLoopScope();
          forLoopScope.define(stmt.variable, loopVarType);
          validateBody(fn, stmt.body, forLoopScope, result, assignmentCount, userFunctions);
        }
        break;
      }
      case 'MatchStatement': {
        const matchExprType = inferExprType(fn, stmt.expression, scope, result, userFunctions, true);
        for (const arm of stmt.arms) {
          // Validate pattern against match expression type
          if (arm.pattern.kind === 'LiteralPattern') {
            const patType = inferExprType(fn, arm.pattern.value, scope, result, userFunctions, false);
            if (!isUnknown(matchExprType) && !isUnknown(patType) && !typesEqual(matchExprType, patType)) {
              result.errors.push(createError('semantic',
                `Match pattern type '${typeToString(patType)}' does not match expression type '${typeToString(matchExprType)}'`,
                arm.location));
            }
            validateBody(fn, arm.body, scope, result, assignmentCount, userFunctions);
          } else if (arm.pattern.kind === 'EnumPattern') {
            const enumPat = arm.pattern; // capture narrowed type for use in callbacks
            // Resolve enum name: use qualified name or infer from match expression type
            const resolvedEnumName = enumPat.enumName ||
              (matchExprType.kind === 'enum' ? matchExprType.name : '');
            const enumType = resolvedEnumName ? result.enumTypes.get(resolvedEnumName) : undefined;
            if (!enumType) {
              if (enumPat.enumName) {
                result.errors.push(createError('semantic',
                  `Undefined enum '${enumPat.enumName}' in match pattern`, arm.location));
              } else {
                result.errors.push(createError('semantic',
                  `Cannot resolve enum for unqualified pattern '${enumPat.variant}'`, arm.location));
              }
              validateBody(fn, arm.body, scope, result, assignmentCount, userFunctions);
            } else {
              let variantDef: EnumVariant | undefined;
              if (enumType.kind === 'enum') {
                variantDef = enumType.variants.find(v => v.name === enumPat.variant);
                if (!variantDef) {
                  result.errors.push(createError('semantic',
                    `Undefined variant '${enumPat.variant}' on enum '${resolvedEnumName}'`, arm.location));
                }
              }
              if (!isUnknown(matchExprType) && !typesEqual(matchExprType, enumType)) {
                result.errors.push(createError('semantic',
                  `Enum pattern '${resolvedEnumName}.${enumPat.variant}' does not match expression type '${typeToString(matchExprType)}'`,
                  arm.location));
              }
              // Create an arm-specific scope for pattern bindings
              const armScope = scope.createBlockScope();
              if (enumPat.bindings && enumPat.bindings.length > 0 && variantDef) {
                const expectedData = variantDef.data ?? [];
                if (enumPat.bindings.length !== expectedData.length) {
                  result.errors.push(createError('semantic',
                    `Pattern for '${enumPat.variant}' has ${enumPat.bindings.length} binding(s), but variant has ${expectedData.length} field(s)`,
                    arm.location));
                }
                for (let i = 0; i < Math.min(enumPat.bindings.length, expectedData.length); i++) {
                  const bindType = expectedData[i] ?? UNKNOWN;
                  const bindName = enumPat.bindings[i]!;
                  armScope.define(bindName, bindType);
                  // Register in variableTypes (no location → no unused-var warning for bindings)
                  result.variableTypes.set(`${fn.name}:${bindName}`, bindType);
                }
              }
              validateBody(fn, arm.body, armScope, result, assignmentCount, userFunctions);
            }
          } else {
            validateBody(fn, arm.body, scope, result, assignmentCount, userFunctions);
          }
        }
        // Exhaustiveness check: only for known enum types
        if (matchExprType.kind === 'enum') {
          const allVariants = new Set(matchExprType.variants.map(v => v.name));
          const coveredVariants = new Set<string>();
          let hasCatchAll = false;
          for (const arm of stmt.arms) {
            if (arm.pattern.kind === 'WildcardPattern') {
              hasCatchAll = true;
              break;
            } else if (arm.pattern.kind === 'IdentifierPattern') {
              // Non-enum identifier pattern acts as a catch-all binding
              hasCatchAll = true;
              break;
            } else if (arm.pattern.kind === 'EnumPattern') {
              coveredVariants.add(arm.pattern.variant);
            }
          }
          if (!hasCatchAll) {
            const missing = [...allVariants].filter(v => !coveredVariants.has(v));
            if (missing.length > 0) {
              result.errors.push(createError('semantic',
                `Non-exhaustive match on '${matchExprType.name}': missing variants ${missing.map(v => `'${v}'`).join(', ')}`,
                stmt.location));
            }
          }
        }
        break;
      }
      case 'ExpressionStatement':
        inferExprType(fn, stmt.expression, scope, result, userFunctions, true);
        break;
      case 'BreakStatement':
        if (!scope.isInLoop()) {
          result.errors.push(createError('semantic', `break can only be used inside a loop`, stmt.location));
        }
        terminalKeyword = 'break';
        break;
      case 'ContinueStatement':
        if (!scope.isInLoop()) {
          result.errors.push(createError('semantic', `continue can only be used inside a loop`, stmt.location));
        }
        terminalKeyword = 'continue';
        break;
      case 'IndexAssignment': {
        const objectType = inferExprType(fn, stmt.object, scope, result, userFunctions, true);
        const indexType = inferExprType(fn, stmt.index, scope, result, userFunctions, true);
        const valueType = inferExprType(fn, stmt.value, scope, result, userFunctions, true);
        if (objectType.kind === 'map') {
          if (!isUnknown(objectType.keyType) && !isUnknown(indexType) &&
              !typesEqual(indexType, objectType.keyType)) {
            result.errors.push(createError('semantic',
              `Map key must be '${typeToString(objectType.keyType)}', got '${typeToString(indexType)}'`,
              stmt.location));
          }
          if (!isUnknown(objectType.valueType) && !isUnknown(valueType) &&
              !typesEqual(valueType, objectType.valueType)) {
            result.errors.push(createError('semantic',
              `Cannot assign '${typeToString(valueType)}' to map value of type '${typeToString(objectType.valueType)}'`,
              stmt.location));
          }
        } else if (objectType.kind === 'array') {
          if (!isUnknown(valueType) && !typesEqual(valueType, objectType.elementType)) {
            result.errors.push(createError('semantic',
              `Cannot assign '${typeToString(valueType)}' to array element of type '${typeToString(objectType.elementType)}'`,
              stmt.location));
          }
          if (!isPrimitive(indexType, 'int') && !isUnknown(indexType)) {
            result.errors.push(createError('semantic',
              `Array index must be int, got '${typeToString(indexType)}'`,
              stmt.location));
          }
        } else if (!isUnknown(objectType)) {
          result.errors.push(createError('semantic',
            `Cannot index-assign to non-array/map type '${typeToString(objectType)}'`,
            stmt.location));
        }
        markRootAsMutable(fn, stmt.object, result);
        break;
      }
      case 'FieldAssignment': {
        result.mutableVariables.add(`${fn.name}:${stmt.object}`);
        const varType = scope.lookup(stmt.object);
        if (varType !== undefined && varType.kind === 'struct') {
          const fieldType = varType.fields.get(stmt.field);
          if (fieldType === undefined) {
            result.errors.push(createError('semantic',
              `Struct '${varType.name}' has no field '${stmt.field}'`,
              stmt.location));
          } else {
            const valueType = inferExprType(fn, stmt.value, scope, result, userFunctions, true);
            if (!isUnknown(valueType) && !typesEqual(valueType, fieldType)) {
              result.errors.push(createError('semantic',
                `Cannot assign '${typeToString(valueType)}' to field '${stmt.field}' of type '${typeToString(fieldType)}'`,
                stmt.location));
            }
          }
        } else {
          inferExprType(fn, stmt.value, scope, result, userFunctions, true);
        }
        break;
      }
    }
  }
}

// --- Expression type inference ---

/**
 * Thin wrapper: infers the type of `expr` and stores it as `(expr as any).resolvedType`
 * so the code generator can read types directly from AST nodes (no re-inference needed).
 */
function inferExprType(
  fn: FunctionDeclaration, expr: Expression, scope: Scope,
  result: AnalysisResult, userFunctions: Map<string, FunctionDeclaration>,
  reportErrors: boolean,
): YlType {
  const t = inferExprTypeCore(fn, expr, scope, result, userFunctions, reportErrors);
  (expr as any).resolvedType = t;
  return t;
}

function inferExprTypeCore(
  fn: FunctionDeclaration, expr: Expression, scope: Scope,
  result: AnalysisResult, userFunctions: Map<string, FunctionDeclaration>,
  reportErrors: boolean,
): YlType {
  switch (expr.kind) {
    case 'Literal': {
      const litMap: Record<string, YlType> = { int: INT, float: FLOAT, string: STRING, bool: BOOL };
      return litMap[expr.literalType] ?? UNKNOWN;
    }
    case 'Identifier': {
      if (!scope.isDefined(expr.name)) {
        if (reportErrors) {
          const candidates = [...scope.getAllNames(), ...result.globalConstants.keys()];
          const match = findClosest(expr.name, candidates);
          const suggestion = match !== null ? ` — did you mean '${match}'?` : '';
          result.errors.push(createError('semantic', `Undefined variable '${expr.name}'${suggestion}`, expr.location));
        }
        return UNKNOWN;
      }
      // Track that this variable has been read
      result.usedVariables.add(`${fn.name}:${expr.name}`);
      return scope.lookup(expr.name) ?? UNKNOWN;
    }
    case 'GroupedExpression':
      return inferExprType(fn, expr.expression, scope, result, userFunctions, reportErrors);
    case 'UnaryExpression': {
      const operandType = inferExprType(fn, expr.operand, scope, result, userFunctions, reportErrors);
      if (expr.operator === 'not') {
        if (!isPrimitive(operandType, 'bool') && !isUnknown(operandType) && reportErrors) {
          result.errors.push(createError('semantic', `'not' requires bool operand, got '${typeToString(operandType)}'`, expr.location));
        }
        return BOOL;
      }
      // unary minus
      if (!isNumeric(operandType) && !isUnknown(operandType) && reportErrors) {
        result.errors.push(createError('semantic', `Unary '-' requires numeric operand, got '${typeToString(operandType)}'`, expr.location));
      }
      return isUnknown(operandType) ? INT : operandType;
    }
    case 'BinaryExpression':
      return inferBinaryType(fn, expr.left, expr.operator, expr.right, expr.location, scope, result, userFunctions, reportErrors);
    case 'FunctionCall':
      return inferCallType(fn, expr, scope, result, userFunctions, reportErrors);
    case 'EnumVariantAccess': {
      const enumType = result.enumTypes.get(expr.enumName);
      if (!enumType) {
        if (reportErrors) {
          result.errors.push(createError('semantic', `Undefined enum '${expr.enumName}'`, expr.location));
        }
        return UNKNOWN;
      }
      if (enumType.kind === 'enum') {
        const variantDef = enumType.variants.find(v => v.name === expr.variant);
        if (!variantDef && reportErrors) {
          result.errors.push(createError('semantic', `Undefined variant '${expr.variant}' on enum '${expr.enumName}'`, expr.location));
        }
        // Validate data-carrying constructor arguments
        if (variantDef && expr.arguments && expr.arguments.length > 0) {
          const expectedData = variantDef.data ?? [];
          if (reportErrors && expr.arguments.length !== expectedData.length) {
            result.errors.push(createError('semantic',
              `Variant '${expr.variant}' expects ${expectedData.length} argument(s), got ${expr.arguments.length}`,
              expr.location));
          }
          for (let i = 0; i < expr.arguments.length; i++) {
            const argType = inferExprType(fn, expr.arguments[i]!, scope, result, userFunctions, reportErrors);
            const expectedType = expectedData[i];
            if (reportErrors && expectedType && !isUnknown(argType) && !typesEqual(argType, expectedType)) {
              result.errors.push(createError('semantic',
                `Argument ${i + 1} of '${expr.variant}' expects '${typeToString(expectedType)}', got '${typeToString(argType)}'`,
                expr.arguments[i]!.location));
            }
          }
        } else if (variantDef && (!expr.arguments || expr.arguments.length === 0)) {
          // No args provided — validate that this variant doesn't require data
          const expectedData = variantDef.data ?? [];
          if (reportErrors && expectedData.length > 0) {
            result.errors.push(createError('semantic',
              `Variant '${expr.variant}' expects ${expectedData.length} argument(s), got 0`,
              expr.location));
          }
        }
      }
      return enumType;
    }
    case 'ArrayLiteral': {
      if (expr.elements.length === 0) {
        return { kind: 'array', elementType: UNKNOWN };
      }
      const firstType = inferExprType(fn, expr.elements[0], scope, result, userFunctions, reportErrors);
      if (reportErrors) {
        for (let i = 1; i < expr.elements.length; i++) {
          const elemType = inferExprType(fn, expr.elements[i], scope, result, userFunctions, reportErrors);
          if (!typesEqual(firstType, elemType) && !isUnknown(firstType) && !isUnknown(elemType)) {
            result.errors.push(createError('semantic',
              `Array elements must have the same type: expected '${typeToString(firstType)}' but got '${typeToString(elemType)}'`,
              expr.elements[i].location));
          }
        }
      }
      return { kind: 'array', elementType: firstType };
    }
    case 'MapLiteral': {
      if (expr.entries.length === 0) {
        return { kind: 'map', keyType: UNKNOWN, valueType: UNKNOWN };
      }
      const firstKeyType = inferExprType(fn, expr.entries[0].key, scope, result, userFunctions, reportErrors);
      const firstValType = inferExprType(fn, expr.entries[0].value, scope, result, userFunctions, reportErrors);
      if (reportErrors) {
        for (let i = 1; i < expr.entries.length; i++) {
          const kt = inferExprType(fn, expr.entries[i].key, scope, result, userFunctions, reportErrors);
          const vt = inferExprType(fn, expr.entries[i].value, scope, result, userFunctions, reportErrors);
          if (!isUnknown(firstKeyType) && !isUnknown(kt) && !typesEqual(firstKeyType, kt)) {
            result.errors.push(createError('semantic',
              `Map keys must have the same type: expected '${typeToString(firstKeyType)}' but got '${typeToString(kt)}'`,
              expr.entries[i].key.location));
          }
          if (!isUnknown(firstValType) && !isUnknown(vt) && !typesEqual(firstValType, vt)) {
            result.errors.push(createError('semantic',
              `Map values must have the same type: expected '${typeToString(firstValType)}' but got '${typeToString(vt)}'`,
              expr.entries[i].value.location));
          }
        }
      }
      return { kind: 'map', keyType: firstKeyType, valueType: firstValType };
    }
    case 'IndexExpression': {
      const objectType = inferExprType(fn, expr.object, scope, result, userFunctions, reportErrors);
      // Handle range-based slicing: arr[1..3] or arr[1..=3]
      if (expr.index.kind === 'RangeExpression') {
        const startType = inferExprType(fn, expr.index.start, scope, result, userFunctions, reportErrors);
        const endType = inferExprType(fn, expr.index.end, scope, result, userFunctions, reportErrors);
        if (objectType.kind === 'array') {
          if (reportErrors) {
            if (!isPrimitive(startType, 'int') && !isUnknown(startType)) {
              result.errors.push(createError('semantic',
                `Range start must be int, got '${typeToString(startType)}'`,
                expr.index.location));
            }
            if (!isPrimitive(endType, 'int') && !isUnknown(endType)) {
              result.errors.push(createError('semantic',
                `Range end must be int, got '${typeToString(endType)}'`,
                expr.index.location));
            }
          }
          return objectType; // slice returns same array type
        }
        return UNKNOWN;
      }
      const indexType = inferExprType(fn, expr.index, scope, result, userFunctions, reportErrors);
      if (objectType.kind === 'map') {
        if (reportErrors && !isUnknown(objectType.keyType) && !isUnknown(indexType) &&
            !typesEqual(indexType, objectType.keyType)) {
          result.errors.push(createError('semantic',
            `Map key must be '${typeToString(objectType.keyType)}', got '${typeToString(indexType)}'`,
            expr.location));
        }
        return objectType.valueType;
      }
      if (reportErrors) {
        if (!isUnknown(objectType) && objectType.kind !== 'array') {
          result.errors.push(createError('semantic',
            `Cannot index into non-array/map type '${typeToString(objectType)}'`,
            expr.location));
        }
        if (objectType.kind === 'array') {
          if (!isPrimitive(indexType, 'int') && !isUnknown(indexType)) {
            result.errors.push(createError('semantic',
              `Array index must be int, got '${typeToString(indexType)}'`,
              expr.location));
          }
        }
      }
      if (objectType.kind === 'array') {
        return objectType.elementType;
      }
      return UNKNOWN;
    }
    case 'MethodCall': {
      const objectType = inferExprType(fn, expr.object, scope, result, userFunctions, reportErrors);
      // Pre-compute argument types (also triggers error reporting for each arg)
      const argTypes = expr.arguments.map(arg => inferExprType(fn, arg, scope, result, userFunctions, reportErrors));
      // Look up struct methods if applicable
      const structMethods = objectType.kind === 'struct'
        ? result.implMethods.get(objectType.name)
        : undefined;
      const { returnType, markMutable } = resolveMethodCall(
        objectType,
        expr.method,
        expr.arguments.length,
        argTypes,
        expr.location,
        result.errors,
        reportErrors,
        structMethods,
      );
      if (markMutable) {
        markRootAsMutable(fn, expr.object, result);
      }
      return returnType;
    }
    case 'SelfExpression':
      return scope.lookup('self') ?? UNKNOWN;
    case 'StructLiteral': {
      const structDef = result.structDeclarations.get(expr.name);
      if (!structDef) {
        if (reportErrors) {
          result.errors.push(createError('semantic', `Unknown struct '${expr.name}'`, expr.location));
        }
        return UNKNOWN;
      }
      if (reportErrors) {
        // Check all required fields are present
        for (const [fieldName] of structDef) {
          if (!expr.fields.some(f => f.name === fieldName)) {
            result.errors.push(createError('semantic',
              `Missing field '${fieldName}' in struct literal '${expr.name}'`, expr.location));
          }
        }
        // Check no unknown fields
        for (const field of expr.fields) {
          if (!structDef.has(field.name)) {
            result.errors.push(createError('semantic',
              `Unknown field '${field.name}' in struct '${expr.name}'`, expr.location));
          }
        }
      }
      for (const field of expr.fields) {
        const actualType = inferExprType(fn, field.value, scope, result, userFunctions, reportErrors);
        if (reportErrors) {
          const expectedType = structDef.get(field.name);
          if (expectedType !== undefined && !isUnknown(actualType) && !typesEqual(actualType, expectedType)) {
            result.errors.push(createError('semantic',
              `Field '${field.name}' expects '${typeToString(expectedType)}', got '${typeToString(actualType)}'`,
              field.value.location));
          }
        }
      }
      return { kind: 'struct', name: expr.name, fields: structDef };
    }
    case 'TupleLiteral': {
      const elementTypes = expr.elements.map(e =>
        inferExprType(fn, e, scope, result, userFunctions, reportErrors)
      );
      return { kind: 'tuple', elements: elementTypes };
    }
    case 'FieldAccess': {
      const objectType = inferExprType(fn, expr.object, scope, result, userFunctions, reportErrors);
      if (objectType.kind === 'tuple') {
        const idx = parseInt(expr.field, 10);
        if (!isNaN(idx) && idx >= 0 && idx < objectType.elements.length) {
          return objectType.elements[idx]!;
        }
        if (reportErrors) {
          result.errors.push(createError('semantic',
            `Tuple index '${expr.field}' is out of range (length ${objectType.elements.length})`, expr.location));
        }
        return UNKNOWN;
      }
      if (objectType.kind === 'struct') {
        const fieldType = objectType.fields.get(expr.field);
        if (fieldType !== undefined) return fieldType;
        if (reportErrors) {
          result.errors.push(createError('semantic',
            `Struct '${objectType.name}' has no field '${expr.field}'`, expr.location));
        }
        return UNKNOWN;
      }
      return UNKNOWN;
    }
    case 'RangeExpression': {
      // Validate that start and end are int types; the range itself has no simple primitive type
      const startType = inferExprType(fn, expr.start, scope, result, userFunctions, reportErrors);
      const endType = inferExprType(fn, expr.end, scope, result, userFunctions, reportErrors);
      if (reportErrors) {
        if (!isPrimitive(startType, 'int') && !isUnknown(startType)) {
          result.errors.push(createError('semantic', `Range start must be int, got '${typeToString(startType)}'`, expr.location));
        }
        if (!isPrimitive(endType, 'int') && !isUnknown(endType)) {
          result.errors.push(createError('semantic', `Range end must be int, got '${typeToString(endType)}'`, expr.location));
        }
      }
      return UNKNOWN;
    }
    case 'ClosureExpression': {
      // Create a child scope for closure parameters
      const closureScope = scope.createBlockScope();
      for (const param of expr.parameters) {
        closureScope.define(param.name, UNKNOWN);
      }
      // Infer return type from body expression (reportErrors:false — body type errors let Rust catch)
      let returnType: YlType = UNKNOWN;
      if (!Array.isArray(expr.body)) {
        returnType = inferExprType(fn, expr.body, closureScope, result, userFunctions, false);
      }
      return { kind: 'function', params: expr.parameters.map(() => UNKNOWN), returnType };
    }
    case 'NoneLiteral':
      return { kind: 'option', innerType: UNKNOWN };
    case 'IfExpression': {
      const condType = inferExprType(fn, expr.condition, scope, result, userFunctions, reportErrors);
      if (reportErrors && !isPrimitive(condType, 'bool') && !isUnknown(condType)) {
        result.errors.push(createError('semantic', `Condition must be bool, got '${typeToString(condType)}'`, expr.location));
      }
      const thenType = inferExprType(fn, expr.thenBranch, scope, result, userFunctions, reportErrors);
      const elseType = inferExprType(fn, expr.elseBranch, scope, result, userFunctions, reportErrors);
      if (reportErrors && !isUnknown(thenType) && !isUnknown(elseType) && !typesEqual(thenType, elseType)) {
        result.errors.push(createError('semantic',
          `Conditional expression branches have different types: '${typeToString(thenType)}' and '${typeToString(elseType)}'`,
          expr.location));
      }
      return isUnknown(thenType) ? elseType : thenType;
    }
    default:
      return UNKNOWN;
  }
}


// --- Binary expression type inference ---
function inferBinaryType(
  fn: FunctionDeclaration, left: Expression, op: BinaryOperator, right: Expression,
  location: SourceLocation, scope: Scope, result: AnalysisResult,
  userFunctions: Map<string, FunctionDeclaration>, reportErrors: boolean,
): YlType {
  const leftType = inferExprType(fn, left, scope, result, userFunctions, reportErrors);
  const rightType = inferExprType(fn, right, scope, result, userFunctions, reportErrors);

  // Check division by literal zero
  if (op === '/' && right.kind === 'Literal' && (right.value === 0 || right.value === '0')) {
    result.warnings.push(createError('semantic', 'Division by literal zero', location));
  }

  // Logical operators
  if (op === 'and' || op === 'or') {
    if (reportErrors) {
      if (!isPrimitive(leftType, 'bool') && !isUnknown(leftType)) {
        result.errors.push(createError('semantic', `'${op}' requires bool operands, got '${typeToString(leftType)}'`, location));
      }
      if (!isPrimitive(rightType, 'bool') && !isUnknown(rightType)) {
        result.errors.push(createError('semantic', `'${op}' requires bool operands, got '${typeToString(rightType)}'`, location));
      }
    }
    return BOOL;
  }

  // Comparison operators
  if (['==', '!=', '>', '<', '>=', '<='].includes(op)) {
    if (reportErrors && !isUnknown(leftType) && !isUnknown(rightType) && !typesEqual(leftType, rightType)) {
      result.errors.push(createError('semantic', `Cannot compare '${typeToString(leftType)}' with '${typeToString(rightType)}'`, location));
    }
    return BOOL;
  }

  // Arithmetic operators
  if (reportErrors && !isUnknown(leftType) && !isUnknown(rightType) && !typesEqual(leftType, rightType)) {
    result.errors.push(createError('semantic', `Type mismatch: cannot apply '${op}' to '${typeToString(leftType)}' and '${typeToString(rightType)}'`, location));
  }

  // Numeric-only operators: %, *, /, - do not accept strings or bools
  if (['-', '*', '/', '%'].includes(op) && reportErrors) {
    if (!isNumeric(leftType) && !isUnknown(leftType)) {
      result.errors.push(createError('semantic', `'${op}' requires numeric operands, got '${typeToString(leftType)}'`, location));
    }
    if (!isNumeric(rightType) && !isUnknown(rightType)) {
      result.errors.push(createError('semantic', `'${op}' requires numeric operands, got '${typeToString(rightType)}'`, location));
    }
  }

  // String concatenation with +
  if (op === '+' && (isPrimitive(leftType, 'string') || isPrimitive(rightType, 'string'))) {
    return STRING;
  }

  if (!isUnknown(leftType)) return leftType;
  if (!isUnknown(rightType)) return rightType;
  return INT;
}

// --- Function call type inference ---
function inferCallType(
  fn: FunctionDeclaration, call: { name: string; arguments: Expression[]; location: SourceLocation },
  scope: Scope, result: AnalysisResult,
  userFunctions: Map<string, FunctionDeclaration>, reportErrors: boolean,
): YlType {
  // Built-in functions — delegate to the registry
  const builtin = builtinRegistry.get(call.name);
  if (builtin) {
    const argTypes = call.arguments.map(a => inferExprType(fn, a, scope, result, userFunctions, reportErrors));
    return builtin.validate(argTypes, call.location, result.errors, reportErrors);
  }

  // Check if call.name refers to a closure variable in scope
  const closureType = scope.lookup(call.name);
  if (closureType && closureType.kind === 'function') {
    for (const arg of call.arguments) {
      inferExprType(fn, arg, scope, result, userFunctions, reportErrors);
    }
    return closureType.returnType;
  }

  // User-defined functions
  const fnInfo = result.functionTypes.get(call.name);
  if (!fnInfo && reportErrors) {
    const fnCandidates = [...userFunctions.keys(), ...builtinRegistry.keys()];
    const match = findClosest(call.name, fnCandidates);
    const suggestion = match !== null ? ` — did you mean '${match}'?` : '';
    result.errors.push(createError('semantic', `Undefined function '${call.name}'${suggestion}`, call.location));
    return UNKNOWN;
  }
  // Validate argument count considering default parameters
  if (reportErrors && fnInfo) {
    const totalParams = fnInfo.parameterTypes.length;
    const requiredCount = fnInfo.paramDefaults
      ? fnInfo.paramDefaults.filter(d => d === undefined).length
      : totalParams;
    if (call.arguments.length < requiredCount) {
      result.errors.push(createError('semantic',
        `Function '${call.name}' requires at least ${requiredCount} argument(s), got ${call.arguments.length}`,
        call.location));
    } else if (call.arguments.length > totalParams) {
      result.errors.push(createError('semantic',
        `Function '${call.name}' takes at most ${totalParams} argument(s), got ${call.arguments.length}`,
        call.location));
    }
  }
  // Validate argument types
  for (const arg of call.arguments) {
    inferExprType(fn, arg, scope, result, userFunctions, reportErrors);
  }
  return fnInfo?.returnType ?? UNKNOWN;
}

// --- Return type inference ---
function inferReturnType(
  fn: FunctionDeclaration, stmts: Statement[], scope: Scope,
  result: AnalysisResult, userFunctions: Map<string, FunctionDeclaration>,
): YlType {
  // Check for explicit return statements
  for (const stmt of stmts) {
    if (stmt.kind === 'ReturnStatement') {
      if (stmt.expression === null) return VOID;
      return inferExprType(fn, stmt.expression, scope, result, userFunctions, false);
    }
    if (stmt.kind === 'IfStatement') {
      const thenRet = inferReturnType(fn, stmt.thenBranch, scope, result, userFunctions);
      if (!isPrimitive(thenRet, 'void')) return thenRet;
      for (const branch of stmt.elseIfBranches) {
        const branchRet = inferReturnType(fn, branch.body, scope, result, userFunctions);
        if (!isPrimitive(branchRet, 'void')) return branchRet;
      }
      if (stmt.elseBranch) {
        const elseRet = inferReturnType(fn, stmt.elseBranch, scope, result, userFunctions);
        if (!isPrimitive(elseRet, 'void')) return elseRet;
      }
    }
    if (stmt.kind === 'WhileStatement') {
      const bodyRet = inferReturnType(fn, stmt.body, scope, result, userFunctions);
      if (!isPrimitive(bodyRet, 'void')) return bodyRet;
    }
    if (stmt.kind === 'ForStatement') {
      const bodyRet = inferReturnType(fn, stmt.body, scope, result, userFunctions);
      if (!isPrimitive(bodyRet, 'void')) return bodyRet;
    }
    if (stmt.kind === 'MatchStatement') {
      for (const arm of stmt.arms) {
        const t = inferReturnType(fn, arm.body, scope, result, userFunctions);
        if (!isPrimitive(t, 'void')) return t;
      }
    }
  }
  // Check last expression (implicit return)
  if (stmts.length > 0) {
    const last = stmts[stmts.length - 1];
    if (last.kind === 'ExpressionStatement') {
      return inferExprType(fn, last.expression, scope, result, userFunctions, false);
    }
  }
  return VOID;
}
