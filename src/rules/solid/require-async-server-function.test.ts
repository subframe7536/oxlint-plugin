import { RuleTester } from 'oxlint/plugins-dev'
import { requireAsyncServerFunctionRule as rule } from './require-async-server-function.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-require-async-server-function', rule, {
  valid: [
    {
      code: `
async function save() {
  "use server";
  return 1;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
function save() {
  "use server";
  return 1;
}
      `,
      output: `
async function save() {
  "use server";
  return 1;
}
      `,
      errors: [{ messageId: 'asyncServerFunction' }],
    },
  ],
})
