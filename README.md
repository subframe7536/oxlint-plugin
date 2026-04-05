# @subf/oxlint-plugin

Custom oxlint plugin for subframe7536.

## Setup

```ts
// oxlint.config.ts
import { defineConfig } from 'oxlint'
import { solidConfig } from '@subf/oxlint-plugin/config'

export default defineConfig({
  extends: [solidConfig],
  rules: {
    'subf/method-signature-style': 'warn',
    // ... other rules
  },
})
```

## TypeScript Rules

| Name                     | Description                                                                                                   | Fixable |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `method-signature-style` | Enforce type's method signature style to be consistent. Port from `@typescript-eslint/method-signature-style` | ✅       |

## Solid Rules

Port of [`eslint-plugin-solid`](https://github.com/solidjs-community/eslint-plugin-solid) rules.

Rules excluded from the port: `no-array-handlers`, `no-proxy-apis`, `no-react-deps`, `no-react-specific-props`, `no-unknown-namespaces`, `prefer-classlist`, `style-prop`.

| Name                           | Description                                                                                       | Fixable |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ------- |
| `solid-components-return-once` | Disallow early returns in components. Conditionals should be inside JSX.                          | ✅       |
| `solid-event-handlers`         | Enforce naming DOM element event handlers consistently (e.g. `onClick` not `onclick`).            | ✅       |
| `solid-imports`                | Enforce consistent imports from `"solid-js"`, `"solid-js/web"`, and `"solid-js/store"`.           | ✅       |
| `solid-jsx-no-duplicate-props` | Disallow passing the same prop twice in JSX.                                                      |         |
| `solid-jsx-no-script-url`      | Disallow `javascript:` URLs.                                                                      |         |
| `solid-jsx-no-undef`           | Disallow references to undefined variables in JSX. Handles custom directives.                     | ✅       |
| `solid-jsx-uses-vars`          | Prevent variables used in JSX from being marked as unused.                                        |         |
| `solid-no-destructure`         | Disallow destructuring props — use `props.x` instead to preserve reactivity.                      | ✅       |
| `solid-no-innerhtml`           | Disallow usage of the `innerHTML` attribute to prevent XSS vulnerabilities.                       | ✅       |
| `solid-prefer-for`             | Enforce using Solid's `<For />` component for mapping an array to JSX elements.                   | ✅       |
| `solid-prefer-show`            | Enforce using Solid's `<Show />` component for conditionally showing content.                     | ✅       |
| `solid-reactivity`             | Enforce that reactivity (props, signals, memos) is properly used so the view updates as expected. |         |
| `solid-self-closing-comp`      | Disallow extra closing tags for components without children.                                      | ✅       |

## Note

`method-signature-style` will be a built-in rule in `oxlint` in the future, so it is recommended to use `@subf/oxlint-plugin` as a temporary solution.
