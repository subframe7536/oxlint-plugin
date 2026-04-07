import { RuleTester } from 'oxlint/plugins-dev'
import { reactivityRule as rule } from './reactivity.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    sourceType: 'module',
    parserOptions: { lang: 'tsx' },
  },
})

ruleTester.run('solid-reactivity', rule, {
  valid: [
    // Signal called correctly in JSX
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
    },
    // Signal used in event handler (reactive context via callback)
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
      `,
    },
    // createMemo is a tracked reactive scope
    {
      code: `
import { createSignal, createMemo } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  const doubled = createMemo(() => n() * 2);
  return <div>{doubled()}</div>;
}
      `,
    },
    // createEffect is a tracked reactive scope
    {
      code: `
import { createSignal, createEffect } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  createEffect(() => {
    console.log(count());
  });
  return <div/>;
}
      `,
    },
    // Custom reactive function listed in options should be treated as a tracked scope
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  const fn = myCustom(() => n());
  return fn;
}
      `,
      options: [{ customReactiveFunctions: ['myCustom'] }],
    },
    // Object getters that read reactive values are valid (e.g. context value objects)
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [error] = createSignal('required');
  const [name] = createSignal('field-name');
  const fieldContextValue = {
    get error() {
      return error();
    },
    get name() {
      return name();
    },
  };
  return fieldContextValue;
}
      `,
    },
    // Object function properties that read reactive values are valid
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [disabled] = createSignal(false);
  const [startIntersection] = createSignal<HTMLElement | null>(null);
  const api = {
    startIntersectionVisible: () => !disabled() && startIntersection() !== null,
  };
  return api;
}
      `,
    },
    // Event-like callbacks stored in objects should be valid
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [kind] = createSignal('increment');
  const onControlClick = (nextKind: string) => nextKind;
  const handlers = {
    onClick: (event: MouseEvent) => onControlClick(kind()),
    onPointerDown: (event: PointerEvent) => onControlClick(kind()),
  };
  return handlers;
}
      `,
    },
    // Named callbacks in objects are valid even when reading reactivity
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [value] = createSignal('');
  const createTag = (next?: string) => Boolean(next ?? value());
  const actions = {
    create: (next?: string): boolean => createTag(next),
    close: () => value(),
  };
  return actions;
}
      `,
    },
  ],
  invalid: [
    // Reactive variable or props written to directly
    {
      code: `
import { createSignal } from 'solid-js';
function App(props) {
  props.foo = 1;
  return <div/>
}
      `,
      errors: [{ messageId: 'noWrite' }],
    },
    // Reactive value called outside of a tracked scope
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  const value = count();
  return <div>{value}</div>;
}
      `,
      errors: [{ messageId: 'untrackedReactive' }],
    },
    // Expression used where a function wrapper is expected (e.g., DOM event)
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  return <button onClick={count()}>Click</button>;
}
      `,
      errors: [{ messageId: 'expectedFunctionGotExpression' }],
    },
    // Function contains reactivity but isn't passed to a tracked scope
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  return () => n();
}
      `,
      errors: [{ messageId: 'badUnnamedDerivedSignal' }],
    },
    // Without configuring customReactiveFunctions, custom wrappers aren't treated as tracked
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  const fn = myCustom(() => n());
  return fn;
}
      `,
      errors: [{ messageId: 'badUnnamedDerivedSignal' }],
    },
    // Signal used as value instead of being called
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  return <div>{count}</div>;
}
      `,
      errors: [{ messageId: 'badSignal' }],
    },
    // createSignal used without array destructuring
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const count = createSignal(0);
  return <div/>
}
      `,
      errors: [{ messageId: 'shouldDestructure' }],
    },
    // createMemo called without assigning its result
    {
      code: `
import { createMemo } from 'solid-js';
function App() {
  createMemo(() => 1 + 1);
  return <div/>
}
      `,
      errors: [{ messageId: 'shouldAssign' }],
    },
    // Async function passed into a tracked scope
    {
      code: `
import { createEffect } from 'solid-js';
createEffect(async () => {
  await Promise.resolve();
});
      `,
      errors: [{ messageId: 'noAsyncTrackedScope' }],
    },
  ],
})
