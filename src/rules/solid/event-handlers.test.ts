import { RuleTester } from 'oxlint/plugins-dev'
import { eventHandlersRule as rule } from './event-handlers.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-event-handlers', rule, {
  valid: [
    // Correct PascalCase event handlers
    { code: `<div onClick={handler} />` },
    { code: `<div onChange={handler} />` },
    { code: `<div onKeyDown={handler} />` },
    { code: `<div onMouseEnter={handler} />` },
    { code: `<div onDblClick={handler} />` },
    // Namespaced event handler (native, should not be checked)
    { code: `<div attr:onclick="handler" />` },
    // Custom component - lowercase on* props are fine
    { code: `<MyComp onclick={handler} />` },
    { code: `<MyComp ondoubleclick={handler} />` },
  ],
  invalid: [
    // Incorrect lowercase on HTML elements - should be capitalized
    {
      code: `<div onclick={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onClick={handler} />`,
    },
    {
      code: `<div onchange={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onChange={handler} />`,
    },
    {
      code: `<div onkeydown={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onKeyDown={handler} />`,
    },
    // Non-standard event name - should be corrected to the standard name
    {
      code: `<div ondoubleclick={handler} />`,
      errors: [{ messageId: 'nonstandard' }],
      output: `<div onDblClick={handler} />`,
    },
    {
      code: `<div onmouseenter={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onMouseEnter={handler} />`,
    },
  ],
})
