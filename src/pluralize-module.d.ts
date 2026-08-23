declare module "pluralize" {
  const pluralize: {
    (word: string, count?: number, inclusive?: boolean): string;
    plural: (word: string) => string;
    singular: (word: string) => string;
    isPlural: (word: string) => boolean;
    isSingular: (word: string) => boolean;
  };
  export default pluralize;
}
