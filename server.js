// Production server: the same setup as remix-serve, plus a load context signal
// that aborts when the client disconnects (see app/load-context.d.ts).
import { createRequestHandler } from "@remix-run/express";
import { installGlobals } from "@remix-run/node";
import compression from "compression";
import express from "express";
import morgan from "morgan";

const build = await import("./build/server/index.js");
installGlobals({ nativeFetch: build.future.v3_singleFetch });

const app = express();
app.disable("x-powered-by");
// Skips responses marked Cache-Control: no-transform, like the timer event streams.
app.use(compression());
app.use(
  build.publicPath,
  express.static(build.assetsBuildDirectory, { immutable: true, maxAge: "1y" })
);
app.use(express.static("public", { maxAge: "1h" }));
app.use(morgan("tiny"));

app.all(
  "*",
  createRequestHandler({
    build,
    getLoadContext: (_req, res) => {
      const controller = new AbortController();
      res.on("close", () => controller.abort());
      return { disconnectSignal: controller.signal };
    },
  })
);

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST;
const onListen = () =>
  console.log(`Server listening on http://${host ?? "localhost"}:${port}`);
const server = host
  ? app.listen(port, host, onListen)
  : app.listen(port, onListen);

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => server.close(console.error));
}
