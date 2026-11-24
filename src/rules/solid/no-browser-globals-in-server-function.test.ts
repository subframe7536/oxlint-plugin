import { RuleTester } from 'oxlint/plugins-dev'
import { noBrowserGlobalsInServerFunctionRule as rule } from './no-browser-globals-in-server-function.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-browser-globals-in-server-function', rule, {
  valid: [
    {
      code: `
async function load() {
  "use server";
  return await fetch('https://example.com');
}
      `,
    },
    {
      code: `
async function load() {
  "use server";
  if (typeof window !== 'undefined') return null;
  return 1;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
async function load() {
  "use server";
  return window.location.href;
}
      `,
      errors: [{ messageId: 'browserGlobal' }],
    },
    {
      code: `
"use server";
export async function load() {
  return document.title;
}
      `,
      errors: [{ messageId: 'browserGlobal' }],
    },
  ],
})
