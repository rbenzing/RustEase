import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tokenize } from '../../src/lexer/lexer.js';
import { parse } from '../../src/parser/parser.js';
import { analyze } from '../../src/semantic/analyzer.js';
import { generate } from '../../src/codegen/generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesDir = join(__dirname, 'cases');

function compileFile(ylSource: string): string {
  const { tokens } = tokenize(ylSource, 'golden.re');
  const { program } = parse(tokens);
  const analysis = analyze(program);
  return generate(program, analysis);
}

function findGoldenCases(): string[] {
  const files = readdirSync(casesDir);
  return files
    .filter(f => f.endsWith('.re'))
    .map(f => f.replace('.re', ''));
}

describe('Golden tests', () => {
  const cases = findGoldenCases();

  for (const name of cases) {
    it(`golden: ${name}`, () => {
      const ylPath = join(casesDir, `${name}.re`);
      const expectedPath = join(casesDir, `${name}.expected.rs`);
      const ylSource = readFileSync(ylPath, 'utf-8');
      const expected = readFileSync(expectedPath, 'utf-8');
      const actual = compileFile(ylSource);
      // Normalize line endings (CRLF → LF) and trailing whitespace for comparison
      const normalizeOutput = (s: string) => s.replace(/\r\n/g, '\n').trimEnd();
      expect(normalizeOutput(actual)).toBe(normalizeOutput(expected));
    });
  }
});

