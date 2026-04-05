import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/*.ts',
  dts: {
    oxc: true,
  },
  exports: true,
  deps: {
    neverBundle: ['@oxlint/plugins', 'oxlint'],
  },
})
