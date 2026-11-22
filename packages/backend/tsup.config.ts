import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    api: 'src/api/index.ts',
    worker: 'src/worker/index.ts',
  },
  format: ['esm'],
  target: 'node24',
  sourcemap: true,
  clean: true,
  splitting: false,
  noExternal: ['@wbc/shared'],
})
