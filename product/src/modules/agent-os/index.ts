/**
 * Agent OS — relation (T005) + BookThought (T006) + boundary/off-topic (T007).
 * No real LLM / voice / network in MVP.
 */
export type AgentOsStatus = "boundary_off_topic_wired";

export const AGENT_OS_STATUS: AgentOsStatus = "boundary_off_topic_wired";

export * from "./relation";
export * from "./companion";
export * from "./guardian";
export * from "./boundary";
export * from "./turn";
export * from "./provider";
export * from "./world-dispatch";
