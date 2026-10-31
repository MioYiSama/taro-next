import { start } from "@taro-next/runtime";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";

/** Deeper than the plugin's `baseLevel`, so the inner part renders through `comp`. */
function Nested({ depth }: { depth: number }) {
  const [taps, setTaps] = useState(0);
  return depth === 0 ? (
    <span id="deepest" onClick={() => setTaps(taps + 1)}>
      Deep node tapped {taps} times
    </span>
  ) : (
    <div className="nested">
      <Nested depth={depth - 1} />
    </div>
  );
}

function App() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState("");
  const [todos, setTodos] = useState(["Learn taro-next", "Render with react"]);
  const input = useRef<HTMLInputElement>(null);

  // React only knows DOM events: listen to the mini program's `confirm` itself.
  useEffect(() => {
    const element = input.current!;
    const addTodo = () => {
      if (!text) return;
      setTodos([...todos, text]);
      setText("");
    };
    element.addEventListener("confirm", addTodo);
    return () => element.removeEventListener("confirm", addTodo);
  }, [text, todos]);

  return (
    <div className="app">
      <h1>taro-next</h1>
      <p>
        Count: <strong id="count">{count}</strong>
      </p>
      <button id="increment" onClick={() => setCount(count + 1)}>
        Increment
      </button>

      <input
        ref={input}
        id="todo-input"
        placeholder="New todo"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <ul>
        {todos.map((todo, index) => (
          <li key={todo} onClick={() => setTodos(todos.filter((_, i) => i !== index))}>
            {todo}
          </li>
        ))}
      </ul>

      <scroll-view className="scroller" scroll-x>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="chip">
            {i}
          </div>
        ))}
      </scroll-view>

      <Nested depth={20} />
    </div>
  );
}

start((window) => {
  createRoot(window.document.body).render(<App />);
});
