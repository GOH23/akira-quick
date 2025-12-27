declare module 'markdown-it' {
  interface MarkdownIt {
    render(src: string): string;
  }
  const MarkdownIt: {
    new (options?: any): MarkdownIt;
  };
  export default MarkdownIt;
}
