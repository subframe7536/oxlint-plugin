import { RuleTester } from 'oxlint/plugins-dev'
import { componentsReturnOnceRule as rule } from './components-return-once.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-components-return-once', rule, {
  valid: [
    // Single return with JSX
    {
      code: `
function App() {
  return <div>Hello</div>;
}
      `,
    },
    // Using Solid's Show for conditional rendering
    {
      code: `
function App() {
  return <Show when={cond}><div/></Show>;
}
      `,
    },
    // Using Solid's Switch/Match
    {
      code: `
function App(props) {
  return (
    <Switch>
      <Match when={props.a}><A /></Match>
      <Match when={props.b}><B /></Match>
    </Switch>
  );
}
      `,
    },
    // Arrow function component - single return
    {
      code: `const App = () => <div>hello</div>`,
    },
    // Non-component function with early returns is fine
    {
      code: `
function helper(x) {
  if (!x) return null;
  return x + 1;
}
      `,
    },
    // Component returning nothing (null/undefined) once
    {
      code: `
function App() {
  return null;
}
      `,
    },
  ],
  invalid: [
    // Early return in component
    {
      code: `
function App(props) {
  if (props.x) return null;
  return <div/>;
}
      `,
      errors: [{ messageId: 'noEarlyReturn' }],
    },
    // Multiple conditional returns
    {
      code: `
function Comp(props) {
  if (props.loading) return <p>Loading...</p>;
  if (props.error) return <p>Error</p>;
  return <div>{props.data}</div>;
}
      `,
      errors: [{ messageId: 'noEarlyReturn' }, { messageId: 'noEarlyReturn' }],
    },
    // Conditional return (ternary/conditional expression) as final return should be reported
    {
      code: `
function App() {
  const ready = true;
  return ready ? <A/> : <B/>;
}
      `,
      errors: [{ messageId: 'noConditionalReturn' }],
      output: `
function App() {
  const ready = true;
  return <>{ready ? <A/> : <B/>}</>;
}
      `,
    },
  ],
})
