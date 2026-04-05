import { RuleTester } from 'oxlint/plugins-dev'
import { eventHandlersRule as rule } from './event-handlers.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/event-handlers', rule, {
  valid: [
    { code: `<div onClick={handler} />` },
    { code: `<div onChange={handler} />` },
    { code: `<div attr:onclick="handler" />` },
    { code: `<MyComp onclick={handler} />` },
  ],
  invalid: [
    {
      code: `<div onclick={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onClick={handler} />`,
    },
    {
      code: `<div ondoubleclick={handler} />`,
      errors: [{ messageId: 'nonstandard' }],
      output: `<div onDblClick={handler} />`,
    },
  ],
})
