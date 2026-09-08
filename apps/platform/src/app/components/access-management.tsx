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

import { currentEventAssignments, updateEventAssignment } from './access-management-state';

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

function formatDirectorySync(value: string | null | undefined): string {
  if (!value) return 'Not synced';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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
  const assignmentRecords = currentEventAssignments(users, sites);
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

        <div className="mt-6 grid gap-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700" htmlFor="agent">
              Agent
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={agents.length === 0}
                id="agent"
                onChange={(event) => {
                  setAgentId(event.currentTarget.value);
                  setMutation(initialMutationState);
                }}
                value={agentId}
              >
                <option value="">
                  {agents.length === 0 ? 'No eligible agents available' : 'Select an agent'}
                </option>
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
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={sites.length === 0}
                id="event"
                onChange={(event) => {
                  setSiteId(event.currentTarget.value);
                  setMutation(initialMutationState);
                }}
                value={siteId}
              >
                <option value="">
                  {sites.length === 0 ? 'No events available' : 'Select an event'}
                </option>
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

          {agents.length === 0 ? (
            <p className="text-sm text-amber-700">
              No eligible Supernizo agents are available. Grant Autocall access in Supernizo, then
              refresh.
            </p>
          ) : null}
          {sites.length === 0 ? (
            <p className="text-sm text-amber-700">
              No events are available yet. Register an event before creating an assignment.
            </p>
          ) : null}
        </div>

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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Current event assignments</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Every active assignment stored in Autocall for Supernizo agents.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
            {assignmentRecords.length} {assignmentRecords.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {assignmentRecords.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-600">
            No event assignments have been created yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-5 w-full min-w-[46rem] text-left text-sm">
              <caption className="sr-only">Current Supernizo agent event assignments</caption>
              <thead className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-3" scope="col">
                    Agent
                  </th>
                  <th className="px-3 py-3" scope="col">
                    Event
                  </th>
                  <th className="px-3 py-3" scope="col">
                    Access
                  </th>
                  <th className="px-3 py-3" scope="col">
                    Directory synced
                  </th>
                </tr>
              </thead>
              <tbody>
                {assignmentRecords.map(({ agent, event }) => (
                  <tr
                    className="border-b border-slate-100 last:border-0"
                    key={`${agent.id}-${event.id}`}
                  >
                    <td className="px-3 py-4">
                      <p className="font-semibold text-slate-900">
                        {agent.displayName ?? agent.email}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{agent.email}</p>
                    </td>
                    <td className="px-3 py-4 font-medium text-slate-800">{event.name}</td>
                    <td className="px-3 py-4">
                      <span
                        className={
                          agent.eligibility === 'ELIGIBLE'
                            ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700'
                            : 'rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700'
                        }
                      >
                        {agent.eligibility ?? 'UNKNOWN'}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-slate-600">
                      {formatDirectorySync(agent.lastSyncedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
