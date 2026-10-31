import { COMMENT_NODE_NAME, TEXT_NODE_NAME } from "../components";
import { enqueueField } from "../update";
import { mutationHook } from "./mutation-hook";
import { COMMENT_NODE, Node, TEXT_NODE } from "./node";

export abstract class CharacterData extends Node {
  /** @internal */ $data = "";

  get data(): string {
    return this.$data;
  }

  set data(value: string) {
    const data = value == null ? "" : String(value);
    if (data === this.$data) return;
    if (mutationHook) mutationHook({ type: "characterData", target: this, oldValue: this.$data });
    this.$data = data;
    if (this.nodeType === TEXT_NODE) enqueueField(this, "v");
  }

  get length(): number {
    return this.$data.length;
  }

  override get nodeValue(): string {
    return this.$data;
  }

  override set nodeValue(value: string | null) {
    this.data = value ?? "";
  }

  override get textContent(): string {
    return this.$data;
  }

  override set textContent(value: string | null) {
    this.data = value ?? "";
  }

  appendData(data: string): void {
    this.data = this.$data + data;
  }

  insertData(offset: number, data: string): void {
    this.data = this.$data.slice(0, offset) + data + this.$data.slice(offset);
  }

  deleteData(offset: number, count: number): void {
    this.data = this.$data.slice(0, offset) + this.$data.slice(offset + count);
  }

  replaceData(offset: number, count: number, data: string): void {
    this.data = this.$data.slice(0, offset) + data + this.$data.slice(offset + count);
  }

  substringData(offset: number, count: number): string {
    return this.$data.slice(offset, offset + count);
  }
}

export class Text extends CharacterData {
  get nodeType(): number {
    return TEXT_NODE;
  }

  get nodeName(): string {
    return "#text";
  }

  get wholeText(): string {
    return this.$data;
  }

  splitText(offset: number): Text {
    const rest = this.$doc().createTextNode(this.$data.slice(offset));
    this.data = this.$data.slice(0, offset);
    this.parentNode?.insertBefore(rest, this.nextSibling);
    return rest;
  }

  $clone(): Text {
    return this.$doc().createTextNode(this.$data);
  }

  $serialize(_inherited?: number): Record<string, unknown> {
    return { nn: TEXT_NODE_NAME, sid: this.sid, v: this.$data };
  }

  $field(): unknown {
    return this.$data;
  }
}

export class Comment extends CharacterData {
  get nodeType(): number {
    return COMMENT_NODE;
  }

  get nodeName(): string {
    return "#comment";
  }

  $clone(): Comment {
    return this.$doc().createComment(this.$data);
  }

  $serialize(_inherited?: number): Record<string, unknown> {
    return { nn: COMMENT_NODE_NAME, sid: this.sid };
  }

  $field(): unknown {
    return undefined;
  }
}
