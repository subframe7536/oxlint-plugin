import { RuleTester } from 'oxlint/plugins-dev'
import { preferOnSettledForSideEffectsRule as rule } from './prefer-onSettled-for-side-effects.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-prefer-onSettled-for-side-effects', rule, {
  valid: [
    {
      code: `
import { onSettled } from 'solid-js';
function App() {
  onSettled(() => {
    setInterval(() => {}, 1000);
  });
  return <div />;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
function App() {
  setInterval(() => {}, 1000);
  return <div />;
}
      `,
      errors: [{ messageId: 'sideEffectInBody' }],
    },
  ],
})
