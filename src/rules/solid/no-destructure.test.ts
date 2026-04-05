import { RuleTester } from 'oxlint/plugins-dev'
import { noDestructureRule as rule } from './no-destructure.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/no-destructure', rule, {
  valid: [
    { code: `function App(props) { return <div>{props.name}</div> }` },
    { code: `function App({ name }) { return name }` },
  ],
  invalid: [
    {
      code: `function App({ name }) { return <div>{name}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `function App(props) { return <div>{props.name}</div> }`,
    },
  ],
})
