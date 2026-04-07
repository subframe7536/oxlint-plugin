import { RuleTester } from 'oxlint/plugins-dev'
import { preferShowRule as rule } from './prefer-show.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-prefer-show', rule, {
  valid: [
    // Already using <Show>
    { code: `<Show when={cond()}><div/></Show>` },
    // && outside JSX (assignment/variable) - fine
    { code: `const x = cond() && <div/>` },
    // Non-JSX ternary - fine
    { code: `const x = a ? b : c` },
  ],
  invalid: [
    // && in JSX expression should use <Show>
    {
      code: `<>{cond() && <div/>}</>`,
      errors: [{ messageId: 'preferShowAnd' }],
      output: `<><Show when={cond()}><div/></Show></>`,
    },
    // ternary in JSX expression should use <Show>
    {
      code: `<>{cond() ? <div/> : null}</>`,
      errors: [{ messageId: 'preferShowTernary' }],
      output: `<><Show when={cond()} fallback={null}><div/></Show></>`,
    },
    // ternary with non-null fallback
    {
      code: `<>{cond() ? <A/> : <B/>}</>`,
      errors: [{ messageId: 'preferShowTernary' }],
      output: `<><Show when={cond()} fallback={<B/>}><A/></Show></>`,
    },
    // arrow function with logical expression body inside JSX should be reported
    {
      code: `<>{() => cond() && <div/>}</>`,
      errors: [{ messageId: 'preferShowAnd' }],
      output: `<><Show when={cond()}><div/></Show></>`,
    },
  ],
})
