import type {
  Program, FunctionDeclaration, Statement, Expression,
  BinaryOperator, ConstDeclaration, EnumDeclaration, StructDeclaration,
  MatchPattern, ImplDeclaration,
} from '../ast/nodes.js';
import { getFunctions } from '../ast/nodes.js';
import type { YlType, AnalysisResult } from '../semantic/types.js';
import { INT, FLOAT, STRING, BOOL, VOID, UNKNOWN, isPrimitive, isUnknown, toRustType } from '../semantic/types.js';
import { RustEmitter } from './rust-emitter.js';

const INTERP_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Returns true if the type contains UNKNOWN at any level — used to skip Rust type annotations. */
function typeNeedsInference(type: YlType): boolean {
  if (isUnknown(type)) return true;
  if (typeof type === 'string') return false;
  if (type.kind === 'option') return typeNeedsInference(type.innerType);
  if (type.kind === 'result') return typeNeedsInference(type.okType) || typeNeedsInference(type.errType);
  if (type.kind === 'array') return typeNeedsInference(type.elementType);
  if (type.kind === 'map') return typeNeedsInference(type.keyType) || typeNeedsInference(type.valueType);
  return false;
}

// Lightweight expression type resolver for codegen decisions (e.g. string concatenation)
function getExprType(expr: Expression, analysis: AnalysisResult, fnName: string): YlType {
  switch (expr.kind) {
    case 'Literal': {
      const litMap: Record<string, YlType> = { int: INT, float: FLOAT, string: STRING, bool: BOOL };
      return litMap[expr.literalType] ?? UNKNOWN;
    }
    case 'Identifier':
      return analysis.variableTypes.get(`${fnName}:${expr.name}`) ?? UNKNOWN;
    case 'GroupedExpression':
      return getExprType(expr.expression, analysis, fnName);
    case 'UnaryExpression':
      return expr.operator === 'not' ? BOOL : getExprType(expr.operand, analysis, fnName);
    case 'BinaryExpression': {
      if (['==', '!=', '>', '<', '>=', '<=', 'and', 'or'].includes(expr.operator)) return BOOL;
      const lt = getExprType(expr.left, analysis, fnName);
      const rt = getExprType(expr.right, analysis, fnName);
      if (expr.operator === '+' && (isPrimitive(lt, 'string') || isPrimitive(rt, 'string'))) return STRING;
      return !isUnknown(lt) ? lt : rt;
    }
    case 'FunctionCall': {
      if (expr.name === 'to_string' || expr.name === 'string') return STRING;
      if (expr.name === 'length') return INT;
      if (expr.name === 'int') return INT;
      if (expr.name === 'float') return FLOAT;
      if (expr.name === 'env' || expr.name === 'env_or') return STRING;
      if (expr.name === 'read_line' || expr.name === 'prompt') return STRING;
      if (expr.name === 'args') return { kind: 'array', elementType: STRING };
      if (expr.name === 'args_count') return INT;
      if (expr.name === 'read_file') return STRING;
      if (expr.name === 'file_exists') return BOOL;
      if (expr.name === 'some') {
        const innerType = expr.arguments.length >= 1 ? getExprType(expr.arguments[0], analysis, fnName) : UNKNOWN;
        return { kind: 'option', innerType };
      }
      if (expr.name === 'ok') {
        const okType = expr.arguments.length >= 1 ? getExprType(expr.arguments[0], analysis, fnName) : UNKNOWN;
        return { kind: 'result', okType, errType: STRING };
      }
      if (expr.name === 'err') return { kind: 'result', okType: UNKNOWN, errType: STRING };
      // Check if calling a closure variable
      const closureVarType = analysis.variableTypes.get(`${fnName}:${expr.name}`);
      if (closureVarType && typeof closureVarType !== 'string' && closureVarType.kind === 'function') {
        return closureVarType.returnType;
      }
      return analysis.functionTypes.get(expr.name)?.returnType ?? UNKNOWN;
    }
    case 'EnumVariantAccess':
      return analysis.enumTypes.get(expr.enumName) ?? UNKNOWN;
    case 'ArrayLiteral': {
      if (expr.elements.length === 0) return { kind: 'array', elementType: UNKNOWN };
      return { kind: 'array', elementType: getExprType(expr.elements[0], analysis, fnName) };
    }
    case 'MapLiteral': {
      if (expr.entries.length === 0) return { kind: 'map', keyType: UNKNOWN, valueType: UNKNOWN };
      return {
        kind: 'map',
        keyType: getExprType(expr.entries[0].key, analysis, fnName),
        valueType: getExprType(expr.entries[0].value, analysis, fnName),
      };
    }
    case 'IndexExpression': {
      const objType = getExprType(expr.object, analysis, fnName);
      if (typeof objType !== 'string' && objType.kind === 'array') return objType.elementType;
      if (typeof objType !== 'string' && objType.kind === 'map') return objType.valueType;
      return UNKNOWN;
    }
    case 'MethodCall': {
      if (expr.method === 'length') return INT;
      if (expr.method === 'contains') return BOOL;
      if (expr.method === 'pop') {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'array') return objType.elementType;
      }
      // Map method return types
      {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'map') {
          if (expr.method === 'keys') return { kind: 'array', elementType: objType.keyType };
          if (expr.method === 'values') return { kind: 'array', elementType: objType.valueType };
        }
      }
      if (expr.method === 'starts_with' || expr.method === 'ends_with') return BOOL;
      if (expr.method === 'to_upper' || expr.method === 'to_lower' || expr.method === 'trim' ||
          expr.method === 'replace' || expr.method === 'char_at') return STRING;
      if (expr.method === 'split') return { kind: 'array', elementType: STRING };
      if (expr.method === 'any' || expr.method === 'all') return BOOL;
      if (expr.method === 'filter') {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'array') return objType;
      }
      if (expr.method === 'map') {
        // Can't easily infer closure return type here; fall through to UNKNOWN
      }
      if (expr.method === 'reduce') {
        if (expr.arguments.length >= 1) return getExprType(expr.arguments[0], analysis, fnName);
      }
      if (expr.method === 'find') {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'array') {
          return { kind: 'option', innerType: objType.elementType };
        }
      }
      if (expr.method === 'is_some' || expr.method === 'is_none' ||
          expr.method === 'is_ok' || expr.method === 'is_err') return BOOL;
      if (expr.method === 'unwrap' || expr.method === 'unwrap_or') {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'option') return objType.innerType;
        if (typeof objType !== 'string' && objType.kind === 'result') return objType.okType;
      }
      // Struct method return type
      {
        const objType = getExprType(expr.object, analysis, fnName);
        if (typeof objType !== 'string' && objType.kind === 'struct') {
          const methodInfo = analysis.implMethods.get(objType.name)?.get(expr.method);
          if (methodInfo) return methodInfo.returnType;
        }
      }
      return UNKNOWN;
    }
    case 'SelfExpression':
      return UNKNOWN;
    case 'NoneLiteral':
      return { kind: 'option', innerType: UNKNOWN };
    default:
      return UNKNOWN;
  }
}

