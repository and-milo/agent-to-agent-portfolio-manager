import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { milo: 'src/cli.ts' },
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  banner: { js: '#!/usr/bin/env node' },
});
