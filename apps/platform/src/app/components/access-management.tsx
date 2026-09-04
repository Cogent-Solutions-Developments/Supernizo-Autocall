'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';

import {
  AccessUserSchema,
  type AccessManagement as AccessManagementData,
  type AccessSite,
  type AccessUser,
  type StaffRole,
} from '@supernizo/shared';

import { fetchAppApi } from '@/lib/app-fetch';

const AccessUserResponseSchema = z.object({ data: AccessUserSchema });
const ErrorResponseSchema = z.object({ error: z.object({ message: z.string() }) });

type MutationState = Readonly<{
  error: string | null;
  saving: boolean;
  success: string | null;
}>;

const initialMutationState: MutationState = { error: null, saving: false, success: null };

function toggleSiteId(siteIds: readonly string[], siteId: string, checked: boolean): string[] {
  return checked
    ? Array.from(new Set([...siteIds, siteId])).sort()
    : siteIds.filter((candidate) => candidate !== siteId);
}

async function readUserResponse(response: Response): Promise<AccessUser> {
  const body: unknown = await response.json();
  const parsedUser = AccessUserResponseSchema.safeParse(body);
  if (parsedUser.success) return parsedUser.data.data;

  const parsedError = ErrorResponseSchema.safeParse(body);
  throw new Error(parsedError.success ? parsedError.data.error.message : 'The request failed.');
}

function SiteAssignments({
  onChange,
  selectedSiteIds,
  sites,
}: Readonly<{
  onChange: (siteId: string, checked: boolean) => void;
  selectedSiteIds: readonly string[];
  sites: readonly AccessSite[];
}>) {
  if (sites.length === 0) {
    return <p className="text-sm text-slate-500">Register an event before assigning access.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sites.map((site) => (
        <label
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"
          key={site.id}
        >
          <input
            checked={selectedSiteIds.includes(site.id)}
            className="size-4 accent-blue-600"
            onChange={(event) => onChange(site.id, event.currentTarget.checked)}
            type="checkbox"
          />
          <span className="min-w-0 truncate">{site.name}</span>
        </label>
      ))}
    </div>
  );
}

function UserAccessCard({
  currentUserId,
  onUpdated,
  sites,
  user,
}: Readonly<{
  currentUserId: string;
  onUpdated: (user: AccessUser) => void;
  sites: readonly AccessSite[];
  user: AccessUser;
}>) {
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [role, setRole] = useState<StaffRole>(user.role);
  const [siteIds, setSiteIds] = useState<string[]>(user.siteIds);
  const [mutation, setMutation] = useState<MutationState>(initialMutationState);
  const isCurrentAdministrator = user.id === currentUserId && user.role === 'ADMIN';

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMutation({ error: null, saving: true, success: null });

    try {
      const response = await fetchAppApi(`/api/dashboard/access/users/${user.id}`, {
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          role,
          siteIds: role === 'AGENT' ? siteIds : [],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'PATCH',
      });
      const updatedUser = await readUserResponse(response);
      setDisplayName(updatedUser.displayName ?? '');
      setRole(updatedUser.role);
      setSiteIds(updatedUser.siteIds);
      onUpdated(updatedUser);
      setMutation({ error: null, saving: false, success: 'Access updated.' });
    } catch (error: unknown) {
      setMutation({
        error: error instanceof Error ? error.message : 'The request failed.',
        saving: false,
        success: null,
      });
    }
  }

  return (
    <form
      className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={save}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_11rem]">
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Display name
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            value={displayName}
          />
          <span className="text-xs font-normal text-slate-500">{user.email}</span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Role
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100"
            disabled={isCurrentAdministrator}
            onChange={(event) => setRole(event.currentTarget.value as StaffRole)}
            value={role}
          >
            <option value="AGENT">Agent</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>
      </div>

      {role === 'AGENT' ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold text-slate-800">Assigned events</legend>
          <SiteAssignments
            onChange={(siteId, checked) =>
              setSiteIds((current) => toggleSiteId(current, siteId, checked))
            }
            selectedSiteIds={siteIds}
            sites={sites}
          />
        </fieldset>
      ) : (
        <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Administrators can access every event and all management tools.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={mutation.saving}
          type="submit"
        >
          {mutation.saving ? 'Saving…' : 'Save access'}
        </button>
        {isCurrentAdministrator ? (
          <span className="text-xs text-slate-500">Your own administrator role is protected.</span>
        ) : null}
        {mutation.error ? <span className="text-sm text-red-700">{mutation.error}</span> : null}
        {mutation.success ? (
          <span className="text-sm text-emerald-700">{mutation.success}</span>
        ) : null}
      </div>
    </form>
  );
}

