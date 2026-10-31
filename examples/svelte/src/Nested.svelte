<script lang="ts">
  /** Deeper than the plugin's `baseLevel`, so the inner part renders through `comp`. */
  import Nested from "./Nested.svelte";

  let { depth }: { depth: number } = $props();
  let taps = $state(0);
</script>

{#if depth === 0}
  <span id="deepest" onclick={() => taps++}>Deep node tapped {taps} times</span>
{:else}
  <div class="nested">
    <Nested depth={depth - 1} />
  </div>
{/if}
