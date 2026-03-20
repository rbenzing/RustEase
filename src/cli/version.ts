import { createRequire } from 'node:module';

declare const __RUSTEASE_VERSION__: string;

export const VERSION: string =
  typeof __RUSTEASE_VERSION__ !== 'undefined'
    ? __RUSTEASE_VERSION__
    : (() => {
        const require = createRequire(import.meta.url);
        const pkg = require('../../package.json') as { version: string };
        return pkg.version;
      })();

