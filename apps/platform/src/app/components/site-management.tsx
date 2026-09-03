'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { SiteSettingsSchema, type SiteSettings } from '@supernizo/shared';

import { CopyPublicKeyButton } from '@/app/components/copy-public-key-button';
import supernizoLogo from '@/assets/logo-transparent.png';
import { fetchAppApi } from '@/lib/app-fetch';

const SiteResponseSchema = z.object({ data: SiteSettingsSchema });
const ErrorResponseSchema = z.object({
  error: z.object({ message: z.string() }),
});

type SiteManagementProps = Readonly<{
  canManage: boolean;
  initialSites: SiteSettings[];
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
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-blue-300">
      <input
        className="mt-1 size-4 accent-blue-600"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
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
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Event name
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            defaultValue={defaultSite?.name}
            name="name"
            placeholder="e.g. Upstream Angola 2027"
            required
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          Data retention days <span className="font-normal text-slate-400">(optional)</span>
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
            defaultValue={defaultSite?.eventRetentionDays ?? ''}
            min="1"
            name="eventRetentionDays"
            type="number"
          />
        </label>
      </div>

      <label className="grid gap-1.5 text-sm font-medium text-slate-700">
        Approved website origin
        <textarea
          className="min-h-24 rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-950 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          defaultValue={defaultSite?.allowedOrigins.join('\n')}
          name="allowedOrigins"
          placeholder={'https://www.example.com\nhttps://tickets.example.com'}
          required
        />
        <span className="text-xs font-normal leading-5 text-slate-500">
          One full http or https origin per line. Only these websites can send tracking data.
        </span>
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold text-slate-800">Enable visitor engagement</legend>
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
        className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        open={Boolean(defaultSite)}
      >
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
          Widget appearance and consent settings
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Widget display name
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              defaultValue={defaultSite?.widgetDisplayName ?? ''}
              name="widgetDisplayName"
              placeholder="Event concierge"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Consent mode
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              defaultValue={defaultSite?.consentMode ?? ''}
              name="consentMode"
              placeholder="optional"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Avatar URL
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              defaultValue={defaultSite?.widgetAvatarUrl ?? ''}
              name="widgetAvatarUrl"
              type="url"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Logo URL
            <input
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5"
              defaultValue={defaultSite?.widgetLogoUrl ?? ''}
              name="widgetLogoUrl"
              type="url"
            />
          </label>
        </div>
      </details>

      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
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
        active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
      }`}
    >
      <span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {active ? 'Live' : 'Inactive'}
    </span>
  );
}

export function SiteManagement({ canManage, initialSites }: SiteManagementProps) {
  const router = useRouter();
  const [sites, setSites] = useState(initialSites);
  const [selectedSiteId, setSelectedSiteId] = useState(initialSites[0]?.id ?? null);
  const [isRegistering, setIsRegistering] = useState(initialSites.length === 0);
  const [isEditing, setIsEditing] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
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
  const displayedSites = isSidebarCollapsed ? sites : visibleSites;

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
    setSelectedSiteId(site.id);
    setIsRegistering(false);
    router.refresh();
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
      <section className="grid gap-6 lg:block">
        <aside
          className={`event-sidebar flex flex-col rounded-[1.5rem] border border-sky-100/15 bg-[#0b1a24]/90 shadow-xl shadow-black/25 backdrop-blur-xl lg:fixed lg:inset-y-4 lg:left-4 lg:z-20 lg:transition-[width] lg:duration-300 ${
            isSidebarCollapsed ? '' : 'event-sidebar-expanded'
          } ${isSidebarCollapsed ? 'p-2 lg:w-[4.75rem]' : 'p-3 lg:w-64'}`}
          onMouseEnter={() => setIsSidebarCollapsed(false)}
          onMouseLeave={() => setIsSidebarCollapsed(true)}
        >
          <div
            className={`flex items-center py-2 ${isSidebarCollapsed ? 'justify-center' : 'justify-between px-3'}`}
          >
            {isSidebarCollapsed ? (
              <span className="grid size-9 place-items-center rounded-full bg-sky-300/15 text-xs font-bold text-sky-100">
                S
              </span>
            ) : (
              <div>
                <Image
                  alt="Supernizo Autocall"
                  className="h-auto w-44"
                  priority
                  src={supernizoLogo}
                />
                <div>
                  <p className="mt-4 text-xs font-bold tracking-[0.18em] text-sky-200 uppercase">
                    Events
                  </p>
                </div>
              </div>
            )}
          </div>
          {!isSidebarCollapsed ? (
            <label className="mt-4 block px-1">
              <span className="sr-only">Search events</span>
              <input
                className="h-10 w-full rounded-xl border border-sky-100/15 bg-black/15 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-sky-200/45 focus:ring-2 focus:ring-sky-300/10"
                onChange={(event) => setEventSearch(event.target.value)}
                placeholder="Search events"
                type="search"
                value={eventSearch}
              />
            </label>
          ) : null}
          {sites.length > 0 ? (
            <div
              className={`mt-5 grid min-h-0 flex-1 content-start gap-2 overflow-y-auto ${isSidebarCollapsed ? 'justify-items-center' : ''}`}
            >
              {displayedSites.map((site) => {
                const selected = selectedSiteId === site.id;
                return (
                  <button
                    aria-pressed={selected}
                    aria-label={`Select ${site.name}`}
                    className={`transition ${
                      isSidebarCollapsed
                        ? 'relative grid size-10 place-items-center rounded-full p-0'
                        : 'rounded-xl border px-3 py-3 text-left'
                    } ${
                      selected
                        ? 'border-white !bg-white !text-[#0b3345] shadow-lg shadow-black/15'
                        : isSidebarCollapsed
                          ? 'border-transparent bg-white/[0.08] text-white/80 hover:bg-white/[0.14] hover:text-white'
                          : 'border-transparent bg-white/[0.06] text-white/80 hover:border-sky-100/10 hover:bg-white/[0.12] hover:text-white'
                    }`}
                    key={site.id}
                    onClick={() => {
                      setSelectedSiteId(site.id);
                      setIsEditing(false);
                      setIsRegistering(false);
                    }}
                    title={site.name}
                    type="button"
                  >
                    {isSidebarCollapsed ? (
                      <>
                        <span className="text-xs font-bold uppercase">{site.name.slice(0, 1)}</span>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-[#0b1a24] ${site.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-300'}`}
                        />
                      </>
                    ) : (
                      <span className="flex items-center gap-3">
                        <span
                          className={`size-2 shrink-0 rounded-full ${site.status === 'ACTIVE' ? 'bg-emerald-400' : 'bg-slate-400'}`}
                        />
                        <span className="min-w-0 truncate text-sm font-semibold">{site.name}</span>
                      </span>
                    )}
                  </button>
                );
              })}
              {!isSidebarCollapsed && visibleSites.length === 0 ? (
                <p className="px-3 py-5 text-sm text-white/55">No matching events.</p>
              ) : null}
            </div>
          ) : (
            <p className="min-h-0 flex-1 px-3 pt-7 text-sm leading-6 text-white/75">
              No events have been registered yet.
            </p>
          )}
          {canManage ? (
            <div
              className={`mt-4 border-t border-white/15 pt-4 ${isSidebarCollapsed ? 'flex justify-center' : 'px-1'}`}
            >
              <button
                aria-label="Register event"
                className={`text-sm font-semibold transition ${
                  isSidebarCollapsed
                    ? 'grid size-14 place-items-center rounded-full bg-sky-100/20 p-0 text-2xl'
                    : 'w-full rounded-xl border border-sky-100/15 bg-white/10 px-3 py-2.5 text-left hover:bg-white/15'
                } ${isRegistering ? 'bg-white text-[#0b3345]' : 'text-white'}`}
                onClick={() => {
                  setIsRegistering(true);
                  setIsEditing(false);
                }}
                type="button"
              >
                {isSidebarCollapsed ? '+' : '+ Register event'}
              </button>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          {isRegistering && canManage ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="border-b border-slate-100 pb-6">
                <p className="text-sm font-semibold tracking-[0.14em] text-blue-600 uppercase">
                  New event
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                  Register an event
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Connect the event website and choose which visitor-engagement tools are available.
                </p>
              </div>
              <div className="mt-6">
                <p className="mb-5 text-sm text-slate-600">
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
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm font-semibold tracking-[0.14em] text-blue-600 uppercase">
                      Selected event
                    </p>
                    <EventStatus status={selectedSite.status} />
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {selectedSite.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Open the tools below or update this event’s website connection.
                  </p>
                </div>
                {canManage ? (
                  <button
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setIsEditing((current) => !current)}
                    type="button"
                  >
                    {isEditing ? 'Close settings' : 'Event settings'}
                  </button>
                ) : null}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Link
                  className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                  href={`/dashboard/live?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-slate-950">Live visitors</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    See who is active and respond in real time.
                  </p>
                </Link>
                <Link
                  className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                  href={`/dashboard/calls?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-slate-950">Call history</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Review call outcomes and missed-call reasons.
                  </p>
                </Link>
                <Link
                  className="rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                  href={`/dashboard/analytics?siteId=${selectedSite.id}`}
                >
                  <p className="text-sm font-semibold text-slate-950">Analytics</p>
                  <p className="mt-1 text-sm leading-5 text-slate-600">
                    Understand visitors, activity and campaigns.
                  </p>
                </Link>
              </div>

              <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">Tracker public key</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Use this key in the event website’s tracker snippet. It is safe to expose
                  publicly.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <code className="max-w-full overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                    {selectedSite.publicKey}
                  </code>
                  <CopyPublicKeyButton publicKey={selectedSite.publicKey} />
                </div>
              </div>

              {isEditing && canManage ? (
                <div className="mt-7 border-t border-slate-100 pt-7">
                  <div className="mb-5">
                    <h3 className="text-lg font-semibold text-slate-950">Event settings</h3>
                    <p className="mt-1 text-sm text-slate-600">
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
                      className="mt-6 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-50"
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
            <section className="grid min-h-80 place-items-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">No event selected</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
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
