import { render } from "preact";
import { useState } from "preact/hooks";

import "./index.css";

/** Deeper than the plugin's `baseLevel`, so the inner part renders through `comp`. */
function Nested({ depth }: { depth: number }) {
  const [taps, setTaps] = useState(0);
  return depth === 0 ? (
    <span id="deepest" onClick={() => setTaps(taps + 1)}>
      Deep node tapped {taps} times
    </span>
  ) : (
    <div class="nested">
      <Nested depth={depth - 1} />
    </div>
  );
}

function App() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  const [todos, setTodos] = useState(["Learn taro-next", "Render with preact"]);

  const addTodo = () => {
    if (!text) return;
    setTodos([...todos, text]);
    setText("");
  };

  return (
    <div class="app">
      <h1>taro-next</h1>
      <p>
        Count: <strong id="count">{count}</strong>
      </p>
      <button id="increment" onClick={() => setCount(count + 1)}>
        Increment
      </button>

      <input
        id="todo-input"
        placeholder="New todo"
        value={text}
        onInput={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addTodo();
        }}
      />
      <ul>
        {todos.map((todo, index) => (
          <li key={todo} onClick={() => setTodos(todos.filter((_, i) => i !== index))}>
            {todo}
          </li>
        ))}
      </ul>

      <scroll-view class="scroller" scroll-x>
        {Array.from({ length: 10 }, (_, i) => (
          <div class="chip">{i}</div>
        ))}
      </scroll-view>

      <Nested depth={20} />
    </div>
  );
}

render(<App />, document.body);
