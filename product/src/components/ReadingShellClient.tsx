"use client";

/**
 * World slot bound to ReaderSession machine snapshot (T004).
 * Initial snapshot → closed/hidden (production homepage).
 */

import { useReaderSession } from "./ReaderSessionProvider";

export function WorldSlotFromSession({ label }: { label: string }) {
  const { worldSlotState, state } = useReaderSession();
  const closed = worldSlotState === "closed";
  return (
    <section
      className="world-slot"
      id="worldSlot"
      data-testid="world-slot"
      data-state={worldSlotState}
      data-session-state={state}
      aria-hidden={closed}
      hidden={closed}
    >
      <p className="world-closed-label">{label}</p>
    </section>
  );
}