function parseInterpolation(str: string): { format: string; vars: string[] } | null {
  const vars: string[] = [];
  let match: RegExpExecArray | null;
  INTERP_REGEX.lastIndex = 0;
  const format = str.replace(INTERP_REGEX, (_m, name: string) => {
    vars.push(name);
    return '{}';
  });
  if (vars.length === 0) return null;
  return { format, vars };
}

function generateMatchPattern(pattern: MatchPattern, isStringMatch: boolean): string {
  switch (pattern.kind) {
    case 'WildcardPattern':
      return '_';
    case 'IdentifierPattern':
      return pattern.name;
    case 'LiteralPattern': {
      const expr = pattern.value;
      if (expr.kind === 'Literal') {
        if (expr.literalType === 'string') {
          // For string matches we use .as_str(), so patterns are &str literals
          return `"${expr.value as string}"`;
        }
        if (expr.literalType === 'bool') {
          return String(expr.value);
        }
        return String(expr.value);
      }
      return '_';
    }
    case 'EnumPattern':
      return `${pattern.enumName}::${pattern.variant}`;
  }
}

export function generate(program: Program, analysis: AnalysisResult): string {
  const emitter = new RustEmitter();

  // Collect required use statements by walking the AST
  collectUseStatements(program, emitter);

  // Emit top-level const declarations before functions
  const consts = program.declarations.filter((d): d is ConstDeclaration => d.kind === 'ConstDeclaration');
  for (const c of consts) {
    generateConstDeclaration(c, emitter);
  }
  if (consts.length > 0) emitter.emitRaw('');

  // Emit struct declarations before enums and functions
  const structs = program.declarations.filter((d): d is StructDeclaration => d.kind === 'StructDeclaration');
  for (const s of structs) {
    generateStructDeclaration(s, emitter);
    emitter.emitRaw('');
  }

  // Emit enum declarations before functions
  const enums = program.declarations.filter((d): d is EnumDeclaration => d.kind === 'EnumDeclaration');
  for (const e of enums) {
    generateEnumDeclaration(e, emitter);
    emitter.emitRaw('');
  }

  // Emit impl blocks after structs/enums and before functions
  const impls = program.declarations.filter((d): d is ImplDeclaration => d.kind === 'ImplDeclaration');
  for (const impl of impls) {
    generateImplDeclaration(impl, analysis, emitter);
    emitter.emitRaw('');
  }

  const fns = getFunctions(program);
  for (let i = 0; i < fns.length; i++) {
    generateFunction(fns[i], analysis, emitter);
    if (i < fns.length - 1) emitter.emitRaw('');
  }

  // Prepend use statements at the very top of the generated file
  const useStmts = emitter.getUseStatements();
  if (useStmts.length > 0) {
    const useBlock = useStmts.map(s => `use ${s};`).join('\n');
    return useBlock + '\n\n' + emitter.toString();
  }
  return emitter.toString();
}

// ─── Use statement collection (pre-pass) ──────────────────────────────────────

function collectUseStatements(program: Program, emitter: RustEmitter): void {
  for (const fn of getFunctions(program)) {
    collectUseStmtsFromBody(fn.body, emitter);
  }
}

function collectUseStmtsFromBody(stmts: Statement[], emitter: RustEmitter): void {
  for (const stmt of stmts) {
    collectUseStmtsFromStmt(stmt, emitter);
  }
}

function collectUseStmtsFromStmt(stmt: Statement, emitter: RustEmitter): void {
  switch (stmt.kind) {
    case 'VariableAssignment':
      collectUseStmtsFromExpr(stmt.expression, emitter);
      break;
    case 'ReturnStatement':
      if (stmt.expression !== null) {
        collectUseStmtsFromExpr(stmt.expression, emitter);
      }
      break;
    case 'ExpressionStatement':
      collectUseStmtsFromExpr(stmt.expression, emitter);
      break;
    case 'IfStatement':
      collectUseStmtsFromExpr(stmt.condition, emitter);
      collectUseStmtsFromBody(stmt.thenBranch, emitter);
      for (const branch of stmt.elseIfBranches) {
        collectUseStmtsFromExpr(branch.condition, emitter);
        collectUseStmtsFromBody(branch.body, emitter);
      }
      if (stmt.elseBranch) collectUseStmtsFromBody(stmt.elseBranch, emitter);
      break;
    case 'WhileStatement':
      collectUseStmtsFromExpr(stmt.condition, emitter);
      collectUseStmtsFromBody(stmt.body, emitter);
      break;
    case 'ForStatement':
      collectUseStmtsFromExpr(stmt.iterable, emitter);
      collectUseStmtsFromBody(stmt.body, emitter);
      break;
    case 'MatchStatement':
      collectUseStmtsFromExpr(stmt.expression, emitter);
      for (const arm of stmt.arms) {
        collectUseStmtsFromBody(arm.body, emitter);
      }
      break;
    case 'IndexAssignment':
      collectUseStmtsFromExpr(stmt.object, emitter);
      collectUseStmtsFromExpr(stmt.index, emitter);
      collectUseStmtsFromExpr(stmt.value, emitter);
      break;
    case 'FieldAssignment':
      collectUseStmtsFromExpr(stmt.value, emitter);
      break;
  }
}

