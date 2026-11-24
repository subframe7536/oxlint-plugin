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
    { code: `function App(props) { return <div>{props.name}</div> }` },
    { code: `function App({ name }) { return name }` },
    { code: `const App = (props) => <div>{props.title}</div>` },
    { code: `function App() { return <div>static</div> }` },
  ],
  invalid: [
    {
      code: `function App({ name }) { return <div>{name}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `function App(props) { return <div>{props.name}</div> }`,
    },
    {
      code: `function App({ a, b }) { return <div>{a}{b}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `function App(props) { return <div>{props.a}{props.b}</div> }`,
    },
    {
      code: `function App({ name = 'guest' }) { return <div>{name}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
      output: `import { mergeProps } from "solid-js";\nfunction App(_props) {   const props = mergeProps({ name: 'guest' }, _props);\nreturn <div>{props.name}</div> }`,
    },
    {
      code: `function App({ name = 'guest', ...rest }) { return <div {...rest}>{name}</div> }`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'noDestructure' }],
      output: `import { merge, omit } from "solid-js";\nfunction App(_props) {   const props = merge({ name: 'guest' }, _props);\n  const rest = omit(props, "name");\nreturn <div {...rest}>{props.name}</div> }`,
    },
    {
      code: `function App({ user: { name } }) { return <div>{name}</div> }`,
      errors: [{ messageId: 'noDestructure' }],
    },
  ],
})
