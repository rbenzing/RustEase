export class RustEmitter {
  private lines: string[] = [];
  private indentLevel = 0;
  private indentStr = '    '; // 4 spaces
  private useStatements: Set<string> = new Set();

  addUseStatement(stmt: string): void {
    this.useStatements.add(stmt);
  }

  getUseStatements(): string[] {
    return [...this.useStatements].sort();
  }

  emit(line: string): void {
    this.lines.push(this.indentStr.repeat(this.indentLevel) + line);
  }

  emitRaw(line: string): void {
    this.lines.push(line);
  }

  indent(): void {
    this.indentLevel++;
  }

  dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  toString(): string {
    return this.lines.join('\n') + '\n';
  }
}

