"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserEventStore } from "@/infrastructure/reader-thinking/browser-store";
import { LIVE_EXPERIENCE_ID } from "@/modules/reader-thinking";
import { projectMemory } from "@/modules/reader-world/memory";

const DEFAULT_READING_PATH = "/read/wealth-of-nations/smith.b1.c1";

function readingPath(sourceLocator: string | null): string {
  const chapterId = /^(smith\.b\d+\.c\d+)(?:\.|$)/u.exec(
    sourceLocator ?? "",
  )?.[1];
  return chapterId
    ? `/read/wealth-of-nations/${chapterId}`
    : DEFAULT_READING_PATH;
}

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let destination = DEFAULT_READING_PATH;
      try {
        const store = await getBrowserEventStore();
        const loaded = await store.load(LIVE_EXPERIENCE_ID);
        if (loaded.ok) {
          const latestPosition = projectMemory(
            LIVE_EXPERIENCE_ID,
            loaded.value,
          ).memories.find((memory) => memory.kind === "read_position");
          destination = readingPath(latestPosition?.source_locator ?? null);
        }
      } catch {
        // IndexedDB can be unavailable; the first canonical chapter remains usable.
      } finally {
        if (!cancelled) router.replace(destination);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="resume-router" data-testid="resume-router">
      <p role="status">正在回到上次阅读位置…</p>
    </main>
  );
}
