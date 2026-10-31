<script setup lang="ts">
import { ref } from "vue";

import Nested from "./Nested.vue";

const count = ref(0);
const text = ref("");
const todos = ref(["Learn taro-next", "Render with vue"]);

function addTodo() {
  if (!text.value) return;
  todos.value.push(text.value);
  text.value = "";
}
</script>

<template>
  <div class="app">
    <h1>taro-next</h1>
    <p>
      Count: <strong id="count">{{ count }}</strong>
    </p>
    <button id="increment" @click="count++">Increment</button>

    <input id="todo-input" v-model="text" placeholder="New todo" @confirm="addTodo" />
    <ul>
      <li v-for="(todo, index) in todos" :key="todo" @click="todos.splice(index, 1)">
        {{ todo }}
      </li>
    </ul>

    <scroll-view class="scroller" scroll-x>
      <div v-for="i in 10" :key="i" class="chip">{{ i - 1 }}</div>
    </scroll-view>

    <Nested :depth="20" />
  </div>
</template>
