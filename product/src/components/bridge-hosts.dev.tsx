/**
 * E2E / bridge-enabled builds only (NEXT_PUBLIC_T003_BRIDGE or T004_SESSION_BRIDGE = 1).
 * Production resolves to bridge-hosts.prod via next.config alias — this file is not
 * in the production module graph.
 */

import { T003EventStoreTestBridge } from "./T003EventStoreTestBridge";
import { T004SessionTestBridge } from "./T004SessionTestBridge";

export function T003BridgeHost() {
  return <T003EventStoreTestBridge />;
}

export function T004SessionBridgeHost() {
  return <T004SessionTestBridge />;
}
