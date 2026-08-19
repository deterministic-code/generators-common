export type DefaultArg = string;

export type DefaultRenderer = (arg: string) => string;

export type NativeInfo = {
  to: string;
  defaults: Record<string, DefaultRenderer>;
};
