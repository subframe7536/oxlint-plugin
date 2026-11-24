import { RuleTester } from 'oxlint/plugins-dev'
import { noModuleScopeReactivePrimitiveRule as rule } from './no-module-scope-reactive-primitive.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-module-scope-reactive-primitive', rule, {
  valid: [
    {
      code: `
import { createRoot, createSignal } from 'solid-js';
createRoot(() => {
  const [count] = createSignal(0);
  return count;
});
      `,
    },
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createSignal } from 'solid-js';
const [count, setCount] = createSignal(0);
      `,
      errors: [{ messageId: 'moduleScopePrimitive' }],
    },
  ],
})
