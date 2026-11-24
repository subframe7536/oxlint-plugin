import { RuleTester } from 'oxlint/plugins-dev'
import { noReactSpecificPropsRule as rule } from './no-react-specific-props.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-no-react-specific-props', rule, {
  valid: [
    { code: 'const el = <div class="foo" />;' },
    { code: 'const el = <label for="bar" />;' },
    { code: 'const el = <MyComponent key={item.id} />;' },
  ],
  invalid: [
    {
      code: 'const el = <div className="foo" />;',
      output: 'const el = <div class="foo" />;',
      errors: [{ messageId: 'prefer' }],
    },
    {
      code: 'const el = <label htmlFor="bar" />;',
      output: 'const el = <label for="bar" />;',
      errors: [{ messageId: 'prefer' }],
    },
    {
      code: 'const el = <div class="a" className="b" />;',
      errors: [{ messageId: 'prefer' }],
    },
    {
      code: 'const el = <div key={item.id} />;',
      output: 'const el = <div  />;',
      errors: [{ messageId: 'noUselessKey' }],
    },
  ],
})