function collectUseStmtsFromExpr(expr: Expression, emitter: RustEmitter): void {
  switch (expr.kind) {
    case 'FunctionCall': {
      const name = expr.name;
      if (name === 'env' || name === 'env_or') {
        emitter.addUseStatement('std::env');
      }
      if (name === 'read_line' || name === 'prompt') {
        emitter.addUseStatement('std::io');
        emitter.addUseStatement('std::io::Write');
      }
      for (const arg of expr.arguments) collectUseStmtsFromExpr(arg, emitter);
      break;
    }
    case 'BinaryExpression':
      collectUseStmtsFromExpr(expr.left, emitter);
      collectUseStmtsFromExpr(expr.right, emitter);
      break;
    case 'UnaryExpression':
      collectUseStmtsFromExpr(expr.operand, emitter);
      break;
    case 'GroupedExpression':
      collectUseStmtsFromExpr(expr.expression, emitter);
      break;
    case 'MethodCall':
      collectUseStmtsFromExpr(expr.object, emitter);
      for (const arg of expr.arguments) collectUseStmtsFromExpr(arg, emitter);
      break;
    case 'IndexExpression':
      collectUseStmtsFromExpr(expr.object, emitter);
      collectUseStmtsFromExpr(expr.index, emitter);
      break;
    case 'ArrayLiteral':
      for (const elem of expr.elements) collectUseStmtsFromExpr(elem, emitter);
      break;
    case 'MapLiteral':
      emitter.addUseStatement('std::collections::HashMap');
      for (const entry of expr.entries) {
        collectUseStmtsFromExpr(entry.key, emitter);
        collectUseStmtsFromExpr(entry.value, emitter);
      }
      break;
    case 'StructLiteral':
      for (const f of expr.fields) collectUseStmtsFromExpr(f.value, emitter);
      break;
    case 'ClosureExpression':
      if (Array.isArray(expr.body)) {
        collectUseStmtsFromBody(expr.body as Statement[], emitter);
      } else {
        collectUseStmtsFromExpr(expr.body as Expression, emitter);
      }
      break;
    case 'RangeExpression':
      collectUseStmtsFromExpr(expr.start, emitter);
      collectUseStmtsFromExpr(expr.end, emitter);
      break;
    default:
      break;
  }
}

function generateStructDeclaration(s: StructDeclaration, emitter: RustEmitter): void {
  emitter.emit('#[derive(Debug, Clone)]');
  emitter.emit(`struct ${s.name} {`);
  emitter.indent();
  for (const field of s.fields) {
    const rustType = annotationToRustType(field.typeAnnotation);
    emitter.emit(`${field.name}: ${rustType},`);
  }
  emitter.dedent();
  emitter.emit('}');
}

function annotationToRustType(annotation: string): string {
  const map: Record<string, string> = { int: 'i32', float: 'f64', string: 'String', bool: 'bool' };
  return map[annotation] ?? annotation;
}

function generateImplDeclaration(impl: ImplDeclaration, analysis: AnalysisResult, emitter: RustEmitter): void {
  emitter.emit(`impl ${impl.structName} {`);
  emitter.indent();
  for (let i = 0; i < impl.methods.length; i++) {
    const method = impl.methods[i];
    const methodKey = `${impl.structName}.${method.name}`;
    const methodInfo = analysis.implMethods.get(impl.structName)?.get(method.name);
    const returnType = methodInfo?.returnType ?? VOID;
    const retAnnotation = !isPrimitive(returnType, 'void') ? ` -> ${toRustType(returnType)}` : '';
    const mutatesSelf = analysis.mutatingMethods.has(`${impl.structName}.${method.name}`);
    const selfParam = mutatesSelf ? '&mut self' : '&self';
    const extraParams = method.parameters.map((p, idx) => {
      const pType = methodInfo?.parameterTypes[idx] ?? UNKNOWN;
      return `${p.name}: ${toRustType(pType)}`;
    }).join(', ');
    const paramsStr = extraParams ? `${selfParam}, ${extraParams}` : selfParam;
    emitter.emit(`fn ${method.name}(${paramsStr})${retAnnotation} {`);
    emitter.indent();
    const declaredVars = new Set<string>();
    const implicitReturnIdx = !isPrimitive(returnType, 'void') ? method.body.length - 1 : -1;
    generateStatements(methodKey, method.body, analysis, emitter, declaredVars, implicitReturnIdx);
    emitter.dedent();
    emitter.emit('}');
    if (i < impl.methods.length - 1) emitter.emitRaw('');
  }
  emitter.dedent();
  emitter.emit('}');
}

function generateEnumDeclaration(e: EnumDeclaration, emitter: RustEmitter): void {
  emitter.emit('#[derive(Debug, Clone, PartialEq)]');
  emitter.emit(`enum ${e.name} {`);
  emitter.indent();
  for (const variant of e.variants) {
    emitter.emit(`${variant.name},`);
  }
  emitter.dedent();
  emitter.emit('}');
}

