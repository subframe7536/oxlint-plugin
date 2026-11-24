import { RuleTester } from 'oxlint/plugins-dev'
import { noAccessorAsPropRule as rule } from './no-accessor-as-prop.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-accessor-as-prop', rule, {
  valid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [title] = createSignal('hi');
  return <div title={title()} />;
}
      `,
    },
    {
      code: `
function App() {
  const onClick = () => {};
  return <button onClick={onClick} />;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [title] = createSignal('hi');
  return <div title={title} />;
}
      `,
      errors: [{ messageId: 'accessorAsProp' }],
    },
  ],
})
