import { RuleTester } from 'oxlint/plugins-dev'
import { jsxUsesVarsRule as rule } from './jsx-uses-vars.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid/jsx-uses-vars', rule, {
  valid: [
    { code: `import MyComp from './MyComp'; function App() { return <MyComp /> }` },
  ],
  invalid: [],
})
