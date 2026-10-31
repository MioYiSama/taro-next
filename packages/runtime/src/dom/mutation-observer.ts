import { setMutationHook } from "./mutation-hook";
import type { Node } from "./node";

export interface MutationRecord {
  type: string;
  target: Node;
  addedNodes: Node[];
  removedNodes: Node[];
  previousSibling: Node | null;
  nextSibling: Node | null;
  attributeName: string | null;
  oldValue: string | null;
}

export interface MutationObserverInit {
  childList?: boolean;
  attributes?: boolean;
  characterData?: boolean;
  subtree?: boolean;
  attributeOldValue?: boolean;
  characterDataOldValue?: boolean;
  attributeFilter?: string[];
}

type Callback = (records: MutationRecord[], observer: MutationObserver) => void;
type Mutation = Partial<MutationRecord> & { type: string; target: Node };

const observers = new Set<MutationObserver>();

function notify(record: Mutation): void {
  for (const observer of observers) {
    let matched = false;
    let oldValue = false;
    for (let node: Node | null = record.target; node; node = node.parentNode) {
      const options = observer.$targets.get(node);
      if (!options || (node !== record.target && !options.subtree)) continue;
      if (record.type === "childList" && options.childList) matched = true;
      else if (
        record.type === "attributes" &&
        options.attributes &&
        (!options.attributeFilter || options.attributeFilter.includes(record.attributeName!))
      ) {
        matched = true;
        oldValue ||= !!options.attributeOldValue;
      } else if (record.type === "characterData" && options.characterData) {
        matched = true;
        oldValue ||= !!options.characterDataOldValue;
      }
    }
    if (!matched) continue;
    observer.$records.push({
      type: record.type,
      target: record.target,
      addedNodes: record.addedNodes ?? [],
      removedNodes: record.removedNodes ?? [],
      previousSibling: record.previousSibling ?? null,
      nextSibling: record.nextSibling ?? null,
      attributeName: record.attributeName ?? null,
      oldValue: oldValue ? (record.oldValue ?? null) : null,
    });
    observer.$schedule();
  }
}

export class MutationObserver {
  /** @internal */ $targets = new Map<Node, MutationObserverInit>();
  /** @internal */ $records: MutationRecord[] = [];
  /** @internal */ $scheduled = false;
  /** @internal */ $callback: Callback;

  constructor(callback: Callback) {
    this.$callback = callback;
  }

  observe(target: Node, options: MutationObserverInit = {}): void {
    const resolved = { ...options };
    if (
      resolved.attributes === undefined &&
      (resolved.attributeOldValue !== undefined || resolved.attributeFilter !== undefined)
    ) {
      resolved.attributes = true;
    }
    if (resolved.characterData === undefined && resolved.characterDataOldValue !== undefined) {
      resolved.characterData = true;
    }
    if (
      (!resolved.childList && !resolved.attributes && !resolved.characterData) ||
      (!resolved.attributes && (resolved.attributeOldValue || resolved.attributeFilter)) ||
      (!resolved.characterData && resolved.characterDataOldValue)
    ) {
      throw new TypeError("MutationObserver.observe: inconsistent mutation options");
    }
    if (resolved.attributeFilter) resolved.attributeFilter = resolved.attributeFilter.slice();
    this.$targets.set(target, resolved);
    observers.add(this);
    setMutationHook(notify);
  }

  disconnect(): void {
    this.$targets.clear();
    this.$records = [];
    observers.delete(this);
    if (!observers.size) setMutationHook(null);
  }

  takeRecords(): MutationRecord[] {
    const records = this.$records;
    this.$records = [];
    return records;
  }

  /** @internal One microtask delivers all pending records for this observer. */
  $schedule(): void {
    if (this.$scheduled) return;
    this.$scheduled = true;
    Promise.resolve()
      .then(() => {
        this.$scheduled = false;
        const records = this.takeRecords();
        if (records.length) this.$callback(records, this);
      })
      .catch((error: unknown) => {
        setTimeout(() => {
          throw error;
        });
      });
  }
}
