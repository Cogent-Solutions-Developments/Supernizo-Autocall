'use client';

import Link from 'next/link';
import { ArrowUpRight, LayoutGrid, List, Search, Plus, Globe } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';

import { SiteSettingsSchema, type SiteSettings } from '@supernizo/shared';

import { CopyPublicKeyButton } from '@/app/components/copy-public-key-button';
import { dashboardHref } from '@/lib/dashboard-navigation';
import { fetchAppApi } from '@/lib/app-fetch';

const SiteResponseSchema = z.object({ data: SiteSettingsSchema });
const ErrorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});

type SiteManagementProps = Readonly<{
  canManage: boolean;
  initialSites: SiteSettings[];
  initialSiteId: string | undefined;
}>;

type SitePayload = Readonly<{
  allowedOrigins: string[];
  audioCallEnabled: boolean;
  chatEnabled: boolean;
  consentMode: string | null;
  eventRetentionDays: number | null;
  name: string;
  trackingEnabled: boolean;
  videoCallEnabled: boolean;
  widgetAvatarUrl: string | null;
  widgetDisplayName: string | null;
  widgetLogoUrl: string | null;
}>;

function valueOrNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function formDataToPayload(formData: FormData): SitePayload {
  const retentionValue = valueOrNull(formData.get('eventRetentionDays'));

  return {
    allowedOrigins: (typeof formData.get('allowedOrigins') === 'string'
      ? String(formData.get('allowedOrigins'))
      : ''
    )
      .split(/[\n,]/)
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    audioCallEnabled: formData.get('audioCallEnabled') === 'on',
    chatEnabled: formData.get('chatEnabled') === 'on',
    consentMode: valueOrNull(formData.get('consentMode')),
    eventRetentionDays: retentionValue ? Number(retentionValue) : null,
    name: String(formData.get('name') ?? '').trim(),
    trackingEnabled: formData.get('trackingEnabled') === 'on',
    videoCallEnabled: formData.get('videoCallEnabled') === 'on',
    widgetAvatarUrl: valueOrNull(formData.get('widgetAvatarUrl')),
    widgetDisplayName: valueOrNull(formData.get('widgetDisplayName')),
    widgetLogoUrl: valueOrNull(formData.get('widgetLogoUrl')),
  };
}

async function readSiteResponse(response: Response): Promise<SiteSettings> {
  const body: unknown = await response.json();
  const parsedSite = SiteResponseSchema.safeParse(body);

  if (parsedSite.success) return parsedSite.data.data;

  const parsedError = ErrorResponseSchema.safeParse(body);
  throw new Error(parsedError.success ? parsedError.data.error.message : 'The request failed.');
}

function FeatureCheckbox({
  defaultChecked,
  description,
  label,
  name,
}: Readonly<{
  defaultChecked: boolean;
  description: string;
  label: string;
  name: keyof Pick<
    SitePayload,
    'trackingEnabled' | 'chatEnabled' | 'audioCallEnabled' | 'videoCallEnabled'
  >;
}>) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 transition hover:border-accent/40">
      <input
        className="mt-1 size-4 accent-blue-600"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      <span>
        <span className="block text-sm font-semibold text-strong">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted">{description}</span>
      </span>
    </label>
  );
}

