import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    oxc: true,
  },
  exports: true,
  deps: {
    neverBundle: ['@oxlint/plugins'],
  },
})