function generateConstDeclaration(c: ConstDeclaration, emitter: RustEmitter): void {
  const rustType = constRustType(c.value);
  const value = generateConstValue(c.value);
  emitter.emit(`const ${c.name}: ${rustType} = ${value};`);
}

/** Resolve the Rust type for a const declaration value — strings use &str, not String. */
function constRustType(expr: Expression): string {
  if (expr.kind === 'Literal') {
    if (expr.literalType === 'int') return 'i32';
    if (expr.literalType === 'float') return 'f64';
    if (expr.literalType === 'string') return '&str';
    if (expr.literalType === 'bool') return 'bool';
  }
  return '/* unknown */';
}

/** Generate the value expression for a const — strings use raw "..." not String::from. */
function generateConstValue(expr: Expression): string {
  if (expr.kind === 'Literal') {
    if (expr.literalType === 'string') return `"${expr.value as string}"`;
    return String(expr.value);
  }
  return '/* unsupported const value */';
}

function generateFunction(fn: FunctionDeclaration, analysis: AnalysisResult, emitter: RustEmitter): void {
  const fnInfo = analysis.functionTypes.get(fn.name);
  const params = fn.parameters.map((p, i) => {
    const pType = fnInfo?.parameterTypes[i] ?? UNKNOWN;
    return `${p.name}: ${toRustType(pType)}`;
  }).join(', ');

  const isMain = fn.name === 'main';
  const retType = fnInfo?.returnType ?? VOID;
  const retAnnotation = (!isMain && !isPrimitive(retType, 'void')) ? ` -> ${toRustType(retType)}` : '';

  emitter.emit(`fn ${fn.name}(${params})${retAnnotation} {`);
  emitter.indent();

  const declaredVars = new Set<string>();
  // Only non-void functions get implicit return (last expr emitted without semicolon)
  const implicitReturnIdx = (!isPrimitive(retType, 'void')) ? fn.body.length - 1 : -1;
  generateStatements(fn.name, fn.body, analysis, emitter, declaredVars, implicitReturnIdx);

  emitter.dedent();
  emitter.emit('}');
}

function generateStatements(
  fnName: string,
  stmts: Statement[],
  analysis: AnalysisResult,
  emitter: RustEmitter,
  declaredVars: Set<string>,
  implicitReturnIdx: number,
): void {
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const isImplicit = i === implicitReturnIdx && stmt.kind === 'ExpressionStatement';
    generateStatement(fnName, stmt, analysis, emitter, declaredVars, isImplicit);
  }
}

