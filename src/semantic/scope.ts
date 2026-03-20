import type { YlType } from './types.js';

export class Scope {
  private variables: Map<string, YlType> = new Map();
  private parent: Scope | null;
  public readonly inLoop: boolean;

  constructor(parent: Scope | null = null, options?: { inLoop?: boolean }) {
    this.parent = parent;
    this.inLoop = options?.inLoop ?? parent?.inLoop ?? false;
  }

  define(name: string, type: YlType): void {
    this.variables.set(name, type);
  }

  lookup(name: string): YlType | undefined {
    return this.variables.get(name) ?? this.parent?.lookup(name);
  }

  isDefined(name: string): boolean {
    return this.variables.has(name) || (this.parent?.isDefined(name) ?? false);
  }

  isDefinedInCurrentScope(name: string): boolean {
    return this.variables.has(name);
  }

  /** Creates a child scope that is inside a loop */
  createLoopScope(): Scope {
    return new Scope(this, { inLoop: true });
  }

  /** Creates a child block scope that inherits loop context */
  createBlockScope(): Scope {
    return new Scope(this);
  }

  /** Returns whether we're inside any loop */
  isInLoop(): boolean {
    return this.inLoop;
  }
}

