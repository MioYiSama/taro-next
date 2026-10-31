import { start } from "@taro-next/runtime";
import { createSignal, For, Show } from "solid-js";
import { render } from "solid-js/web";

import "./index.css";

/** Deeper than the plugin's `baseLevel`, so the inner part renders through `comp`. */
function Nested(props: { depth: number }) {
  const [taps, setTaps] = createSignal(0);
  return (
    <Show
      when={props.depth > 0}
      fallback={
        <span id="deepest" onClick={() => setTaps(taps() + 1)}>
          Deep node tapped {taps()} times
        </span>
      }
    >
      <div class="nested">
        <Nested depth={props.depth - 1} />
      </div>
    </Show>
  );
}

function App() {
  const [count, setCount] = createSignal(0);
  const [text, setText] = createSignal("");
  const [todos, setTodos] = createSignal(["Learn taro-next", "Render with solid"]);

  return (
    <div class="app">
      <h1>taro-next</h1>
      <p>
        Count: <strong id="count">{count()}</strong>
      </p>
      <button id="increment" onClick={() => setCount(count() + 1)}>
        Increment
      </button>

      <input
        id="todo-input"
        placeholder="New todo"
        value={text()}
        onInput={(e) => setText(e.currentTarget.value)}
        onConfirm={() => {
          if (!text()) return;
          setTodos([...todos(), text()]);
          setText("");
        }}
      />
      <ul>
        <For each={todos()}>
          {(todo, index) => (
            <li onClick={() => setTodos(todos().filter((_, i) => i !== index()))}>{todo}</li>
          )}
        </For>
      </ul>

      <scroll-view class="scroller" scroll-x>
        <For each={Array.from({ length: 10 }, (_, i) => i)}>
          {(i) => <div class="chip">{i}</div>}
        </For>
      </scroll-view>

      <Nested depth={20} />
    </div>
  );
}

start((window) => {
  render(() => <App />, window.document.body);
});