function generateStatement(
  fnName: string,
  stmt: Statement,
  analysis: AnalysisResult,
  emitter: RustEmitter,
  declaredVars: Set<string>,
  isImplicitReturn: boolean,
): void {
  switch (stmt.kind) {
    case 'VariableAssignment': {
      const key = `${fnName}:${stmt.identifier}`;
      const isFirst = !declaredVars.has(stmt.identifier);
      declaredVars.add(stmt.identifier);
      const isConst = analysis.constVariables.has(key);
      const isMut = !isConst && analysis.mutableVariables.has(key);
      const mutKw = isMut ? 'mut ' : '';

      // Special case: read_line() and prompt() emit multi-line block expressions
      if (stmt.expression.kind === 'FunctionCall' &&
          (stmt.expression.name === 'read_line' || stmt.expression.name === 'prompt')) {
        const prefix = isFirst ? `let ${mutKw}${stmt.identifier}: String` : stmt.identifier;
        emitter.emit(`${prefix} = {`);
        emitter.indent();
        if (stmt.expression.name === 'prompt') {
          const msgExpr = generateExpression(stmt.expression.arguments[0], analysis, fnName);
          emitter.emit(`print!("{}", ${msgExpr});`);
          emitter.emit('std::io::Write::flush(&mut std::io::stdout()).unwrap();');
        }
        emitter.emit('let mut input = String::new();');
        emitter.emit('std::io::stdin().read_line(&mut input).unwrap();');
        emitter.emit('input.trim().to_string()');
        emitter.dedent();
        emitter.emit('};');
        break;
      }

      const ylType = analysis.variableTypes.get(key);
      const expr = generateExpression(stmt.expression, analysis, fnName);
      if (isFirst) {
        // Omit type annotation for UNKNOWN types (e.g. range variables — let Rust infer)
        // Also omit for closure (function) types — let Rust infer the closure type
        // Also omit for option/result types that contain UNKNOWN (e.g. none, err(...))
        const isFunctionType = ylType && typeof ylType !== 'string' && ylType.kind === 'function';
        if (!ylType || typeNeedsInference(ylType) || isFunctionType) {
          emitter.emit(`let ${mutKw}${stmt.identifier} = ${expr};`);
        } else {
          const rustType = toRustType(ylType);
          emitter.emit(`let ${mutKw}${stmt.identifier}: ${rustType} = ${expr};`);
        }
      } else {
        emitter.emit(`${stmt.identifier} = ${expr};`);
      }
      break;
    }
    case 'ReturnStatement': {
      if (stmt.expression === null) {
        emitter.emit(`return;`);
      } else {
        const expr = generateExpression(stmt.expression, analysis, fnName);
        emitter.emit(`return ${expr};`);
      }
      break;
    }
    case 'IfStatement': {
      const cond = generateExpression(stmt.condition, analysis, fnName);
      emitter.emit(`if ${cond} {`);
      emitter.indent();
      generateStatements(fnName, stmt.thenBranch, analysis, emitter, declaredVars, -1);
      emitter.dedent();
      for (const branch of stmt.elseIfBranches) {
        const branchCond = generateExpression(branch.condition, analysis, fnName);
        emitter.emit(`} else if ${branchCond} {`);
        emitter.indent();
        generateStatements(fnName, branch.body, analysis, emitter, declaredVars, -1);
        emitter.dedent();
      }
      if (stmt.elseBranch) {
        emitter.emit('} else {');
        emitter.indent();
        generateStatements(fnName, stmt.elseBranch, analysis, emitter, declaredVars, -1);
        emitter.dedent();
      }
      emitter.emit('}');
      break;
    }
    case 'WhileStatement': {
      const cond = generateExpression(stmt.condition, analysis, fnName);
      emitter.emit(`while ${cond} {`);
      emitter.indent();
      generateStatements(fnName, stmt.body, analysis, emitter, declaredVars, -1);
      emitter.dedent();
      emitter.emit('}');
      break;
    }
    case 'BreakStatement': {
      emitter.emit('break;');
      break;
    }
    case 'ContinueStatement': {
      emitter.emit('continue;');
      break;
    }
    case 'ForStatement': {
      const iterableCode = generateForIterable(stmt.iterable, analysis, fnName);
      emitter.emit(`for ${stmt.variable} in ${iterableCode} {`);
      emitter.indent();
      // Pass a copy of declaredVars; loop variable is declared implicitly by the for loop
      const loopDeclaredVars = new Set<string>(declaredVars);
      loopDeclaredVars.add(stmt.variable);
      generateStatements(fnName, stmt.body, analysis, emitter, loopDeclaredVars, -1);
      emitter.dedent();
      emitter.emit('}');
      break;
    }
    case 'ExpressionStatement': {
      if (isImplicitReturn) {
        const expr = generateExpression(stmt.expression, analysis, fnName);
        emitter.emit(expr);
      } else if (
        !isImplicitReturn &&
        stmt.expression.kind === 'FunctionCall' &&
        stmt.expression.name === 'append_file'
      ) {
        generateAppendFileStatement(stmt.expression.arguments, analysis, fnName, emitter);
      } else {
        const expr = generateExprStatement(stmt.expression, analysis, fnName);
        emitter.emit(expr);
      }
      break;
    }
    case 'MatchStatement': {
      const exprType = getExprType(stmt.expression, analysis, fnName);
      const isStringMatch = isPrimitive(exprType, 'string');
      const exprCode = generateExpression(stmt.expression, analysis, fnName);
      const matchSubject = isStringMatch ? `${exprCode}.as_str()` : exprCode;
      emitter.emit(`match ${matchSubject} {`);
      emitter.indent();
      for (const arm of stmt.arms) {
        const pat = generateMatchPattern(arm.pattern, isStringMatch);
        emitter.emit(`${pat} => {`);
        emitter.indent();
        generateStatements(fnName, arm.body, analysis, emitter, declaredVars, -1);
        emitter.dedent();
        emitter.emit('}');
      }
      emitter.dedent();
      emitter.emit('}');
      break;
    }
    case 'IndexAssignment': {
      const obj = generateExpression(stmt.object, analysis, fnName);
      const idxRaw = generateExpression(stmt.index, analysis, fnName);
      const val = generateExpression(stmt.value, analysis, fnName);
      const objType = getExprType(stmt.object, analysis, fnName);
      if (typeof objType !== 'string' && objType.kind === 'map') {
        // For maps, use .insert(key, value)
        emitter.emit(`${obj}.insert(${idxRaw}, ${val});`);
      } else {
        emitter.emit(`${obj}[${idxRaw} as usize] = ${val};`);
      }
      break;
    }
    case 'FieldAssignment': {
      const val = generateExpression(stmt.value, analysis, fnName);
      emitter.emit(`${stmt.object}.${stmt.field} = ${val};`);
      break;
    }
  }
}

// Generates the iterable part of a for loop: range or &collection
function generateForIterable(expr: Expression, analysis: AnalysisResult, fnName: string): string {
  if (expr.kind === 'RangeExpression') {
    const start = generateExpression(expr.start, analysis, fnName);
    const end = generateExpression(expr.end, analysis, fnName);
    const op = expr.inclusive ? '..=' : '..';
    return `${start}${op}${end}`;
  }
  // Collection: borrow instead of move
  return `&${generateExpression(expr, analysis, fnName)}`;
}

// Handles ExpressionStatements that are NOT implicit returns — mostly function calls
function generateExprStatement(expr: Expression, analysis: AnalysisResult, fnName: string): string {
  if (expr.kind === 'FunctionCall') {
    return generateBuiltinCall(expr.name, expr.arguments, analysis, fnName, true);
  }
  if (expr.kind === 'MethodCall') {
    return generateExpression(expr, analysis, fnName) + ';';
  }
  return generateExpression(expr, analysis, fnName) + ';';
}

/**
 * Generates a single statement inside a multi-statement closure body as an inline string.
 * The last statement, if it is an ExpressionStatement, is emitted without a semicolon
 * so that Rust treats it as the implicit return value of the closure.
 */
