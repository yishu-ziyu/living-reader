import type { SessionEffectRequest } from "./reader-session.types";

/**
 * Port for side-effect adapters (voice, world prepare).
 * Machine only emits SessionEffectRequest; adapters call back with machine events.
 * Tests use FakeSessionEffectPort — never touches IndexedDB/network/mic/Kernel.
 */
export interface SessionEffectPort {
  request(effect: SessionEffectRequest): void;
  cancelGeneration(generation: number): void;
}

export class FakeSessionEffectPort implements SessionEffectPort {
  readonly requests: SessionEffectRequest[] = [];
  readonly cancelled: number[] = [];

  request(effect: SessionEffectRequest): void {
    this.requests.push(effect);
  }

  cancelGeneration(generation: number): void {
    this.cancelled.push(generation);
  }

  clear(): void {
    this.requests.length = 0;
    this.cancelled.length = 0;
  }
}
