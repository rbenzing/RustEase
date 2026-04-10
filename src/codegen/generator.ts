import type {
  Program, FunctionDeclaration, Statement, Expression,
  BinaryOperator, ConstDeclaration, EnumDeclaration, StructDeclaration,
  MatchPattern, ImplDeclaration,
} from '../ast/nodes.js';
import { getFunctions } from '../ast/nodes.js';
import type { YlType, AnalysisResult } from '../semantic/types.js';
import { VOID, UNKNOWN, isPrimitive, isUnknown, toRustType } from '../semantic/types.js';
import { RustEmitter } from './rust-emitter.js';
import { builtinRegistry } from '../semantic/builtins.js';

const INTERP_REGEX = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Returns true if the type contains UNKNOWN at any level — used to skip Rust type annotations. */
function typeNeedsInference(type: YlType): boolean {
  if (isUnknown(type)) return true;
  if (type.kind === 'option') return typeNeedsInference(type.innerType);
  if (type.kind === 'result') return typeNeedsInference(type.okType) || typeNeedsInference(type.errType);
  if (type.kind === 'array') return typeNeedsInference(type.elementType);
  if (type.kind === 'map') return typeNeedsInference(type.keyType) || typeNeedsInference(type.valueType);
  return false;
}

/** Read the resolved type stored on an expression node during semantic analysis. */
function readType(expr: Expression): YlType {
  return (expr as any).resolvedType ?? UNKNOWN;
}

function parseInterpolation(str: string): { format: string; vars: string[] } | null {
  const vars: string[] = [];
  INTERP_REGEX.lastIndex = 0;
  const format = str.replace(INTERP_REGEX, (_m, name: string) => {
    vars.push(name);
    return '{}';
  });
  if (vars.length === 0) return null;
  return { format, vars };
}

