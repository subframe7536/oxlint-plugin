import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: 'src/*.ts',
  dts: {
    generator: 'tsrs',
  },
  exports: true,
  deps: {
    neverBundle: ['@oxlint/plugins', 'oxlint'],
  },
})
