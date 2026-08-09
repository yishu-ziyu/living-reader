import { createReadingAgentRuntimeHandler } from "./server";
import { ReadingAgentRegistry } from "./reading-agent";

const port = Number(process.env.READING_AGENT_RUNTIME_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("READING_AGENT_RUNTIME_PORT must be a valid TCP port");
}

const registry = new ReadingAgentRegistry();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch: createReadingAgentRuntimeHandler(registry),
});

console.log(`Living Reader Agent runtime listening on ${server.url}`);
