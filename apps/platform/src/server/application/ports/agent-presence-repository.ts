export interface AgentPresenceRepositorySession {
  countActiveCalls(agentId: string): Promise<number>;
}
export type AgentPresenceRepository = AgentPresenceRepositorySession;
