declare module "mustache" {
  const Mustache: {
    render: (
      template: string,
      view: Record<string, unknown>,
      partials?: unknown,
      options?: { escape?: (value: unknown) => string },
    ) => string;
  };
  export default Mustache;
}
