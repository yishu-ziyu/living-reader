/**
 * Server-safe host: only mounts T004 client bridge when public env is set.
 */

import { T004SessionTestBridge } from "./T004SessionTestBridge";

export function T004SessionBridgeHost() {
  if (process.env.NEXT_PUBLIC_T004_SESSION_BRIDGE !== "1") {
    return null;
  }
  return <T004SessionTestBridge />;
}
