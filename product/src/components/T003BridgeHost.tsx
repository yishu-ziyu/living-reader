/**
 * Server-safe host: only emits the client bridge when the public env is set
 * at build time. Production builds without NEXT_PUBLIC_T003_BRIDGE never
 * ship the window write surface.
 */

import { T003EventStoreTestBridge } from "./T003EventStoreTestBridge";

export function T003BridgeHost() {
  if (process.env.NEXT_PUBLIC_T003_BRIDGE !== "1") {
    return null;
  }
  return <T003EventStoreTestBridge />;
}
