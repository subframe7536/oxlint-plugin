import { RuleTester } from 'oxlint/plugins-dev'
import { validUseServerRule as rule } from './valid-use-server.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-valid-use-server', rule, {
  valid: [
    {
      code: `
async function save() {
  "use server";
  return 1;
}
      `,
    },
    {
      code: `
"use server";
export async function save() {
  return 1;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
async function save() {
  const x = 1;
  "use server";
  return x;
}
      `,
      errors: [{ messageId: 'misplacedDirective' }],
    },
    {
      code: `
const obj = {
  async save() {
    "use server";
    return 1;
  }
};
      `,
      errors: [{ messageId: 'ineligiblePosition' }],
    },
  ],
})
