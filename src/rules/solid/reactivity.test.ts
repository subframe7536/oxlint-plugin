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
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <div>{count()}</div>;
}
      `,
    },
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [count, setCount] = createSignal(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}
      `,
    },
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
    {
      code: `
import { createSignal } from 'solid-js';
function App() {
  const [n] = createSignal(0);
  () => n();
  return <div />;
}
      `,
      errors: [{ messageId: 'badUnnamedDerivedSignal' }],
    },
    {
      code: `
import { createSignal, createMemo } from 'solid-js';
function App() {
  const [count] = createSignal(0);
  const fn = createMemo(() => {
    const doubled = count() * 2;
    const onClick = () => console.log(doubled);
    return onClick;
  });
  return <button onClick={() => fn()()} />;
}
      `,
      errors: [{ messageId: 'staleCapture' }],
    },
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
