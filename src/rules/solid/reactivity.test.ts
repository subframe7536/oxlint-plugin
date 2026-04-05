import { RuleTester } from 'oxlint/plugins-dev'
import { reactivityRule as rule } from './reactivity.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/reactivity', rule, {
  valid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
    },
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  return <div>{count}</div>;
}
      `,
      errors: [{ messageId: 'badSignal' }],
    },
  ],
})
