import "@remix-run/node";

declare module "@remix-run/node" {
  interface AppLoadContext {
    /**
     * Aborts when the client connection closes. Set by server.js; missing in Vite dev.
     *
     * Use it instead of request.signal for long-lived responses. Remix hands
     * loaders copies of the request, and each undici Request follows its
     * parent's signal only through a WeakRef, so once an intermediate copy is
     * garbage collected, request.signal never aborts.
     */
    disconnectSignal?: AbortSignal;
  }
}