function SiteForm({
  defaultSite,
  onCancel,
  onSubmit,
  submitLabel,
}: Readonly<{
  defaultSite?: SiteSettings;
  onCancel?: () => void;
  onSubmit: (payload: SitePayload) => Promise<void>;
  submitLabel: string;
}>) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await onSubmit(formDataToPayload(new FormData(event.currentTarget)));
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'The request failed.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="grid gap-6" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-body">
          Event name
          <input
            className="workspace-input"
            defaultValue={defaultSite?.name}
            name="name"
            placeholder="e.g. Upstream Angola 2027"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-body">
          Data retention days <span className="font-normal text-muted">(optional)</span>
          <input
            className="workspace-input"
            defaultValue={defaultSite?.eventRetentionDays ?? ''}
            min="1"
            name="eventRetentionDays"
            type="number"
          />
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-body">
        Approved website origin
        <textarea
          className="workspace-input min-h-24"
          defaultValue={defaultSite?.allowedOrigins.join('\n')}
          name="allowedOrigins"
          placeholder={'https://www.example.com\nhttps://tickets.example.com'}
          required
        />
        <span className="text-xs font-normal leading-5 text-muted">
          One full http or https origin per line. Only these websites can send tracking data.
        </span>
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-strong">Enable visitor engagement</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FeatureCheckbox
            defaultChecked={defaultSite?.trackingEnabled ?? true}
            description="See visitors and their activity in real time."
            label="Visitor tracking"
            name="trackingEnabled"
          />
          <FeatureCheckbox
            defaultChecked={defaultSite?.chatEnabled ?? true}
            description="Allow your team to start a message conversation."
            label="Chat"
            name="chatEnabled"
          />
          <FeatureCheckbox
            defaultChecked={defaultSite?.audioCallEnabled ?? true}
            description="Offer one-to-one voice calls from the visitor widget."
            label="Voice calls"
            name="audioCallEnabled"
          />
          <FeatureCheckbox
            defaultChecked={defaultSite?.videoCallEnabled ?? true}
            description="Offer camera and microphone calls with consent."
            label="Video calls"
            name="videoCallEnabled"
          />
        </div>
      </fieldset>

      <details
        className="rounded-xl border border-line bg-surface-muted p-4"
        open={Boolean(defaultSite)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-strong">
          Widget appearance and consent settings
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-body">
            Widget display name
            <input
              className="workspace-input"
              defaultValue={defaultSite?.widgetDisplayName ?? ''}
              name="widgetDisplayName"
              placeholder="Event concierge"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-body">
            Consent mode
            <input
              className="workspace-input"
              defaultValue={defaultSite?.consentMode ?? ''}
              name="consentMode"
              placeholder="optional"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-body">
            Avatar URL
            <input
              className="workspace-input"
              defaultValue={defaultSite?.widgetAvatarUrl ?? ''}
              name="widgetAvatarUrl"
              type="url"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-body">
            Logo URL
            <input
              className="workspace-input"
              defaultValue={defaultSite?.widgetLogoUrl ?? ''}
              name="widgetLogoUrl"
              type="url"
            />
          </label>
        </div>
      </details>

      {errorMessage ? (
        <p className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-300">{errorMessage}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="workspace-button workspace-button-primary"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:bg-surface-hover"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function EventStatus({ status }: Readonly<{ status: SiteSettings['status'] }>) {
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? 'bg-emerald-400/10 text-emerald-300' : 'bg-surface-hover text-muted'
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-400'}`} />
      {active ? 'Live' : 'Inactive'}
    </span>
  );
}

export function SiteManagement({ canManage, initialSites, initialSiteId }: SiteManagementProps) {
  const router = useRouter();
  const [sites, setSites] = useState(initialSites);
  const querySiteId = useSearchParams().get('siteId');
  const selectedSiteId = querySiteId ?? initialSiteId ?? sites[0]?.id ?? null;
  const [isRegistering, setIsRegistering] = useState(initialSites.length === 0);
  const [isEditing, setIsEditing] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [eventSearch, setEventSearch] = useState('');
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites],
  );
  const visibleSites = useMemo(() => {
    const search = eventSearch.trim().toLocaleLowerCase();
    return search.length > 0
      ? sites.filter((site) => site.name.toLocaleLowerCase().includes(search))
      : sites;
  }, [eventSearch, sites]);

  async function createSite(payload: SitePayload): Promise<void> {
    const response = await fetchAppApi('/api/dashboard/sites', {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const site = await readSiteResponse(response);

    setSites((currentSites) =>
      [...currentSites, site].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setIsRegistering(false);
    router.replace(dashboardHref('/dashboard', site.id), { scroll: false });
  }

  async function updateSelectedSite(payload: SitePayload): Promise<void> {
    if (!selectedSite) return;

    const response = await fetchAppApi(`/api/dashboard/sites/${selectedSite.id}`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    const updatedSite = await readSiteResponse(response);

    setSites((currentSites) =>
      currentSites.map((site) => (site.id === updatedSite.id ? updatedSite : site)),
    );
    setIsEditing(false);
    router.refresh();
  }

  async function deactivateSelectedSite(): Promise<void> {
    if (!selectedSite) return;

    const response = await fetchAppApi(`/api/dashboard/sites/${selectedSite.id}/deactivate`, {
      method: 'POST',
    });
    const deactivatedSite = await readSiteResponse(response);

    setSites((currentSites) =>
      currentSites.map((site) => (site.id === deactivatedSite.id ? deactivatedSite : site)),
    );
    router.refresh();
  }

  return (
    <section className="grid gap-7">
      <section className="grid gap-6">
        <div className="event-toolbar">
          <label className="event-search">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">Search events</span>
            <input
              onChange={(event) => setEventSearch(event.target.value)}
              placeholder="Find an event…"
              type="search"
              value={eventSearch}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted">
              {sites.length} {sites.length === 1 ? 'event' : 'events'}
            </span>
            <div className="event-view-switch" role="group" aria-label="Event view">
              <button
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
                type="button"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                aria-label="List view"
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
                type="button"
              >
                <List size={18} />
              </button>
            </div>
            {canManage ? (
              <button
                className="workspace-button workspace-button-blue"
                onClick={() => {
                  setIsRegistering(true);
                  setIsEditing(false);
                }}
                type="button"
              >
                <Plus aria-hidden="true" size={16} />
                Register event
              </button>
            ) : null}
          </div>
        </div>
        <div className={`event-collection event-collection-${view}`}>
          {visibleSites.map((site) => (
            <button
              aria-label={`Select ${site.name}`}
              aria-pressed={site.id === selectedSiteId && !isRegistering}
              className="event-card"
              key={site.id}
              type="button"
              onClick={() => {
                setIsRegistering(false);
                setIsEditing(false);
                router.replace(dashboardHref('/dashboard', site.id), { scroll: false });
              }}
            >
              <span className="event-card-mark">
                <Globe aria-hidden="true" size={25} />
              </span>
              <span className="event-card-copy">
                <span className="event-card-name">{site.name}</span>
                <span className="event-card-origin">
                  {site.allowedOrigins[0] ?? 'No origins configured'}
                </span>
              </span>
              <span className="event-card-footer">
                <EventStatus status={site.status} />
                <ArrowUpRight aria-hidden="true" size={20} />
              </span>
            </button>
          ))}
        </div>
        {!visibleSites.length ? (
          <p className="workspace-empty" role="status">
            {eventSearch
              ? 'No events match your search. Try another name.'
              : 'No events yet. Register your first event to start receiving visitors.'}
          </p>
        ) : null}
        <div className="min-w-0">
          {isRegistering && canManage ? (
            <section className="workspace-panel p-5 sm:p-6">
              <div className="border-b border-line pb-6">
                <p className="text-xs font-medium text-cyan-100/56">New event</p>
                <h2 className="mt-2 text-2xl font-light tracking-tight text-strong">
                  Register an event
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Connect the event website and choose which visitor-engagement tools are available.
                </p>
              </div>
              <div className="mt-6">
                <p className="mb-5 text-sm text-muted">
                  The generated public key identifies tracker requests. It is not a dashboard
                  secret.
                </p>
                <SiteForm
                  onCancel={() => setIsRegistering(false)}
                  onSubmit={createSite}
                  submitLabel="Create event"
                />
              </div>
            </section>
          ) : selectedSite ? (
            <section className="workspace-panel p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs font-medium text-cyan-100/56">Selected event</p>
                    <EventStatus status={selectedSite.status} />
                  </div>
                  <h2 className="mt-2 text-2xl font-light tracking-tight text-strong">
                    {selectedSite.name}
                  </h2>
                  <p className="mt-2 text-sm text-muted">
                    Open the tools below or update this event’s website connection.
                  </p>
                </div>
                {canManage ? (
                  <button
                    className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-surface-muted"
                    onClick={() => setIsEditing((current) => !current)}
                    type="button"
                  >
                    {isEditing ? 'Close settings' : 'Event settings'}
                  </button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Link
                  className="workspace-record p-4"
                  href={`/dashboard/live?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-strong">Live visitors</p>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    See who is active and respond in real time.
                  </p>
                </Link>
                <Link
                  className="workspace-record p-4"
                  href={`/dashboard/calls?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-strong">Call history</p>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Review call outcomes and missed-call reasons.
                  </p>
                </Link>
                <Link
                  className="workspace-record p-4"
                  href={`/dashboard/analytics?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-strong">Analytics</p>
                  <p className="mt-1 text-sm leading-5 text-muted">
                    Understand visitors, activity and campaigns.
                  </p>
                </Link>
              </div>

              {canManage ? (
                <div className="mt-6 workspace-record p-4">
                  <p className="text-sm font-semibold text-strong">Tracker public key</p>
                  <p className="mt-1 text-xs leading-5 text-muted">
                    Use this key in the event website’s tracker snippet. It is safe to expose
                    publicly.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <code className="max-w-full overflow-x-auto rounded-lg bg-surface px-3 py-2 text-xs text-body ring-1 ring-line">
                      {selectedSite.publicKey}
                    </code>
                    <CopyPublicKeyButton publicKey={selectedSite.publicKey} />
                  </div>
                </div>
              ) : null}

              {isEditing && canManage ? (
                <div className="mt-7 border-t border-line pt-7">
                  <div className="mb-5">
                    <h3 className="text-lg font-light text-strong">Event settings</h3>
                    <p className="mt-1 text-sm text-muted">
                      Changes apply only to {selectedSite.name}.
                    </p>
                  </div>
                  <SiteForm
                    defaultSite={selectedSite}
                    key={selectedSite.id}
                    onCancel={() => setIsEditing(false)}
                    onSubmit={updateSelectedSite}
                    submitLabel="Save changes"
                  />
                  {selectedSite.status === 'ACTIVE' ? (
                    <button
                      className="mt-6 rounded-xl border border-red-400/30 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-400/10"
                      onClick={() => void deactivateSelectedSite()}
                      type="button"
                    >
                      Deactivate event
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : (
            <section className="grid min-h-80 place-items-center rounded-lg border border-dashed border-line bg-surface px-6 py-12 text-center">
              <div>
                <h2 className="text-lg font-light text-strong">No event selected</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                  {canManage
                    ? 'Register the first event above to connect its website and begin receiving visitor activity.'
                    : 'Ask an administrator to add you to an event workspace.'}
                </p>
              </div>
            </section>
          )}
        </div>
      </section>
    </section>
  );
}
