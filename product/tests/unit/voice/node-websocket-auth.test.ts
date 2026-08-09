import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

type HeaderWebSocketConstructor = new (
  url: string,
  options: {
    headers: Record<string, string>;
    protocols: string[];
  },
) => WebSocket;

const servers = new Set<ReturnType<typeof createServer>>();

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.clear();
});

describe("Node native WebSocket server authentication", () => {
  it("puts the server-only Authorization sentinel on the actual upgrade request", async () => {
    const server = createServer();
    servers.add(server);
    const observedAuthorization = new Promise<string | undefined>((resolve) => {
      server.once("upgrade", (request, socket) => {
        resolve(request.headers.authorization);
        socket.end(
          "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing port");

    const NodeWebSocket =
      globalThis.WebSocket as unknown as HeaderWebSocketConstructor;
    const socket = new NodeWebSocket(`ws://127.0.0.1:${address.port}`, {
      headers: { Authorization: "Bearer local-test-sentinel" },
      protocols: [],
    });
    socket.addEventListener("error", () => {});

    expect(await observedAuthorization).toBe("Bearer local-test-sentinel");
  });
});
