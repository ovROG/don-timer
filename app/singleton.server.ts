// Vite dev re-evaluates server modules on change. Long-lived resources (sockets,
// intervals, connection registries) must survive that instead of being duplicated.
export const singleton = <T>(name: string, create: () => T): T => {
  const store = globalThis as typeof globalThis & {
    __singletons?: Map<string, unknown>;
  };
  store.__singletons ??= new Map();
  if (!store.__singletons.has(name)) store.__singletons.set(name, create());
  return store.__singletons.get(name) as T;
};
