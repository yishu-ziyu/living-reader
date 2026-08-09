"use client";

/**
 * Minimal React binding for T004 ReaderSession.
 * Uses useSyncExternalStore — no @xstate/react dependency.
 * Deep-imports actor factory (not production barrel) so barrel stays sealed (F29).
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createSessionActor,
  getSessionState,
  safeAttemptTransition,
  type SessionActor,
} from "@/modules/session/reader-session.transition";
import {
  worldSlotStateFromSession,
  type ReaderSessionEvent,
  type SessionStateValue,
  type SessionTransitionReceipt,
  type ReaderSessionContext,
} from "@/modules/session";

type SessionStore = {
  /** Internal only — never exposed on useReaderSession (F29). */
  _actor: SessionActor;
  getState: () => SessionStateValue;
  getContext: () => ReaderSessionContext;
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
  subscribe: (onStoreChange: () => void) => () => void;
};

const SessionContext = createContext<SessionStore | null>(null);

function createStore(seed?: {
  experience_id?: string;
  source_snapshot_ids?: string[];
}): SessionStore {
  const actor = createSessionActor(seed);
  const listeners = new Set<() => void>();

  const subscribe = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    const sub = actor.subscribe(() => {
      onStoreChange();
    });
    return () => {
      listeners.delete(onStoreChange);
      sub.unsubscribe();
    };
  };

  return {
    _actor: actor,
    getState: () => getSessionState(actor),
    getContext: () => actor.getSnapshot().context,
    send: (event) => {
      // Sole public mutation path — always safeAttemptTransition (F26/F29)
      const receipt = safeAttemptTransition(actor, event);
      for (const l of listeners) l();
      return receipt;
    },
    subscribe,
  };
}

export function ReaderSessionProvider({
  children,
  experienceId = "exp_live_reader",
  sourceSnapshotIds = [
    "smith.b1.c1.division",
    "smith.b1.c3.market_extent",
  ],
}: {
  children: ReactNode;
  experienceId?: string;
  sourceSnapshotIds?: string[];
}) {
  const [store] = useState(() =>
    createStore({
      experience_id: experienceId,
      source_snapshot_ids: sourceSnapshotIds,
    }),
  );

  return (
    <SessionContext.Provider value={store}>{children}</SessionContext.Provider>
  );
}

/**
 * Production session API. Does not expose raw XState actor (F29).
 * All mutations go through send → safeAttemptTransition.
 */
export function useReaderSession(): {
  state: SessionStateValue;
  context: ReaderSessionContext;
  worldSlotState: "closed" | "loading" | "open";
  send: (event: ReaderSessionEvent) => SessionTransitionReceipt;
} {
  const store = useContext(SessionContext);
  if (!store) {
    throw new Error("useReaderSession requires ReaderSessionProvider");
  }

  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const getCtx = useCallback(() => store.getContext(), [store]);
  const context = useSyncExternalStore(store.subscribe, getCtx, getCtx);

  return useMemo(
    () => ({
      state,
      context,
      worldSlotState: worldSlotStateFromSession(state),
      send: store.send,
    }),
    [state, context, store],
  );
}

/**
 * Client island that mirrors session state onto data attributes for the shell.
 * Production homepage stays closed world until open transitions.
 */
export function SessionShellBindings({
  children,
}: {
  children: ReactNode;
}) {
  const { state, worldSlotState } = useReaderSession();
  return (
    <div
      data-session-state={state}
      data-testid="session-root"
      data-world-slot-state={worldSlotState}
      className="session-shell-bindings"
    >
      {children}
    </div>
  );
}
