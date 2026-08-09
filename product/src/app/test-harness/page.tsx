import { notFound } from "next/navigation";
import { ReadingShell } from "@/components/ReadingShell";

export default function TestHarnessPage() {
  if (
    process.env.NEXT_PUBLIC_T003_BRIDGE !== "1" &&
    process.env.NEXT_PUBLIC_T004_SESSION_BRIDGE !== "1" &&
    process.env.NEXT_PUBLIC_T009_AGENT_TURN_BRIDGE !== "1"
  ) {
    notFound();
  }
  return <ReadingShell />;
}
