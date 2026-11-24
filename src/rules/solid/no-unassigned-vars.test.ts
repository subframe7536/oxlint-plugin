import { RuleTester } from 'oxlint/plugins-dev'
import { noUnassignedVarsRule as rule } from './no-unassigned-vars.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-unassigned-vars', rule, {
  valid: [
    {
      code: `
function App() {
  let el: HTMLDivElement | undefined;
  return <div ref={el} />;
}
      `,
    },
    {
      code: `
let x = 1;
console.log(x);
      `,
    },
  ],
  invalid: [
    {
      code: `
function App() {
  let el: HTMLDivElement | undefined;
  console.log(el);
  return <div />;
}
      `,
      errors: [{ messageId: 'unassigned' }],
    },
  ],
})
