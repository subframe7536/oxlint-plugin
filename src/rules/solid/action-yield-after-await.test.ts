import { RuleTester } from 'oxlint/plugins-dev'
import { actionYieldAfterAwaitRule as rule } from './action-yield-after-await.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-action-yield-after-await', rule, {
  valid: [
    {
      code: `
import { action } from 'solid-js';
const save = action(async function* () {
  const res = await fetch('/api'); yield;
  setState(res);
});
      `,
    },
    {
      code: `
import { action } from 'solid-js';
const save = action(async function* () {
  const r = await fetch('/api');
  yield;
  return r;
});
      `,
    },
  ],
  invalid: [
    {
      code: `
import { action } from 'solid-js';
const save = action(async function* () {
  const res = await fetch('/api');
  setState(res);
});
      `,
      output: `
import { action } from 'solid-js';
const save = action(async function* () {
  const res = await fetch('/api'); yield;
  setState(res);
});
      `,
      errors: [{ messageId: 'missingYield' }],
    },
  ],
})