function generateClosureBodyStatement(
  stmt: Statement,
  analysis: AnalysisResult,
  fnName: string,
  declaredVars: Set<string>,
  isLast: boolean,
): string {
  switch (stmt.kind) {
    case 'VariableAssignment': {
      const isFirst = !declaredVars.has(stmt.identifier);
      declaredVars.add(stmt.identifier);
      const expr = generateExpression(stmt.expression, analysis, fnName);
      return isFirst ? `let ${stmt.identifier} = ${expr};` : `${stmt.identifier} = ${expr};`;
    }
    case 'ExpressionStatement': {
      const expr = generateExpression(stmt.expression, analysis, fnName);
      return isLast ? expr : `${expr};`;
    }
    case 'ReturnStatement': {
      if (stmt.expression === null) return 'return;';
      return `return ${generateExpression(stmt.expression, analysis, fnName)};`;
    }
    case 'BreakStatement':
      return 'break;';
    case 'ContinueStatement':
      return 'continue;';
    case 'IfStatement': {
      const cond = generateExpression(stmt.condition, analysis, fnName);
      let result = `if ${cond} { `;
      result += stmt.thenBranch.map((s, i) =>
        generateClosureBodyStatement(s, analysis, fnName, declaredVars, isLast && i === stmt.thenBranch.length - 1 && !stmt.elseIfBranches.length && !stmt.elseBranch)
      ).join(' ');
      for (const branch of stmt.elseIfBranches) {
        const branchCond = generateExpression(branch.condition, analysis, fnName);
        result += ` } else if ${branchCond} { `;
        result += branch.body.map((s, i) =>
          generateClosureBodyStatement(s, analysis, fnName, declaredVars, isLast && i === branch.body.length - 1 && !stmt.elseBranch)
        ).join(' ');
      }
      if (stmt.elseBranch && stmt.elseBranch.length > 0) {
        result += ` } else { `;
        result += stmt.elseBranch.map((s, i) =>
          generateClosureBodyStatement(s, analysis, fnName, declaredVars, isLast && i === stmt.elseBranch!.length - 1)
        ).join(' ');
      }
      result += ' }';
      return result;
    }
    case 'WhileStatement': {
      const cond = generateExpression(stmt.condition, analysis, fnName);
      const body = stmt.body.map((s) =>
        generateClosureBodyStatement(s, analysis, fnName, declaredVars, false)
      ).join(' ');
      return `while ${cond} { ${body} }`;
    }
    case 'ForStatement': {
      const iterableCode = generateForIterable(stmt.iterable, analysis, fnName);
      const loopDeclaredVars = new Set<string>(declaredVars);
      loopDeclaredVars.add(stmt.variable);
      const body = stmt.body.map((s) =>
        generateClosureBodyStatement(s, analysis, fnName, loopDeclaredVars, false)
      ).join(' ');
      return `for ${stmt.variable} in ${iterableCode} { ${body} }`;
    }
    default:
      return `/* unsupported closure statement: ${stmt.kind} */`;
  }
}

/**
 * Generates a string key expression suitable for HashMap indexing/lookup.
 * For string literals, returns the raw `&str` form (e.g. `"Alice"`).
 * For string variables/expressions, appends `.as_str()`.
 */
function generateMapStringKey(expr: Expression, analysis: AnalysisResult, fnName: string): string {
  if (expr.kind === 'Literal' && expr.literalType === 'string') {
    return `"${expr.value as string}"`;
  }
  return `${generateExpression(expr, analysis, fnName)}.as_str()`;
}

