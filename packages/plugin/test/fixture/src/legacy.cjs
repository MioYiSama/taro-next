module.exports = function legacy() {
  return typeof window === "object" && window.document === document
    ? "cjs injected"
    : "cjs missing";
};
