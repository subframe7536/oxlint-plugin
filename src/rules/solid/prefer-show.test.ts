import { RuleTester } from 'oxlint/plugins-dev'
import { preferShowRule as rule } from './prefer-show.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/prefer-show', rule, {
  valid: [
    { code: `<Show when={cond()}><div/></Show>` },
    { code: `const x = cond() && <div/>` },
  ],
  invalid: [
    {
      code: `<>{cond() && <div/>}</>`,
      errors: [{ messageId: 'preferShowAnd' }],
      output: `<><Show when={cond()}><div/></Show></>`,
    },
    {
      code: `<>{cond() ? <div/> : null}</>`,
      errors: [{ messageId: 'preferShowTernary' }],
      output: `<><Show when={cond()} fallback={null}><div/></Show></>`,
    },
  ],
})
