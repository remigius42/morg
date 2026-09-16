import { describe, expect, it } from "vitest"
import { build, type Rollup } from "vite"
import config from "../../../web/vite.config.js"

/**
 * The worker bundle has to survive having no DOM. A browser build of a
 * transitive dependency that touches `document` at module scope throws on
 * worker startup, and the runner's fallback then quietly converts on the
 * main thread again — the page keeps working, and the freeze this whole
 * feature removes comes back with nothing to show for it.
 *
 * Built through the real config rather than a stand-in: it is the browser
 * resolution `vite build web` applies that picks the offending build in
 * the first place, so anything that resolves differently proves nothing.
 */
describe("conversion worker bundle", () => {
  it("never reaches for the DOM", async () => {
    // the `development` export condition follows NODE_ENV, which vitest
    // sets to "test" — leaving it there resolves dependencies the deploy
    // never sees, and the build under test stops being the built one
    const nodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"
    let built: Rollup.RollupOutput | Rollup.RollupOutput[]
    try {
      built = (await build({
        ...config,
        root: new URL("../../../web/", import.meta.url).pathname,
        configFile: false,
        logLevel: "silent",
        // vitest runs under NODE_ENV=test, and the dev resolution pulls in
        // debug's browser build — which is not what gets deployed
        mode: "production",
        build: { ...config.build, write: false }
      })) as Rollup.RollupOutput | Rollup.RollupOutput[]
    } finally {
      // a real build that throws or runs out its budget would otherwise
      // leave production set for every test this worker runs afterwards,
      // silently changing how their dependencies resolve
      if (nodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = nodeEnv
      }
    }

    const worker = [built]
      .flat()
      .flatMap(result => result.output)
      .find(output => output.fileName.includes("worker"))
    // an unwritten build emits the worker as an asset, a written one as a
    // chunk; either way what matters is the code inside
    expect(worker).toBeDefined()
    const source = worker?.type === "chunk" ? worker.code : worker?.source
    const code =
      typeof source === "string" ? source : new TextDecoder().decode(source)
    expect(code).toContain("addEventListener")
    for (const global of ["document", "window", "localStorage"]) {
      expect(code).not.toContain(`${global}.`)
    }
  }, 60_000)
})
