<script lang="ts">
  import Nested from "./Nested.svelte";

  let count = $state(0);
  let text = $state("");
  let todos = $state(["Learn taro-next", "Render with svelte"]);

  function addTodo() {
    if (!text) return;
    todos.push(text);
    text = "";
  }
</script>

<div class="app">
  <h1>taro-next</h1>
  <p>
    Count: <strong id="count">{count}</strong>
  </p>
  <button id="increment" onclick={() => count++}>Increment</button>

  <input
    id="todo-input"
    placeholder="New todo"
    bind:value={text}
    onkeydown={(e) => e.key === "Enter" && addTodo()}
  />
  <ul>
    {#each todos as todo, index (todo)}
      <li onclick={() => todos.splice(index, 1)}>{todo}</li>
    {/each}
  </ul>

  <scroll-view class="scroller" scroll-x>
    {#each { length: 10 }, i}
      <div class="chip">{i}</div>
    {/each}
  </scroll-view>

  <Nested depth={20} />
</div>
