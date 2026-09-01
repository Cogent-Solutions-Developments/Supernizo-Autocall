import 'server-only';

import type { AgentAvailability } from '@supernizo/shared';

import { getEnvironmentReadiness } from '@/server/env';
import { getRedisClient } from '@/server/redis/client';

export const AGENT_PRESENCE_TTL_SECONDS = 60;

export type AgentPresenceSnapshot = Readonly<{
  availability: AgentAvailability;
  updatedAt: string;
}>;

export interface AgentPresenceRepository {
  get(agentId: string): Promise<AgentPresenceSnapshot | null>;
  set(agentId: string, availability: AgentAvailability): Promise<AgentPresenceSnapshot>;
}

function key(agentId: string): string {
  return `presence:agent:${agentId}`;
}

export class RedisAgentPresenceRepository implements AgentPresenceRepository {
  public async get(agentId: string): Promise<AgentPresenceSnapshot | null> {
    return getRedisClient().get<AgentPresenceSnapshot>(key(agentId));
  }

  public async set(
    agentId: string,
    availability: AgentAvailability,
  ): Promise<AgentPresenceSnapshot> {
    const snapshot = { availability, updatedAt: new Date().toISOString() };
    await getRedisClient().set(key(agentId), snapshot, { ex: AGENT_PRESENCE_TTL_SECONDS });
    return snapshot;
  }
}

type MemoryEntry = Readonly<{ expiresAt: number; snapshot: AgentPresenceSnapshot }>;

export class InMemoryAgentPresenceRepository implements AgentPresenceRepository {
  private readonly entries = new Map<string, MemoryEntry>();

  public async get(agentId: string): Promise<AgentPresenceSnapshot | null> {
    const entry = this.entries.get(key(agentId));
    if (!entry || entry.expiresAt <= Date.now()) {
      this.entries.delete(key(agentId));
      return null;
    }
    return entry.snapshot;
  }

  public async set(
    agentId: string,
    availability: AgentAvailability,
  ): Promise<AgentPresenceSnapshot> {
    const snapshot = { availability, updatedAt: new Date().toISOString() };
    this.entries.set(key(agentId), {
      expiresAt: Date.now() + AGENT_PRESENCE_TTL_SECONDS * 1_000,
      snapshot,
    });
    return snapshot;
  }
}

type PresenceGlobal = typeof globalThis & {
  developmentAgentPresenceRepository?: InMemoryAgentPresenceRepository;
};
const presenceGlobal = globalThis as PresenceGlobal;

export function getAgentPresenceRepository(): AgentPresenceRepository {
  if (process.env.NODE_ENV === 'production' || getEnvironmentReadiness().redis) {
    return new RedisAgentPresenceRepository();
  }
  const repository =
    presenceGlobal.developmentAgentPresenceRepository ?? new InMemoryAgentPresenceRepository();
  presenceGlobal.developmentAgentPresenceRepository = repository;
  return repository;
}
