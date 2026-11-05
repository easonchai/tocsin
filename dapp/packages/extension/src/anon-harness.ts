// The build points every import of @anon-rpc/browser-harness here (build.mjs). The harness builds
// its isolation iframe from an inline srcdoc script by default, which an extension page's CSP
// blocks; given `iframeUrl` it loads the same boot script from a same-origin page instead. Here
// that is anon-boot.html, a manifest sandbox page: opaque origin, and a CSP that allows the
// harness's blob worker. bootstrapAnonRpc in the shared harness module is used unchanged.
import { AnonRpcWorker as HarnessWorker } from "@anon-rpc/browser-harness";

export * from "@anon-rpc/browser-harness";

type Init = ConstructorParameters<typeof HarnessWorker>[0];

export class AnonRpcWorker extends HarnessWorker {
  constructor(init: Init) {
    // SAFETY: iframeUrl is read by the 0.4.0 host (dist/host.js #boot) but missing from its types.
    super({ ...init, iframeUrl: chrome.runtime.getURL("anon-boot.html") } as Init);
  }
}
