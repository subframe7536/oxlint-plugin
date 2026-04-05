import { RuleTester } from 'oxlint/plugins-dev'
import { noDestructureRule as rule } from './no-destructure.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-destructure', rule, {
  valid: [
    // Correct: use props.x to preserve reactivity
    { code: `function App(props) { return <div>{props.name}</div> }` },
    // Non-component with destructuring is fine (no JSX in body)
    { code: `function App({ name }) { return name }` },
    // Arrow function component using props correctly
    { code: `const App = (props) => <div>{props.title}</div>` },
    // No props at all
    { code: `function App() { return <div>static</div> }` },
  ],
  invalid: [
    // Basic destructure in component
    {
      code: `function App({ name }) { return <div>{name}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `function App(props) { return <div>{props.name}</div> }`,
    },
    // Multiple destructured props
    {
      code: `function App({ a, b }) { return <div>{a}{b}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `function App(props) { return <div>{props.a}{props.b}</div> }`,
    },
  ],
})
