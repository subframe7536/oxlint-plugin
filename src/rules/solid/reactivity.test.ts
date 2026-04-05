import { RuleTester } from 'oxlint/plugins-dev'
import { reactivityRule as rule } from './reactivity.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-reactivity', rule, {
  valid: [
    // Signal called correctly in JSX
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
    },
    // Signal used in event handler (reactive context via callback)
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
      `,
    },
    // createMemo is a tracked reactive scope
    {
      code: `
import { createSignal, createMemo } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  const doubled = createMemo(() => n() * 2);
  return <div>{doubled()}</div>;
}
      `,
    },
    // createEffect is a tracked reactive scope
    {
      code: `
import { createSignal, createEffect } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  createEffect(() => {
    console.log(count());
  });
  return <div/>;
}
      `,
    },
  ],
  invalid: [
    // Signal used as value instead of being called
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
