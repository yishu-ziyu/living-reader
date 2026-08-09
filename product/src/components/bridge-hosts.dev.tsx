/**
 * E2E / bridge-enabled builds only (T003, T004, or T009 public bridge flag = 1).
 * Production resolves to bridge-hosts.prod via next.config alias — this file is not
 * in the production module graph.
 */

import { T003EventStoreTestBridge } from "./T003EventStoreTestBridge";
import { T004SessionTestBridge } from "./T004SessionTestBridge";
import { T009AgentTurnTestBridge } from "./T009AgentTurnTestBridge";

export function T003BridgeHost() {
  return <T003EventStoreTestBridge />;
}

export function T004SessionBridgeHost() {
  return (
    <>
      <T004SessionTestBridge />
      <T009AgentTurnTestBridge />
    </>
  );
}
