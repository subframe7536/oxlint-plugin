# @subf/oxlint-plugin

Custom oxlint plugin for TypeScript and SolidJS.

## Setup

```ts
// oxlint.config.ts
import { defineConfig } from 'oxlint'
import { solidConfig, solidV2Config, solidV2StrictConfig } from '@subf/oxlint-plugin/config'

export default defineConfig({
  // Use `solidConfig` for Solid 1.x / dual-version, or `solidV2Config` / `solidV2StrictConfig` for Solid 2.0
  extends: [solidV2Config],
  rules: {
    'subf/method-signature-style': 'warn',
    'subf/no-negated-conjunction': 'warn',
    'subf/no-negated-disjunction': 'warn',
    // ... other rules
  },
})
```

## TypeScript Rules

| Name                     | Description                                                                                                   | Fixable |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ------- |
| `method-signature-style` | Enforce type's method signature style to be consistent. Port from `@typescript-eslint/method-signature-style` | ✅      |

## De Morgan Rules

Port of [`eslint-plugin-de-morgan`](https://github.com/azat-io/eslint-plugin-de-morgan) rules.

| Name                     | Description                                                           | Fixable |
| ------------------------ | --------------------------------------------------------------------- | ------- |
| `no-negated-conjunction` | Transform the negation of a conjunction according to De Morgan's law. | ✅      |
| `no-negated-disjunction` | Transform the negation of a disjunction according to De Morgan's law. | ✅      |

## Antfu Rules

Port of [`eslint-plugin-antfu`](https://github.com/antfu/eslint-plugin-antfu) rules.

| Name                 | Description                                                           | Fixable |
| -------------------- | --------------------------------------------------------------------- | ------- |
| `top-level-function` | Enforce top-level functions to use the `function` declaration syntax. | ✅      |

## Solid Rules

Port of [`solidjs/eslint-plugin-solid`](https://github.com/solidjs/eslint-plugin-solid) (`v0.20.1`) rules, including full Solid 2.0 support.

Rules excluded from the port: `no-array-handlers`, `no-proxy-apis`, `no-react-deps`, `prefer-classlist`, `style-prop`.

| Name                                         | Description                                                                                                    | Fixable |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| `solid-action-yield-after-await`             | Require a bare `yield` after each `await` inside async generator `action()` functions.                         | ✅      |
| `solid-components-return-once`               | Disallow early returns in components. Conditionals should be inside JSX.                                       | ✅      |
| `solid-event-handlers`                       | Enforce naming DOM element event handlers consistently (e.g. `onClick` not `onclick`).                         | ✅      |
| `solid-imports`                              | Enforce consistent imports from `"solid-js"`, `"solid-js/web"`, `"solid-js/store"`, and `"@solidjs/web"`.      | ✅      |
| `solid-jsx-no-duplicate-props`               | Disallow passing the same prop twice in JSX.                                                                   |         |
| `solid-jsx-no-script-url`                    | Disallow `javascript:` URLs.                                                                                   |         |
| `solid-jsx-no-undef`                         | Disallow references to undefined variables in JSX. Handles custom directives.                                  | ✅      |
| `solid-jsx-uses-vars`                        | Prevent variables used in JSX from being marked as unused.                                                     |         |
| `solid-no-accessor-as-prop`                  | Disallow passing uncalled signal/memo accessors as value-typed DOM attributes.                                 |         |
| `solid-no-boolean-enumerated-attribute`      | Disallow boolean values on enumerated HTML/ARIA attributes that expect string tokens.                          | ✅      |
| `solid-no-browser-globals-in-server-function`| Disallow browser-only globals (`window`, `document`, `localStorage`, etc.) inside `"use server"` functions.    |         |
| `solid-no-destructure`                       | Disallow destructuring props — use `props.x` instead to preserve reactivity.                                   | ✅      |
| `solid-no-innerhtml`                         | Disallow usage of the `innerHTML` attribute to prevent XSS vulnerabilities.                                    | ✅      |
| `solid-no-invalid-server-capture`            | Disallow capturing enclosing non-module variables inside `"use server"` functions.                             |         |
| `solid-no-module-scope-reactive-primitive`   | Disallow module-scope reactive primitives outside `createRoot` to prevent cross-request SSR state leaks.       |         |
| `solid-no-react-specific-props`              | Disallow React-specific `className`, `htmlFor`, and DOM `key` props.                                           | ✅      |
| `solid-no-restated-default-options`          | Disallow restating default prop values such as `<For keyed={true}>` and `<Show keyed={false}>`.                | ✅      |
| `solid-no-single-arg-create-effect`          | Require the two-argument `createEffect(compute, effect)` form in Solid 2.0.                                    |         |
| `solid-no-store-mutation-outside-setter`     | Disallow mutating a Solid store read proxy outside its setter callback.                                        |         |
| `solid-no-unassigned-vars`                   | Disallow variables that are read before assignment, while recognizing Solid `ref={el}` assignments.            |         |
| `solid-no-unknown-namespaces`                | Enforce valid Solid JSX attribute namespaces and flag removed 1.x prefixes in Solid 2.0.                       |         |
| `solid-no-unused-signal`                     | Disallow signals/stores that are never read or never written.                                                  |         |
| `solid-no-write-in-pure-computation`         | Disallow writing to reactive state inside `createMemo`, effect compute halves, or component bodies.            |         |
| `solid-prefer-for`                           | Enforce using Solid's `<For />` component for mapping an array to JSX elements.                                | ✅      |
| `solid-prefer-onSettled-for-side-effects`    | Prefer `onSettled` for side-effectful setup (timers, listeners, observers) in component bodies.                |         |
| `solid-prefer-show`                          | Enforce using Solid's `<Show />` component for conditionally showing content.                                  | ✅      |
| `solid-prefer-structured-class`              | Prefer Solid 2.0 array/object `class` values over manually concatenated class strings.                         |         |
| `solid-reactivity`                           | Enforce that reactivity (props, signals, memos) is properly used so the view updates as expected.              |         |
| `solid-removed-api`                          | Report Solid 1.x APIs removed or renamed in Solid 2.0 with autofixes and migration guidance.                   | ✅      |
| `solid-require-async-server-function`        | Require `"use server"` functions to be `async`.                                                                | ✅      |
| `solid-self-closing-comp`                    | Disallow extra closing tags for components without children.                                                   | ✅      |
| `solid-valid-use-server`                     | Validate `"use server"` directive placement, module exports, and client wrapper usage.                         |         |
| `solid-validate-jsx-nesting`                 | Report invalid HTML/SVG/MathML JSX element nesting that the HTML parser restructures.                          |         |

## Note

`method-signature-style` will be a built-in rule in `oxlint` in the future, so it is recommended to use `@subf/oxlint-plugin` as a temporary solution.
