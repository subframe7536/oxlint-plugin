import { reactivityRule as rule } from './reactivity.ts'
import { run } from './test-utils.ts'

export const cases = run('reactivity (extras)', rule, {
  valid: [
    // 1.1 queueMicrotask async callback (global & window)
    `const [open, setOpen] = createSignal(false);
    function handleSelect() {
      queueMicrotask(() => {
        if (!open()) setOpen(true);
      });
    }`,
    `const [open, setOpen] = createSignal(false);
    window.queueMicrotask(() => console.log(open()));`,

    // 1.2 Cross-realm window timer methods (e.g. ownerWindow.setTimeout)
    `function Component(props) {
      const currentWindow = ownerWindow();
      if (currentWindow) {
        currentWindow.setTimeout(() => {
          if (untrack(() => props.disabled)) return;
        }, 500);
        currentWindow.setInterval(() => console.log(props.disabled), 1000);
        currentWindow.requestAnimationFrame(() => console.log(props.disabled));
        currentWindow.requestIdleCallback(() => console.log(props.disabled));
        currentWindow.queueMicrotask(() => console.log(props.disabled));
      }
      return <div />;
    }`,

    // 1.3 Solid 2.0 two-arg createRenderEffect(compute, apply)
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

    // 1.4 Plain lowercase helper function with *Props parameter and no JSX
    `function readHostDefaults(hostProps) {
      return {
        closable: hostProps.closable,
        transition: hostProps.transition,
      };
    }`,

    // 1.5 Callable accessor wrapper returned via Object.assign(() => memo(), { ... })
    `import { createMemo } from "solid-js";
    function createReadonlyAtom(fn) {
      const memo = createMemo(fn);
      return Object.assign(() => memo(), {
        get: () => memo(),
      });
    }`,
    `import { createMemo } from "solid-js";
    const createReadonlyAtom = (fn) => {
      const memo = createMemo(fn);
      return Object.assign(() => memo(), {
        get: () => memo(),
      });
    };`,
    `import { createMemo } from "solid-js";
    const createReadonlyAtom = (fn) => {
      const memo = createMemo(fn);
      const make = () => Object.assign(() => memo(), { get: () => memo() });
      return make;
    };`,
  ],
  invalid: [
    // 1.1 queueMicrotask still requires a function, not a direct signal read
    {
      code: `
      const [open] = createSignal(false);
      queueMicrotask(open());`,
      errors: [{ messageId: 'expectedFunctionGotExpression', line: 3 }],
    },

    // 1.2 Cross-realm timer still requires a function, not a direct signal read
    {
      code: `
      const [open] = createSignal(false);
      currentWindow.setTimeout(open(), 100);`,
      errors: [{ messageId: 'expectedFunctionGotExpression', line: 3 }],
    },

    // 1.3 Solid 2.0 createRenderEffect: non-function compute still errors
    {
      code: `
      import { createRenderEffect, createSignal } from "solid-js";
      const [hiddenAttr] = createSignal(false);
      createRenderEffect(hiddenAttr(), (value) => console.log(value));`,
      settings: { solid: { version: 2 } },
      errors: [{ messageId: 'expectedFunctionGotExpression', line: 4 }],
    },

    // 1.4 Lowercase hook (use*/create*) or lowercase function returning JSX still tracks props
    {
      code: `
      function useDialog(dialogProps) {
        const open = dialogProps.open;
        return { open };
      }`,
      errors: [{ messageId: 'untrackedReactive', line: 3 }],
    },
    {
      code: `
      function createDialog(dialogProps) {
        const open = dialogProps.open;
        return { open };
      }`,
      errors: [{ messageId: 'untrackedReactive', line: 3 }],
    },
    {
      code: `
      function renderHost(hostProps) {
        const closable = hostProps.closable;
        return <div>{closable}</div>;
      }`,
      errors: [{ messageId: 'untrackedReactive', line: 3 }],
    },

    // 1.5 Non-returned Object.assign(() => memo(), ...) still reports badUnnamedDerivedSignal
    {
      code: `
      import { createMemo } from "solid-js";
      function createReadonlyAtom(fn) {
        const memo = createMemo(fn);
        Object.assign(() => memo(), { get: () => memo() });
      }`,
      errors: [{ messageId: 'badUnnamedDerivedSignal', line: 5 }],
    },
    // 1.5 Object.assign with derived signal as source (2nd arg) still reports badUnnamedDerivedSignal
    {
      code: `
      import { createMemo } from "solid-js";
      function createReadonlyAtom(fn) {
        const memo = createMemo(fn);
        return Object.assign({}, () => memo());
      }`,
      errors: [{ messageId: 'badUnnamedDerivedSignal', line: 5 }],
    },
  ],
})