export function AccessManagement({
  currentUserId,
  initialAccess,
}: Readonly<{
  currentUserId: string;
  initialAccess: AccessManagementData;
}>) {
  const [users, setUsers] = useState(initialAccess.users);
  const [newRole, setNewRole] = useState<StaffRole>('AGENT');
  const [newSiteIds, setNewSiteIds] = useState<string[]>([]);
  const [mutation, setMutation] = useState<MutationState>(initialMutationState);

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMutation({ error: null, saving: true, success: null });

    try {
      const response = await fetchAppApi('/api/dashboard/access/users', {
        body: JSON.stringify({
          displayName: String(formData.get('displayName') ?? '').trim() || null,
          email: String(formData.get('email') ?? '').trim(),
          password: String(formData.get('password') ?? ''),
          role: newRole,
          siteIds: newRole === 'AGENT' ? newSiteIds : [],
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      const createdUser = await readUserResponse(response);
      setUsers((current) =>
        [...current, createdUser].sort((left, right) => left.email.localeCompare(right.email)),
      );
      setNewRole('AGENT');
      setNewSiteIds([]);
      form.reset();
      setMutation({ error: null, saving: false, success: 'User created.' });
    } catch (error: unknown) {
      setMutation({
        error: error instanceof Error ? error.message : 'The request failed.',
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
            Manage access
          </h1>
          <p className="mt-2 max-w-2xl leading-7 text-slate-600">
            Administrators have full access. Agents can work only with their assigned events.
          </p>
        </div>
        <Link
          className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          href="/dashboard"
        >
          Back to events
        </Link>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold text-slate-950">Add team member</h2>
        <p className="mt-1 text-sm text-slate-600">
          Create a login and choose which events an agent can access.
        </p>
        <form className="mt-6 grid gap-5" onSubmit={createUser}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Display name
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                name="displayName"
                placeholder="e.g. Event coordinator"
                required
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Email
              <input
                autoComplete="off"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                name="email"
                required
                type="email"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Initial password
              <input
                autoComplete="new-password"
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                minLength={12}
                name="password"
                required
                type="password"
              />
              <span className="text-xs font-normal text-slate-500">At least 12 characters.</span>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Role
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                onChange={(event) => setNewRole(event.currentTarget.value as StaffRole)}
                value={newRole}
              >
                <option value="AGENT">Agent</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
          </div>

          {newRole === 'AGENT' ? (
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-semibold text-slate-800">Assigned events</legend>
              <SiteAssignments
                onChange={(siteId, checked) =>
                  setNewSiteIds((current) => toggleSiteId(current, siteId, checked))
                }
                selectedSiteIds={newSiteIds}
                sites={initialAccess.sites}
              />
            </fieldset>
          ) : (
            <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Administrators automatically receive access to every event.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={mutation.saving}
              type="submit"
            >
              {mutation.saving ? 'Creating…' : 'Create user'}
            </button>
            {mutation.error ? <span className="text-sm text-red-700">{mutation.error}</span> : null}
            {mutation.success ? (
              <span className="text-sm text-emerald-700">{mutation.success}</span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
        <h2 className="text-xl font-semibold text-slate-950">Team access</h2>
        <p className="mt-1 text-sm text-slate-600">
          Update roles and event assignments. Changes apply on the user’s next request.
        </p>
        <div className="mt-6 grid gap-4">
          {users.map((user) => (
            <UserAccessCard
              currentUserId={currentUserId}
              key={user.id}
              onUpdated={(updatedUser) =>
                setUsers((current) =>
                  current.map((candidate) =>
                    candidate.id === updatedUser.id ? updatedUser : candidate,
                  ),
                )
              }
              sites={initialAccess.sites}
              user={user}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
