import { describe, it, expect } from 'vitest';
import {
  isPrimitive, isUnknown, isNumeric, typesEqual, toRustType, typeToString,
  INT, FLOAT, STRING, BOOL, VOID, UNKNOWN,
} from '../../src/semantic/types.js';
import type { YlType } from '../../src/semantic/types.js';

describe('isPrimitive()', () => {
  it('returns true for structured primitive int', () => {
    expect(isPrimitive({ kind: 'primitive', name: 'int' })).toBe(true);
  });

  it('returns true for structured primitive float', () => {
    expect(isPrimitive({ kind: 'primitive', name: 'float' })).toBe(true);
  });

  it('returns true for structured primitive string', () => {
    expect(isPrimitive({ kind: 'primitive', name: 'string' })).toBe(true);
  });

  it('returns true for structured primitive bool', () => {
    expect(isPrimitive({ kind: 'primitive', name: 'bool' })).toBe(true);
  });

  it('returns true for structured primitive void', () => {
    expect(isPrimitive({ kind: 'primitive', name: 'void' })).toBe(true);
  });

  it('returns false for array kind', () => {
    expect(isPrimitive({ kind: 'array', elementType: INT })).toBe(false);
  });

  it('returns false for unknown kind', () => {
    expect(isPrimitive({ kind: 'unknown' })).toBe(false);
  });

  it('returns false for option kind', () => {
    expect(isPrimitive({ kind: 'option', innerType: INT })).toBe(false);
  });

  it('matches specific name when name filter provided', () => {
    expect(isPrimitive(INT, 'int')).toBe(true);
  });

  it('rejects non-matching name filter', () => {
    expect(isPrimitive(INT, 'float')).toBe(false);
  });
});

describe('isUnknown()', () => {
  it('returns true for structured unknown', () => {
    expect(isUnknown({ kind: 'unknown' })).toBe(true);
  });

  it('returns false for INT', () => {
    expect(isUnknown(INT)).toBe(false);
  });

  it('returns false for FLOAT', () => {
    expect(isUnknown(FLOAT)).toBe(false);
  });

  it('returns false for array kind', () => {
    expect(isUnknown({ kind: 'array', elementType: INT })).toBe(false);
  });
});

describe('isNumeric()', () => {
  it('returns true for INT', () => {
    expect(isNumeric(INT)).toBe(true);
  });

  it('returns true for FLOAT', () => {
    expect(isNumeric(FLOAT)).toBe(true);
  });

  it('returns false for STRING', () => {
    expect(isNumeric(STRING)).toBe(false);
  });

  it('returns false for BOOL', () => {
    expect(isNumeric(BOOL)).toBe(false);
  });


});

