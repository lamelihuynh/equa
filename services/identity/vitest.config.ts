import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contractsEntry = fileURLToPath(new URL('../../packages/contracts/src/index.ts', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@equa/contracts': contractsEntry,
    },
  },
});
