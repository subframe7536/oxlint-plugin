import { RuleTester } from 'oxlint/plugins-dev'
import { noStoreMutationOutsideSetterRule as rule } from './no-store-mutation-outside-setter.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-store-mutation-outside-setter', rule, {
  valid: [
    {
      code: `
import { createStore } from 'solid-js';
function App() {
  const [store, setStore] = createStore({ count: 0 });
  setStore((s) => { s.count++; });
  return <div>{store.count}</div>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createStore } from 'solid-js';
function App() {
  const [store] = createStore({ count: 0 });
  store.count++;
  return <div>{store.count}</div>;
}
      `,
      errors: [{ messageId: 'mutateStore' }],
    },
    {
      code: `
import { createStore } from 'solid-js';
function App() {
  const [store] = createStore({ items: [] as number[] });
  store.items.push(1);
  return <div />;
}
      `,
      errors: [{ messageId: 'mutateStore' }],
    },
  ],
})