describe('typesEqual()', () => {
  it('same primitives are equal', () => {
    expect(typesEqual(INT, INT)).toBe(true);
  });

  it('different primitives are not equal', () => {
    expect(typesEqual(INT, FLOAT)).toBe(false);
  });

  it('INT and STRING are not equal', () => {
    expect(typesEqual(INT, STRING)).toBe(false);
  });

  it('two unknown types are equal', () => {
    expect(typesEqual(UNKNOWN, UNKNOWN)).toBe(true);
  });

  it('array with same element type is equal', () => {
    const a: YlType = { kind: 'array', elementType: INT };
    const b: YlType = { kind: 'array', elementType: INT };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('array with different element type is not equal', () => {
    const a: YlType = { kind: 'array', elementType: INT };
    const b: YlType = { kind: 'array', elementType: STRING };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('map with same key and value types is equal', () => {
    const a: YlType = { kind: 'map', keyType: STRING, valueType: INT };
    const b: YlType = { kind: 'map', keyType: STRING, valueType: INT };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('map with different value type is not equal', () => {
    const a: YlType = { kind: 'map', keyType: STRING, valueType: INT };
    const b: YlType = { kind: 'map', keyType: STRING, valueType: FLOAT };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('option with same inner type is equal', () => {
    const a: YlType = { kind: 'option', innerType: INT };
    const b: YlType = { kind: 'option', innerType: INT };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('option with different inner type is not equal', () => {
    const a: YlType = { kind: 'option', innerType: INT };
    const b: YlType = { kind: 'option', innerType: STRING };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('result with same ok and err types is equal', () => {
    const a: YlType = { kind: 'result', okType: INT, errType: STRING };
    const b: YlType = { kind: 'result', okType: INT, errType: STRING };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('result with different ok type is not equal', () => {
    const a: YlType = { kind: 'result', okType: INT, errType: STRING };
    const b: YlType = { kind: 'result', okType: FLOAT, errType: STRING };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('struct types with same name and fields are equal', () => {
    const fields = new Map<string, YlType>([['x', INT]]);
    const a: YlType = { kind: 'struct', name: 'Point', fields };
    const b: YlType = { kind: 'struct', name: 'Point', fields };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('struct types with different names are not equal', () => {
    const fields = new Map<string, YlType>([['x', INT]]);
    const a: YlType = { kind: 'struct', name: 'Point', fields };
    const b: YlType = { kind: 'struct', name: 'Rect', fields };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('function types with same params and return are equal', () => {
    const a: YlType = { kind: 'function', params: [INT], returnType: STRING };
    const b: YlType = { kind: 'function', params: [INT], returnType: STRING };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('function types with different return type are not equal', () => {
    const a: YlType = { kind: 'function', params: [INT], returnType: STRING };
    const b: YlType = { kind: 'function', params: [INT], returnType: BOOL };
    expect(typesEqual(a, b)).toBe(false);
  });

  it('tuple types with same elements are equal', () => {
    const a: YlType = { kind: 'tuple', elements: [INT, STRING] };
    const b: YlType = { kind: 'tuple', elements: [INT, STRING] };
    expect(typesEqual(a, b)).toBe(true);
  });

  it('tuple types with different length are not equal', () => {
    const a: YlType = { kind: 'tuple', elements: [INT, STRING] };
    const b: YlType = { kind: 'tuple', elements: [INT] };
    expect(typesEqual(a, b)).toBe(false);
  });
});

describe('toRustType()', () => {
  it('converts INT to i32', () => {
    expect(toRustType(INT)).toBe('i32');
  });

  it('converts FLOAT to f64', () => {
    expect(toRustType(FLOAT)).toBe('f64');
  });

  it('converts STRING to String', () => {
    expect(toRustType(STRING)).toBe('String');
  });

  it('converts BOOL to bool', () => {
    expect(toRustType(BOOL)).toBe('bool');
  });

  it('converts VOID to ()', () => {
    expect(toRustType(VOID)).toBe('()');
  });

  it('converts UNKNOWN to /* unknown */', () => {
    expect(toRustType(UNKNOWN)).toBe('/* unknown */');
  });

  it('converts array<int> to Vec<i32>', () => {
    expect(toRustType({ kind: 'array', elementType: INT })).toBe('Vec<i32>');
  });

  it('converts map<string,int> to HashMap<String, i32>', () => {
    expect(toRustType({ kind: 'map', keyType: STRING, valueType: INT })).toBe('HashMap<String, i32>');
  });

  it('converts option<int> to Option<i32>', () => {
    expect(toRustType({ kind: 'option', innerType: INT })).toBe('Option<i32>');
  });

  it('converts result<int,string> to Result<i32, String>', () => {
    expect(toRustType({ kind: 'result', okType: INT, errType: STRING })).toBe('Result<i32, String>');
  });

  it('converts tuple<int,string> to (i32, String)', () => {
    expect(toRustType({ kind: 'tuple', elements: [INT, STRING] })).toBe('(i32, String)');
  });

  it('converts struct to its name', () => {
    expect(toRustType({ kind: 'struct', name: 'Point', fields: new Map() })).toBe('Point');
  });

  it('converts enum to its name', () => {
    expect(toRustType({ kind: 'enum', name: 'Color', variants: [] })).toBe('Color');
  });

  it('converts named type to its name', () => {
    expect(toRustType({ kind: 'named', name: 'MyType' })).toBe('MyType');
  });

  it('converts function type to fn signature', () => {
    expect(toRustType({ kind: 'function', params: [INT], returnType: STRING })).toBe('fn(i32) -> String');
  });

});

describe('typeToString()', () => {
  it('converts INT to "int"', () => {
    expect(typeToString(INT)).toBe('int');
  });

  it('converts FLOAT to "float"', () => {
    expect(typeToString(FLOAT)).toBe('float');
  });

  it('converts STRING to "string"', () => {
    expect(typeToString(STRING)).toBe('string');
  });

  it('converts BOOL to "bool"', () => {
    expect(typeToString(BOOL)).toBe('bool');
  });

  it('converts VOID to "void"', () => {
    expect(typeToString(VOID)).toBe('void');
  });

  it('converts UNKNOWN to "unknown"', () => {
    expect(typeToString(UNKNOWN)).toBe('unknown');
  });

  it('converts array<int> to "array<int>"', () => {
    expect(typeToString({ kind: 'array', elementType: INT })).toBe('array<int>');
  });

  it('converts map<string,int> to "map<string, int>"', () => {
    expect(typeToString({ kind: 'map', keyType: STRING, valueType: INT })).toBe('map<string, int>');
  });

  it('converts option<string> to "option<string>"', () => {
    expect(typeToString({ kind: 'option', innerType: STRING })).toBe('option<string>');
  });

  it('converts result<int,string> to "result<int, string>"', () => {
    expect(typeToString({ kind: 'result', okType: INT, errType: STRING })).toBe('result<int, string>');
  });

  it('converts struct to "struct Point"', () => {
    expect(typeToString({ kind: 'struct', name: 'Point', fields: new Map() })).toBe('struct Point');
  });

  it('converts enum to "enum Color"', () => {
    expect(typeToString({ kind: 'enum', name: 'Color', variants: [] })).toBe('enum Color');
  });

  it('converts named type to its name', () => {
    expect(typeToString({ kind: 'named', name: 'MyType' })).toBe('MyType');
  });

  it('converts function type to fn signature string', () => {
    expect(typeToString({ kind: 'function', params: [INT], returnType: STRING })).toBe('fn(int) -> string');
  });

  it('converts tuple to "(int, string)"', () => {
    expect(typeToString({ kind: 'tuple', elements: [INT, STRING] })).toBe('(int, string)');
  });

});

