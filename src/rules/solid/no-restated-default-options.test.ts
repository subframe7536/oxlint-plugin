import { RuleTester } from 'oxlint/plugins-dev'
import { noRestatedDefaultOptionsRule as rule } from './no-restated-default-options.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-restated-default-options', rule, {
  valid: [
    {
      code: `
import { For } from 'solid-js';
const el = <For each={items()} keyed={false}>{(item) => <div>{item()}</div>}</For>;
      `,
    },
  ],
  invalid: [
    {
      code: `
import { For } from 'solid-js';
const el = <For each={items()} keyed={true}>{(item) => <div>{item}</div>}</For>;
      `,
      output: `
import { For } from 'solid-js';
const el = <For each={items()} >{(item) => <div>{item}</div>}</For>;
      `,
      errors: [{ messageId: 'restatedDefault' }],
    },
    {
      code: `
import { Show } from 'solid-js';
const el = <Show when={cond()} keyed={false}><div /></Show>;
      `,
      output: `
import { Show } from 'solid-js';
const el = <Show when={cond()} ><div /></Show>;
      `,
      errors: [{ messageId: 'restatedDefault' }],
    },
  ],
})
