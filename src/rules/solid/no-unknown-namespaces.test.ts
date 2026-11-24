import { RuleTester } from 'oxlint/plugins-dev'
import { noUnknownNamespacesRule as rule } from './no-unknown-namespaces.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-unknown-namespaces', rule, {
  valid: [
    { code: 'const el = <div on:click={fn} />;' },
    { code: 'const el = <div prop:value={x} />;' },
    { code: 'const el = <svg xmlns:xlink="http://www.w3.org/1999/xlink" />;' },
    {
      code: 'const el = <div custom:foo="bar" />;',
      options: [{ allowedNamespaces: ['custom'] }],
    },
    {
      code: 'const el = <div prop:value={x} custom:foo="bar" />;',
      settings: { solid: { version: 2 } },
    },
  ],
  invalid: [
    {
      code: 'const el = <div foo:bar="baz" />;',
      errors: [{ messageId: 'unknown' }],
    },
    {
      code: 'const el = <div style:color="red" />;',
      errors: [{ messageId: 'style' }],
    },
    {
      code: 'const el = <MyComp on:click={fn} />;',
      errors: [
        {
          messageId: 'component',
          suggestions: [
            { messageId: 'component-suggest', output: 'const el = <MyComp click={fn} />;' },
          ],
        },
      ],
    },
    {
      code: 'const el = <div use:tooltip={opts} />;',
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'v2Namespace' }],
    },
    {
      code: 'const el = <div on:click={fn} />;',
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'v2Namespace' }],
    },
  ],
})
