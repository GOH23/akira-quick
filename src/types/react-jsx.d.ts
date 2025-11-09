// Provide a minimal JSX namespace so third-party libraries that reference JSX.IntrinsicElements
// type check correctly even when @types/react isn't available at compile time.
// This avoids "Cannot find namespace 'JSX'" errors from packages like react-markdown
// during production builds where devDependencies may not be installed.
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