function generateExpression(expr: Expression, analysis: AnalysisResult, fnName: string): string {
  switch (expr.kind) {
    case 'Literal':
      if (expr.literalType === 'string') {
        const str = expr.value as string;
        const interp = parseInterpolation(str);
        if (interp) {
          return `format!("${interp.format}", ${interp.vars.join(', ')})`;
        }
        return `String::from("${str}")`;
      }
      if (expr.literalType === 'float') {
        // Ensure float literals always have a decimal point so Rust treats them as f64
        const s = String(expr.value);
        return s.includes('.') ? s : `${s}.0`;
      }
      return String(expr.value);

    case 'Identifier':
      return expr.name;

    case 'GroupedExpression':
      return `(${generateExpression(expr.expression, analysis, fnName)})`;

    case 'UnaryExpression': {
      const operand = generateExpression(expr.operand, analysis, fnName);
      if (expr.operator === 'not') return `!${operand}`;
      return `-${operand}`;
    }

    case 'BinaryExpression': {
      const left = generateExpression(expr.left, analysis, fnName);
      const right = generateExpression(expr.right, analysis, fnName);
      // String concatenation: Rust's `+` requires &str on the right, so use format! instead
      if (expr.operator === '+') {
        const leftType = getExprType(expr.left, analysis, fnName);
        const rightType = getExprType(expr.right, analysis, fnName);
        if (isPrimitive(leftType, 'string') || isPrimitive(rightType, 'string')) {
          return `format!("{}{}", ${left}, ${right})`;
        }
      }
      const op = mapBinaryOp(expr.operator);
      return `${left} ${op} ${right}`;
    }

    case 'FunctionCall':
      return generateBuiltinCall(expr.name, expr.arguments, analysis, fnName, false);

    case 'EnumVariantAccess':
      return `${expr.enumName}::${expr.variant}`;

    case 'ArrayLiteral': {
      if (expr.elements.length === 0) return 'vec![]';
      const elems = expr.elements.map(e => generateExpression(e, analysis, fnName)).join(', ');
      return `vec![${elems}]`;
    }

    case 'MapLiteral': {
      if (expr.entries.length === 0) return 'HashMap::new()';
      const pairs = expr.entries.map(e => {
        const k = generateExpression(e.key, analysis, fnName);
        const v = generateExpression(e.value, analysis, fnName);
        return `(${k}, ${v})`;
      }).join(', ');
      return `HashMap::from([${pairs}])`;
    }

    case 'IndexExpression': {
      const obj = generateExpression(expr.object, analysis, fnName);
      const objType = getExprType(expr.object, analysis, fnName);
      if (typeof objType !== 'string' && objType.kind === 'map') {
        const keyType = objType.keyType;
        const isStringKey = typeof keyType !== 'string' && keyType.kind === 'primitive' && keyType.name === 'string';
        if (isStringKey) {
          const idx = generateMapStringKey(expr.index, analysis, fnName);
          return `${obj}[${idx}]`;
        }
        const idx = generateExpression(expr.index, analysis, fnName);
        return `${obj}[&${idx}]`;
      }
      const idx = generateExpression(expr.index, analysis, fnName);
      return `${obj}[${idx} as usize]`;
    }

    case 'MethodCall': {
      const obj = generateExpression(expr.object, analysis, fnName);
      const objType = getExprType(expr.object, analysis, fnName);
      // Map-type methods
      if (typeof objType !== 'string' && objType.kind === 'map') {
        switch (expr.method) {
          case 'length':
            return `${obj}.len()`;
          case 'contains': {
            const keyType = objType.keyType;
            const isStringKey = typeof keyType !== 'string' && keyType.kind === 'primitive' && keyType.name === 'string';
            const keyArg = expr.arguments[0]
              ? (isStringKey
                  ? generateMapStringKey(expr.arguments[0], analysis, fnName)
                  : `&${generateExpression(expr.arguments[0], analysis, fnName)}`)
              : '""';
            return `${obj}.contains_key(${keyArg})`;
          }
          case 'remove': {
            const keyType = objType.keyType;
            const isStringKey = typeof keyType !== 'string' && keyType.kind === 'primitive' && keyType.name === 'string';
            const keyArg = expr.arguments[0]
              ? (isStringKey
                  ? generateMapStringKey(expr.arguments[0], analysis, fnName)
                  : `&${generateExpression(expr.arguments[0], analysis, fnName)}`)
              : '""';
            return `${obj}.remove(${keyArg})`;
          }
          case 'keys':
            return `${obj}.keys().cloned().collect::<Vec<_>>()`;
          case 'values':
            return `${obj}.values().cloned().collect::<Vec<_>>()`;
          default: {
            const args = expr.arguments.map(a => generateExpression(a, analysis, fnName)).join(', ');
            return `${obj}.${expr.method}(${args})`;
          }
        }
      }
      switch (expr.method) {
        case 'length':
          return `${obj}.len()`;
        case 'to_upper':
          return `${obj}.to_uppercase()`;
        case 'to_lower':
          return `${obj}.to_lowercase()`;
        case 'trim':
          return `${obj}.trim().to_string()`;
        case 'contains':
        case 'starts_with':
        case 'ends_with': {
          const arg0 = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName) + '.as_str()'
            : '""';
          return `${obj}.${expr.method}(${arg0})`;
        }
        case 'replace': {
          const arg0 = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName) + '.as_str()'
            : '""';
          const arg1 = expr.arguments[1]
            ? generateExpression(expr.arguments[1], analysis, fnName) + '.as_str()'
            : '""';
          return `${obj}.replace(${arg0}, ${arg1})`;
        }
        case 'split': {
          const arg0 = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : 'String::from("")';
          return `${obj}.split(${arg0}.as_str()).map(|s| s.to_string()).collect::<Vec<String>>()`;
        }
        case 'char_at': {
          const arg0 = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '0';
          return `${obj}.chars().nth(${arg0} as usize).unwrap().to_string()`;
        }
        case 'map': {
          const closure = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '|x| x';
          return `${obj}.iter().map(${closure}).collect::<Vec<_>>()`;
        }
        case 'filter': {
          const closure = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '|x| true';
          return `${obj}.iter().filter(${closure}).cloned().collect::<Vec<_>>()`;
        }
        case 'reduce': {
          const initial = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '0';
          const closure = expr.arguments[1]
            ? generateExpression(expr.arguments[1], analysis, fnName)
            : '|acc, x| acc';
          return `${obj}.iter().fold(${initial}, ${closure})`;
        }
        case 'any': {
          const closure = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '|x| true';
          return `${obj}.iter().any(${closure})`;
        }
        case 'all': {
          const closure = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '|x| true';
          return `${obj}.iter().all(${closure})`;
        }
        case 'find': {
          const closure = expr.arguments[0]
            ? generateExpression(expr.arguments[0], analysis, fnName)
            : '|x| true';
          return `${obj}.iter().find(${closure}).cloned()`;
        }
        default: {
          const args = expr.arguments.map(a => generateExpression(a, analysis, fnName)).join(', ');
          return `${obj}.${expr.method}(${args})`;
        }
      }
    }

    case 'StructLiteral': {
      const fields = expr.fields.map(f => {
        const val = generateExpression(f.value, analysis, fnName);
        return `${f.name}: ${val}`;
      }).join(', ');
      return `${expr.name} { ${fields} }`;
    }

    case 'FieldAccess': {
      const obj = generateExpression(expr.object, analysis, fnName);
      return `${obj}.${expr.field}`;
    }

    case 'RangeExpression': {
      const start = generateExpression(expr.start, analysis, fnName);
      const end = generateExpression(expr.end, analysis, fnName);
      const op = expr.inclusive ? '..=' : '..';
      return `${start}${op}${end}`;
    }

    case 'ClosureExpression': {
      const params = expr.parameters.map(p => p.name).join(', ');
      if (!Array.isArray(expr.body)) {
        const body = generateExpression(expr.body, analysis, fnName);
        return `|${params}| ${body}`;
      }
      // Multi-statement body: emit |params| { stmt1; stmt2; last_expr }
      const stmts = expr.body as Statement[];
      const closureDeclaredVars = new Set<string>();
      const parts = stmts.map((stmt, i) =>
        generateClosureBodyStatement(stmt, analysis, fnName, closureDeclaredVars, i === stmts.length - 1)
      );
      return `|${params}| { ${parts.join(' ')} }`;
    }

    case 'SelfExpression':
      return 'self';

    case 'NoneLiteral':
      return 'None';

    default:
      return `/* unsupported expression kind: ${(expr as { kind: string }).kind} */`;
  }
}

function mapBinaryOp(op: BinaryOperator): string {
  if (op === 'and') return '&&';
  if (op === 'or') return '||';
  return op;
}

