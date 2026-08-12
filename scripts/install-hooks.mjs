import { chmodSync, existsSync } from 'node:fs';

const hook = '.githooks/pre-commit';
if (existsSync(hook)) chmodSync(hook, 0o755);
