import { RuleTester } from 'oxlint/plugins-dev'
import { noUnusedSignalRule as rule } from './no-unused-signal.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-unused-signal', rule, {
  valid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>;
}
      `,
    },
    {
      code: `
import { createSignal } from 'solid-js';
function App(props: { value: number }) {
  const [derived] = createSignal(() => props.value * 2);
  return <div>{derived()}</div>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
      errors: [{ messageId: 'neverWritten' }],
    },
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(1)}>inc</button>;
}
      `,
      errors: [{ messageId: 'neverRead' }],
    },
  ],
})
