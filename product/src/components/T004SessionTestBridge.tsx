"use client";

/**
 * Test-only bridge for Playwright (T004 ReaderSession).
 * Mounted only when NEXT_PUBLIC_T004_SESSION_BRIDGE === "1".
 */

import { useEffect } from "react";
import { useReaderSession } from "./ReaderSessionProvider";
import type { ReaderSessionEvent, SessionTransitionReceipt } from "@/modules/session";

export type T004BridgeApi = {
  ready: boolean;
  getState: () => string;
  getWorldSlotState: () => string;
  getContext: () => unknown;
  /** Sole mutation API — always safeAttemptTransition; no raw actor (F29). */
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
};

type BridgeWindow = Window & { __T004_SESSION__?: T004BridgeApi };

export function T004SessionTestBridge() {
  const session = useReaderSession();

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_T004_SESSION_BRIDGE !== "1") {
      return;
    }
    const w = window as BridgeWindow;
    w.__T004_SESSION__ = {
      ready: true,
      getState: () => session.state,
      getWorldSlotState: () => session.worldSlotState,
      getContext: () => ({
        experience_id: session.context.experience_id,
        correlation_id: session.context.correlation_id,
        effect_generation: session.context.effect_generation,
        graph_revision: session.context.graph_revision,
        world_id: session.context.world_id,
        world_revision: session.context.world_revision,
        source_snapshot_ready: session.context.source_snapshot_ready,
        relation_reviewed: session.context.relation_reviewed,
        graph_committed: session.context.graph_committed,
        playability_passed: session.context.playability_passed,
      }),
      send: (event) => session.send(event),
    };
    return () => {
      delete w.__T004_SESSION__;
    };
  }, [session]);

  return null;
}
