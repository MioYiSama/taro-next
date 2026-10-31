// Named like a global the mini program declares as a parameter of the
// function each file runs in.
const location = "own location";

export function greeting() {
  return window === self && window.document === document && location === "own location"
    ? "esm injected"
    : "esm missing";
}
