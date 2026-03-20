import { describe, it, expect } from 'vitest';
import { YL_TO_RUST_TYPE } from '../../src/semantic/types.js';
import type { YlType } from '../../src/semantic/types.js';

describe('YL_TO_RUST_TYPE mapping', () => {
  it('maps int to i32', () => {
    expect(YL_TO_RUST_TYPE['int']).toBe('i32');
  });

  it('maps float to f64', () => {
    expect(YL_TO_RUST_TYPE['float']).toBe('f64');
  });

  it('maps string to String', () => {
    expect(YL_TO_RUST_TYPE['string']).toBe('String');
  });

  it('maps bool to bool', () => {
    expect(YL_TO_RUST_TYPE['bool']).toBe('bool');
  });

  it('maps void to ()', () => {
    expect(YL_TO_RUST_TYPE['void']).toBe('()');
  });

  it('maps unknown to /* unknown */', () => {
    expect(YL_TO_RUST_TYPE['unknown']).toBe('/* unknown */');
  });

  it('covers all 6 YlType values', () => {
    const ylTypes: YlType[] = ['int', 'float', 'string', 'bool', 'void', 'unknown'];
    for (const t of ylTypes) {
      expect(YL_TO_RUST_TYPE[t]).toBeDefined();
    }
  });

  it('has exactly 6 entries', () => {
    const entries = Object.keys(YL_TO_RUST_TYPE);
    expect(entries).toHaveLength(6);
  });

  it('all Rust type values are non-empty strings', () => {
    for (const rustType of Object.values(YL_TO_RUST_TYPE)) {
      expect(typeof rustType).toBe('string');
      expect(rustType.length).toBeGreaterThan(0);
    }
  });
});

