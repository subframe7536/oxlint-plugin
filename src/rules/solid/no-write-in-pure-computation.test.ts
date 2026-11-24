import { RuleTester } from 'oxlint/plugins-dev'
import { noWriteInPureComputationRule as rule } from './no-write-in-pure-computation.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-write-in-pure-computation', rule, {
  valid: [
    {
      code: `
import { createSignal, createEffect } from 'solid-js';
function App() {
  const [a, setA] = createSignal(0);
  const [b, setB] = createSignal(0);
  createEffect(() => a(), (v) => setB(v));
  return <button onClick={() => setA(1)}>{b()}</button>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createSignal, createMemo } from 'solid-js';
function App() {
  const [a, setA] = createSignal(0);
  const m = createMemo(() => {
    setA(1);
    return a();
  });
  return <div>{m()}</div>;
}
      `,
      errors: [{ messageId: 'writeInMemo' }],
    },
  ],
})