function generateBuiltinCall(
  name: string,
  args: Expression[],
  analysis: AnalysisResult,
  fnName: string,
  asStatement: boolean,
): string {
  if (name === 'print') {
    const arg = args[0];
    if (arg && arg.kind === 'Literal' && arg.literalType === 'string') {
      const str = arg.value as string;
      const interp = parseInterpolation(str);
      if (interp) {
        const suffix = asStatement ? ';' : '';
        return `println!("${interp.format}", ${interp.vars.join(', ')})${suffix}`;
      }
    }
    const argExpr = arg ? generateExpression(arg, analysis, fnName) : '""';
    const argType = arg ? getExprType(arg, analysis, fnName) : UNKNOWN;
    const isEnumType = typeof argType !== 'string' && argType.kind === 'enum';
    const fmt = isEnumType ? '{:?}' : '{}';
    const suffix = asStatement ? ';' : '';
    return `println!("${fmt}", ${argExpr})${suffix}`;
  }

  if (name === 'length') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    return `${argExpr}.len()`;
  }

  if (name === 'to_string') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    return `${argExpr}.to_string()`;
  }

  if (name === 'int') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '0';
    const argType = args[0] ? getExprType(args[0], analysis, fnName) : UNKNOWN;
    if (isPrimitive(argType, 'string')) {
      return `${argExpr}.parse::<i32>().unwrap()`;
    }
    return `${argExpr} as i32`;
  }

  if (name === 'float') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '0';
    const argType = args[0] ? getExprType(args[0], analysis, fnName) : UNKNOWN;
    if (isPrimitive(argType, 'string')) {
      return `${argExpr}.parse::<f64>().unwrap()`;
    }
    return `${argExpr} as f64`;
  }

  if (name === 'string') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    return `${argExpr}.to_string()`;
  }

  if (name === 'assert') {
    const condExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'true';
    const suffix = asStatement ? ';' : '';
    if (args.length >= 2) {
      const msgExpr = generateExpression(args[1], analysis, fnName);
      return `assert!(${condExpr}, "{}", ${msgExpr})${suffix}`;
    }
    return `assert!(${condExpr})${suffix}`;
  }

  if (name === 'panic') {
    const msgExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    const suffix = asStatement ? ';' : '';
    return `panic!("{}", ${msgExpr})${suffix}`;
  }

  if (name === 'env') {
    const nameExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    const suffix = asStatement ? ';' : '';
    return `std::env::var(${nameExpr}).unwrap_or_default()${suffix}`;
  }

  if (name === 'env_or') {
    const nameExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '""';
    const defaultExpr = args[1] ? generateExpression(args[1], analysis, fnName) : '""';
    const suffix = asStatement ? ';' : '';
    return `std::env::var(${nameExpr}).unwrap_or(${defaultExpr}.to_string())${suffix}`;
  }

  if (name === 'read_line') {
    // In non-assignment expression context: collapsed single-line block
    const suffix = asStatement ? ';' : '';
    return `{ let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }${suffix}`;
  }

  if (name === 'prompt') {
    // In non-assignment expression context: collapsed single-line block
    const msgExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
    const suffix = asStatement ? ';' : '';
    return `{ print!("{}", ${msgExpr}); std::io::Write::flush(&mut std::io::stdout()).unwrap(); let mut input = String::new(); std::io::stdin().read_line(&mut input).unwrap(); input.trim().to_string() }${suffix}`;
  }

  if (name === 'args') {
    const suffix = asStatement ? ';' : '';
    return `std::env::args().collect::<Vec<String>>()${suffix}`;
  }

  if (name === 'args_count') {
    const suffix = asStatement ? ';' : '';
    return `std::env::args().count() as i32${suffix}`;
  }

  if (name === 'read_file') {
    const pathExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
    const suffix = asStatement ? ';' : '';
    return `std::fs::read_to_string(${pathExpr}).unwrap()${suffix}`;
  }

  if (name === 'write_file') {
    const pathExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
    const contentExpr = args[1] ? generateExpression(args[1], analysis, fnName) : 'String::from("")';
    const suffix = asStatement ? ';' : '';
    return `std::fs::write(${pathExpr}, ${contentExpr}).unwrap()${suffix}`;
  }

  if (name === 'file_exists') {
    const pathExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
    const suffix = asStatement ? ';' : '';
    return `std::path::Path::new(&${pathExpr}).exists()${suffix}`;
  }

  if (name === 'some') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '()';
    const suffix = asStatement ? ';' : '';
    return `Some(${argExpr})${suffix}`;
  }

  if (name === 'ok') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : '()';
    const suffix = asStatement ? ';' : '';
    return `Ok(${argExpr})${suffix}`;
  }

  if (name === 'err') {
    const argExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
    const suffix = asStatement ? ';' : '';
    return `Err(${argExpr})${suffix}`;
  }

  // User-defined function call
  const argExprs = args.map(a => generateExpression(a, analysis, fnName)).join(', ');
  if (asStatement) return `${name}(${argExprs});`;
  return `${name}(${argExprs})`;
}

function generateAppendFileStatement(
  args: Expression[],
  analysis: AnalysisResult,
  fnName: string,
  emitter: RustEmitter,
): void {
  const pathExpr = args[0] ? generateExpression(args[0], analysis, fnName) : 'String::from("")';
  const contentExpr = args[1] ? generateExpression(args[1], analysis, fnName) : 'String::from("")';
  emitter.emit('{');
  emitter.indent();
  emitter.emit('use std::io::Write;');
  emitter.emit(`let mut file = std::fs::OpenOptions::new().append(true).create(true).open(${pathExpr}).unwrap();`);
  emitter.emit(`file.write_all(${contentExpr}.as_bytes()).unwrap();`);
  emitter.dedent();
  emitter.emit('}');
}

