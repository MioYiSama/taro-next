import type { MutationRecord } from "./mutation-observer";
import type { Node } from "./node";

type MutationHook = (record: Partial<MutationRecord> & { type: string; target: Node }) => void;

export let mutationHook: MutationHook | null = null;

export function setMutationHook(hook: MutationHook | null): void {
  mutationHook = hook;
}
