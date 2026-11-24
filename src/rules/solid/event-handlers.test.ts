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
    { code: `<div onClick={handler} />` },
    { code: `<div onChange={handler} />` },
    { code: `<div onKeyDown={handler} />` },
    { code: `<div onMouseEnter={handler} />` },
    { code: `<div onDblClick={handler} />` },
    { code: `<div attr:onclick="handler" />` },
    { code: `<MyComp onclick={handler} />` },
    { code: `<MyComp ondoubleclick={handler} />` },
    { code: `<div oncustom={handler} />`, options: [{ ignoreCase: true }] },
    { code: `<div {...{ onClick: handler }} />` },
    { code: `<div onclick="alert(1)" />`, settings: { solid: { version: 2 } } },
  ],
  invalid: [
    {
      code: `<div onclick={handler} />`,
      errors: [{ messageId: 'capitalization' }],
      output: `<div onClick={handler} />`,
    },
    {
      code: `<div oncustom={handler} />`,
      errors: [{ messageId: 'naming' }],
    },
    {
      code: `<div {...{ onClick: handler }} />`,
      options: [{ warnOnSpread: true }],
      errors: [{ messageId: 'spread-handler' }],
      output: `<div  onClick={handler} />`,
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
    {
      code: `<div onClick="handler" />`,
      errors: [{ messageId: 'detected-attr' }],
    },
    {
      code: `<div onClick={123} />`,
      errors: [{ messageId: 'detected-attr' }],
    },
    {
      code: `<div onclick={handler} />`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'lowercase-attribute-v2' }],
      output: `<div onClick={handler} />`,
    },
    {
      code: `<div onDoubleClick={handler} />`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'nonstandard' }],
      output: `<div onDblClick={handler} />`,
    },
    {
      code: `<div onClick="handler" />`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'static-handler-v2' }],
    },
  ],
})
