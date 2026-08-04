import { RuleTester } from 'oxlint/plugins-dev'

import { topLevelFunctionRule as rule } from './top-level-function.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('top-level-function', rule, {
  valid: [
    { code: 'function foo() {}' },
    { code: 'function foo() { const bar = () => {} }' },
    { code: 'const Foo: Bar = () => {}' },
    { code: 'let foo = () => {}' },
    { code: 'const foo = (() => {}) as any' },
    { code: ';(() => {})()' },
    { code: 'export default () => {}' },
    { code: 'const foo = (x, y) => x + y' },
    { code: 'const foo = async (x, y) => x + y' },
    { code: 'const foo = () => String(123)' },
    { code: 'const foo = () => ({})' },
  ],
  invalid: [
    {
      code: 'const foo = (x, y) => \nx + y',
      errors: [{ messageId: 'topLevelFunctionDeclaration' }],
      output: 'function foo (x, y) {\n  return x + y\n}',
    },
    {
      code: 'const foo = (as: string, bar: number) => { return as + bar }',
      errors: [{ messageId: 'topLevelFunctionDeclaration' }],
      output: 'function foo (as: string, bar: number) { return as + bar }',
    },
    {
      code: 'const foo = <K, T extends Boolean>(as: string, bar: number): Omit<T, K> => \nas + bar',
      errors: [{ messageId: 'topLevelFunctionDeclaration' }],
      output:
        'function foo <K, T extends Boolean>(as: string, bar: number): Omit<T, K> {\n  return as + bar\n}',
    },
    {
      code: 'export const foo = () => {}',
      errors: [{ messageId: 'topLevelFunctionDeclaration' }],
      output: 'export function foo () {}',
    },
    {
      code: 'export const foo = async function () {\nreturn {}\n }',
      errors: [{ messageId: 'topLevelFunctionDeclaration' }],
      output: 'export async function foo () {\nreturn {}\n }',
    },
  ],
})
