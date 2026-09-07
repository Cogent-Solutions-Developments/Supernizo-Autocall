'use client';

import { useState } from 'react';
import { z } from 'zod';

import {
  AccessManagementSchema,
  AccessUserSchema,
  type AccessManagement as AccessManagementData,
  type AccessUser,
} from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

import { updateEventAssignment } from './access-management-state';

const AccessManagementResponseSchema = z.object({ data: AccessManagementSchema });
const AccessUserResponseSchema = z.object({ data: AccessUserSchema });
const ErrorResponseSchema = z.object({ error: z.object({ message: z.string() }) });

type MutationState = Readonly<{
  error: string | null;
  saving: boolean;
  success: string | null;
}>;

const initialMutationState: MutationState = { error: null, saving: false, success: null };

async function readUserResponse(response: Response): Promise<AccessUser> {
  const body: unknown = await response.json();
  const parsedUser = AccessUserResponseSchema.safeParse(body);
  if (parsedUser.success) return parsedUser.data.data;

  const parsedError = ErrorResponseSchema.safeParse(body);
  throw new Error(parsedError.success ? parsedError.data.error.message : 'The request failed.');
}

async function readAccessManagementResponse(response: Response): Promise<AccessManagementData> {
  const body: unknown = await response.json();
  const parsedAccess = AccessManagementResponseSchema.safeParse(body);
  if (parsedAccess.success) return parsedAccess.data.data;

  const parsedError = ErrorResponseSchema.safeParse(body);
  throw new Error(parsedError.success ? parsedError.data.error.message : 'The request failed.');
}

function availableAgents(users: readonly AccessUser[]): AccessUser[] {
  return users.filter(
    (user) =>
      user.source === 'SUPERNIZO' && user.role === 'AGENT' && user.eligibility === 'ELIGIBLE',
  );
}

export function AccessManagement({
  initialAccess,
}: Readonly<{
  initialAccess: AccessManagementData;
}>) {
  const [sites, setSites] = useState(initialAccess.sites);
  const [users, setUsers] = useState(initialAccess.users);
  const [agentId, setAgentId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [mutation, setMutation] = useState<MutationState>(initialMutationState);
  const [refreshing, setRefreshing] = useState(false);
  const agents = availableAgents(users);
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const selectedSite = sites.find((site) => site.id === siteId) ?? null;
  const isAssigned = Boolean(
    selectedAgent && selectedSite && selectedAgent.siteIds.includes(siteId),
  );

  async function refresh(): Promise<void> {
    setRefreshing(true);
    setMutation(initialMutationState);

    try {
      const response = await fetchAppApi('/api/dashboard/access');
      const access = await readAccessManagementResponse(response);
      setSites(access.sites);
      setUsers(access.users);
    } catch (error: unknown) {
      setMutation({
        error:
          error instanceof Error ? error.message : 'The assignment list could not be refreshed.',
        saving: false,
        success: null,
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function saveAssignment(assigned: boolean): Promise<void> {
    if (!selectedAgent || !selectedSite) return;

    setMutation({ error: null, saving: true, success: null });
    const siteIds = updateEventAssignment(selectedAgent.siteIds, selectedSite.id, assigned);

    try {
      const response = await fetchAppApi(`/api/dashboard/access/users/${selectedAgent.id}`, {
        body: JSON.stringify({ siteIds }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const updatedUser = await readUserResponse(response);
      setUsers((current) =>
        current.map((candidate) => (candidate.id === updatedUser.id ? updatedUser : candidate)),
      );
      setMutation({
        error: null,
        saving: false,
        success: assigned ? 'Event assigned.' : 'Event assignment removed.',
      });
    } catch (error: unknown) {
      setMutation({
        error:
          error instanceof Error ? error.message : 'The event assignment could not be updated.',
        saving: false,
        success: null,
      });
    }
  }

  const assignmentsAreAvailable = agents.length > 0 && sites.length > 0;

  return (
    <div className="grid gap-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.16em] text-blue-600 uppercase">
            Administration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Event assignments
          </h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            Assign Supernizo agents to the events they can handle in Autocall.
          </p>
        </div>
        <button
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={refreshing}
          onClick={() => void refresh()}
          type="button"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="border-b border-slate-100 pb-6">
          <h2 className="text-xl font-semibold text-slate-950">Assign an event</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Supernizo manages users, roles and Autocall access. Autocall only stores the event
            assignments below.
          </p>
        </div>

        {assignmentsAreAvailable ? (
          <div className="mt-6 grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor="agent">
                Agent
                <select
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  id="agent"
                  onChange={(event) => {
                    setAgentId(event.currentTarget.value);
                    setMutation(initialMutationState);
                  }}
                  value={agentId}
                >
                  <option value="">Select an agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.displayName ?? agent.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor="event">
                Event
                <select
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  id="event"
                  onChange={(event) => {
                    setSiteId(event.currentTarget.value);
                    setMutation(initialMutationState);
                  }}
                  value={siteId}
                >
                  <option value="">Select an event</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedAgent || !selectedSite || isAssigned || mutation.saving}
                onClick={() => void saveAssignment(true)}
                type="button"
              >
                {mutation.saving ? 'Saving…' : 'Assign event'}
              </button>
              <button
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!selectedAgent || !selectedSite || !isAssigned || mutation.saving}
                onClick={() => void saveAssignment(false)}
                type="button"
              >
                Remove assignment
              </button>
              {selectedAgent && selectedSite ? (
                <span className="text-sm text-slate-600">
                  {isAssigned
                    ? 'This agent is assigned to this event.'
                    : 'This event is not assigned yet.'}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-600">
            {agents.length === 0
              ? 'No eligible Supernizo agents are available. Grant Autocall access in Supernizo, then refresh.'
              : 'No events are available yet. Register an event before creating an assignment.'}
          </p>
        )}

        {mutation.error ? (
          <p className="mt-5 text-sm text-red-700" role="alert">
            {mutation.error}
          </p>
        ) : null}
        {mutation.success ? (
          <p aria-live="polite" className="mt-5 text-sm text-emerald-700">
            {mutation.success}
          </p>
        ) : null}
      </section>
    </div>
  );
}
