"use client";

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  VoiceActiveStopper,
  VoiceInputPort,
} from "@/modules/voice";

const VoiceInputContext = createContext<VoiceInputPort | null>(null);

export function VoiceInputProvider({ children }: { children: ReactNode }) {
  const activeStopperRef = useRef<VoiceActiveStopper | null>(null);
  const port = useMemo<VoiceInputPort>(
    () => ({
      registerActiveStopper(stopper) {
        activeStopperRef.current = stopper;
        return () => {
          if (activeStopperRef.current === stopper) {
            activeStopperRef.current = null;
          }
        };
      },
      async stopActive(reason) {
        await activeStopperRef.current?.(reason);
      },
    }),
    [],
  );

  return (
    <VoiceInputContext.Provider value={port}>
      {children}
    </VoiceInputContext.Provider>
  );
}

export function useVoiceInputPort(): VoiceInputPort {
  const port = useContext(VoiceInputContext);
  if (!port) throw new Error("useVoiceInputPort requires VoiceInputProvider");
  return port;
}
