import "@testing-library/jest-dom";

// jsdom doesn't compute layout, so clientHeight/scrollHeight are 0 for unstyled elements.
// @tanstack/react-virtual needs these to render virtual items. Provide default values.
Object.defineProperty(HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return 600;
  },
});

Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get() {
    return 2000;
  },
});
