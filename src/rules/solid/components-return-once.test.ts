import { RuleTester } from 'oxlint/plugins-dev'
import { componentsReturnOnceRule as rule } from './components-return-once.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/components-return-once', rule, {
  valid: [
    {
      code: `
function App() {
  return <div>Hello</div>;
}
      `,
    },
    {
      code: `
function App() {
  return <Show when={cond}><div/></Show>;
}
      `,
    },
  ],
  invalid: [
    {
      code: `
function App(props) {
  if (props.x) return null;
  return <div/>;
}
      `,
      errors: [{ messageId: 'noEarlyReturn' }],
    },
  ],
})
