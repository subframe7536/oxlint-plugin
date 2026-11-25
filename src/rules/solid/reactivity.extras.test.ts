import { reactivityRule as rule } from './reactivity.ts'
import { run } from './test-utils.ts'

export const cases = run('reactivity (extras)', rule, {
  valid: [
    // Cross-realm window timer methods (e.g. ownerWindow.setTimeout)
    `function Component(props) {
      const currentWindow = ownerWindow();
      if (currentWindow) {
        currentWindow.setTimeout(() => console.log(props.disabled), 500);
        currentWindow.setInterval(() => console.log(props.disabled), 1000);
        currentWindow.requestAnimationFrame(() => console.log(props.disabled));
        currentWindow.requestIdleCallback(() => console.log(props.disabled));
      }
      return <div />;
    }`,

    // Solid 2.0 two-arg createRenderEffect(compute, apply)
    {
      code: `
      import { createRenderEffect, createSignal } from "solid-js";
      const [hiddenAttr] = createSignal(false);
      const [other] = createSignal(1);
      createRenderEffect(
        () => hiddenAttr(),
        (value) => {
          console.log(value, other());
        },
      );`,
      settings: { solid: { version: 2 } },
    },
  ],
  invalid: [
    // Cross-realm timer still requires a function, not a direct signal read
    {
      code: `
      const [open] = createSignal(false);
      currentWindow.setTimeout(open(), 100);`,
      errors: [{ messageId: 'expectedFunctionGotExpression', line: 3 }],
    },

    // Solid 2.0 createRenderEffect: non-function compute still errors
    {
      code: `
      import { createRenderEffect, createSignal } from "solid-js";
      const [hiddenAttr] = createSignal(false);
      createRenderEffect(hiddenAttr(), (value) => console.log(value));`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'expectedFunctionGotExpression', line: 4 }],
    },
  ],
})
