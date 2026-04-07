import { RuleTester } from 'oxlint/plugins-dev'
import { preferForRule as rule } from './prefer-for.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-prefer-for', rule, {
  valid: [
    // Already using <For>
    { code: `<For each={items()}>{item => <div>{item}</div>}</For>` },
    // .map outside of JSX - fine (not reactive context)
    { code: `const els = items.map(item => item * 2)` },
    // .map result assigned to variable - fine
    { code: `const mapped = list.map(x => x.name)` },
  ],
  invalid: [
    // .map inside JSX fragment
    {
      code: `<>{items().map(item => <div>{item}</div>)}</>`,
      errors: [{ messageId: 'preferFor' }],
      output: `<><For each={items()}>{item => <div>{item}</div>}</For></>`,
    },
    // .map as a JSX expression child
    {
      code: `<div>{list().map(x => <span key={x.id}>{x.name}</span>)}</div>`,
      errors: [{ messageId: 'preferFor' }],
      output: `<div><For each={list()}>{x => <span key={x.id}>{x.name}</span>}</For></div>`,
    },
    // .map with two params should suggest using Index or For/Index combos
    {
      code: `<>{items().map((item, i) => <div>{i}: {item}</div>)}</>`,
      errors: [{ messageId: 'preferForOrIndex' }],
    },
  ],
})