function generateMatchPattern(
  pattern: MatchPattern,
  matchExprType: YlType,
): string {
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
    case 'EnumPattern': {
      // For unqualified patterns (enumName = ''), infer enum name from match expression type
      const enumName = pattern.enumName ||
        (matchExprType.kind === 'enum' ? matchExprType.name : '');
      if (pattern.bindings && pattern.bindings.length > 0) {
        const bindingsStr = pattern.bindings.join(', ');
        return `${enumName}::${pattern.variant}(${bindingsStr})`;
      }
      return `${enumName}::${pattern.variant}`;
    }
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
      const builtin = builtinRegistry.get(expr.name);
      if (builtin?.useStatements) {
        for (const stmt of builtin.useStatements) {
          emitter.addUseStatement(stmt);
        }
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
    case 'TupleLiteral':
      for (const elem of expr.elements) collectUseStmtsFromExpr(elem, emitter);
      break;
    case 'IfExpression':
      collectUseStmtsFromExpr(expr.condition, emitter);
      collectUseStmtsFromExpr(expr.thenBranch, emitter);
      collectUseStmtsFromExpr(expr.elseBranch, emitter);
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
    if (variant.data && variant.data.length > 0) {
      const dataTypes = variant.data.map(t => annotationToRustType(t)).join(', ');
      emitter.emit(`${variant.name}(${dataTypes}),`);
    } else {
      emitter.emit(`${variant.name},`);
    }
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
  if (expr.kind === 'UnaryExpression' && expr.operator === '-' && expr.operand.kind === 'Literal') {
    if (expr.operand.literalType === 'int') return 'i32';
    if (expr.operand.literalType === 'float') return 'f64';
  }
  return '/* unknown */';
}

/** Generate the value expression for a const — strings use raw "..." not String::from. */
function generateConstValue(expr: Expression): string {
  if (expr.kind === 'Literal') {
    if (expr.literalType === 'string') return `"${expr.value as string}"`;
    return String(expr.value);
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '-' && expr.operand.kind === 'Literal') {
    return `-${String(expr.operand.value)}`;
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
        const isFunctionType = ylType && ylType.kind === 'function';
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
      generateStatements(fnName, stmt.thenBranch, analysis, emitter, new Set<string>(declaredVars), -1);
      emitter.dedent();
      for (const branch of stmt.elseIfBranches) {
        const branchCond = generateExpression(branch.condition, analysis, fnName);
        emitter.emit(`} else if ${branchCond} {`);
        emitter.indent();
        generateStatements(fnName, branch.body, analysis, emitter, new Set<string>(declaredVars), -1);
        emitter.dedent();
      }
      if (stmt.elseBranch) {
        emitter.emit('} else {');
        emitter.indent();
        generateStatements(fnName, stmt.elseBranch, analysis, emitter, new Set<string>(declaredVars), -1);
        emitter.dedent();
      }
      emitter.emit('}');
      break;
    }
    case 'WhileStatement': {
      const cond = generateExpression(stmt.condition, analysis, fnName);
      const header = cond === 'true' ? 'loop' : `while ${cond}`;
      emitter.emit(`${header} {`);
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
      const loopDeclaredVars = new Set<string>(declaredVars);
      if (stmt.destructure) {
        const iterableCode = generateExpression(stmt.iterable, analysis, fnName);
        emitter.emit(`for (${stmt.destructure.key}, ${stmt.destructure.value}) in ${iterableCode}.iter() {`);
        emitter.indent();
        loopDeclaredVars.add(stmt.destructure.key);
        loopDeclaredVars.add(stmt.destructure.value);
      } else {
        const iterableCode = generateForIterable(stmt.iterable, analysis, fnName);
        emitter.emit(`for ${stmt.variable} in ${iterableCode} {`);
        emitter.indent();
        // Pass a copy of declaredVars; loop variable is declared implicitly by the for loop
        loopDeclaredVars.add(stmt.variable);
      }
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
      const exprType = readType(stmt.expression);
      const isStringMatch = isPrimitive(exprType, 'string');
      const exprCode = generateExpression(stmt.expression, analysis, fnName);
      const matchSubject = isStringMatch ? `${exprCode}.as_str()` : exprCode;
      emitter.emit(`match ${matchSubject} {`);
      emitter.indent();
      for (const arm of stmt.arms) {
        const pat = generateMatchPattern(arm.pattern, exprType);
        emitter.emit(`${pat} => {`);
        emitter.indent();
        generateStatements(fnName, arm.body, analysis, emitter, new Set<string>(declaredVars), -1);
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
      const objType = readType(stmt.object);
      if (objType.kind === 'map') {
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
      const header = cond === 'true' ? 'loop' : `while ${cond}`;
      return `${header} { ${body} }`;
    }
    case 'ForStatement': {
      const loopDeclaredVars = new Set<string>(declaredVars);
      let forHeader: string;
      if (stmt.destructure) {
        const iterableCode = generateExpression(stmt.iterable, analysis, fnName);
        loopDeclaredVars.add(stmt.destructure.key);
        loopDeclaredVars.add(stmt.destructure.value);
        forHeader = `for (${stmt.destructure.key}, ${stmt.destructure.value}) in ${iterableCode}.iter()`;
      } else {
        const iterableCode = generateForIterable(stmt.iterable, analysis, fnName);
        loopDeclaredVars.add(stmt.variable);
        forHeader = `for ${stmt.variable} in ${iterableCode}`;
      }
      const body = stmt.body.map((s) =>
        generateClosureBodyStatement(s, analysis, fnName, loopDeclaredVars, false)
      ).join(' ');
      return `${forHeader} { ${body} }`;
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
        const leftType = readType(expr.left);
        const rightType = readType(expr.right);
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
      if (expr.arguments && expr.arguments.length > 0) {
        const args = expr.arguments.map(a => generateExpression(a, analysis, fnName)).join(', ');
        return `${expr.enumName}::${expr.variant}(${args})`;
      }
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
      const objType = readType(expr.object);
      if (objType.kind === 'map') {
        const keyType = objType.keyType;
        const isStringKey = keyType.kind === 'primitive' && keyType.name === 'string';
        if (isStringKey) {
          const idx = generateMapStringKey(expr.index, analysis, fnName);
          return `${obj}[${idx}]`;
        }
        const idx = generateExpression(expr.index, analysis, fnName);
        return `${obj}[&${idx}]`;
      }
      // Range-based slice: arr[1..3] → arr[1..3].to_vec()
      if (expr.index.kind === 'RangeExpression') {
        const start = generateExpression(expr.index.start, analysis, fnName);
        const end = generateExpression(expr.index.end, analysis, fnName);
        const op = expr.index.inclusive ? '..=' : '..';
        return `${obj}[${start}${op}${end}].to_vec()`;
      }
      const idx = generateExpression(expr.index, analysis, fnName);
      const baseIndex = `${obj}[${idx} as usize]`;
      // Non-Copy types (String, structs, enums, arrays, options, results) need .clone()
      // to avoid "cannot move out of index" compile errors
      if (objType.kind === 'array') {
        const elemType = objType.elementType;
        const isCopy = elemType.kind === 'primitive' && (elemType.name === 'int' || elemType.name === 'float' || elemType.name === 'bool');
        if (!isCopy) {
          return `${baseIndex}.clone()`;
        }
      }
      return baseIndex;
    }

    case 'MethodCall': {
      const obj = generateExpression(expr.object, analysis, fnName);
      const objType = readType(expr.object);
      // Map-type methods
      if (objType.kind === 'map') {
        switch (expr.method) {
          case 'length':
            return `${obj}.len()`;
          case 'contains': {
            const keyType = objType.keyType;
            const isStringKey = keyType.kind === 'primitive' && keyType.name === 'string';
            const keyArg = expr.arguments[0]
              ? (isStringKey
                  ? generateMapStringKey(expr.arguments[0], analysis, fnName)
                  : `&${generateExpression(expr.arguments[0], analysis, fnName)}`)
              : '""';
            return `${obj}.contains_key(${keyArg})`;
          }
          case 'remove': {
            const keyType = objType.keyType;
            const isStringKey = keyType.kind === 'primitive' && keyType.name === 'string';
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

    case 'TupleLiteral': {
      const elems = expr.elements.map(e => generateExpression(e, analysis, fnName)).join(', ');
      return `(${elems})`;
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

    case 'IfExpression': {
      const cond = generateExpression(expr.condition, analysis, fnName);
      const thenExpr = generateExpression(expr.thenBranch, analysis, fnName);
      const elseExpr = generateExpression(expr.elseBranch, analysis, fnName);
      return `if ${cond} { ${thenExpr} } else { ${elseExpr} }`;
    }

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
  // print — special-cased because it needs raw AST node access to distinguish
  // string-literal interpolation (emit format inline) from other expressions (wrap in println!("{}", ...))
  if (name === 'print') {
    const suffix = asStatement ? ';' : '';
    if (args.length > 1) {
      const fmtParts = args.map(() => '{}').join(' ');
      const argExprs = args.map(arg => generateExpression(arg, analysis, fnName)).join(', ');
      return `println!("${fmtParts}", ${argExprs})${suffix}`;
    }
    const arg = args[0];
    if (arg && arg.kind === 'Literal' && arg.literalType === 'string') {
      const str = arg.value as string;
      const interp = parseInterpolation(str);
      if (interp) {
        return `println!("${interp.format}", ${interp.vars.join(', ')})${suffix}`;
      }
    }
    const argExpr = arg ? generateExpression(arg, analysis, fnName) : '""';
    const argType = arg ? readType(arg) : UNKNOWN;
    const isEnumType = argType.kind === 'enum';
    const isArrayType = argType.kind === 'array';
    const fmt = (isEnumType || isArrayType) ? '{:?}' : '{}';
    return `println!("${fmt}", ${argExpr})${suffix}`;
  }

  // Other built-in functions — delegate to the registry
  const builtin = builtinRegistry.get(name);
  if (builtin) {
    const genArgs = args.map(a => generateExpression(a, analysis, fnName));
    const argTypes = args.map(a => readType(a));
    const suffix = asStatement ? ';' : '';
    return builtin.generateRust(genArgs, argTypes) + suffix;
  }

  // User-defined function call — fill in missing trailing defaults
  const fnInfo = analysis.functionTypes.get(name);
  const allArgExprs: string[] = args.map(a => generateExpression(a, analysis, fnName));
  if (fnInfo?.paramDefaults) {
    const defaults = fnInfo.paramDefaults;
    for (let i = args.length; i < defaults.length; i++) {
      const def = defaults[i];
      if (def !== undefined) {
        allArgExprs.push(generateExpression(def, analysis, fnName));
      }
    }
  }
  const argExprs = allArgExprs.join(', ');
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

