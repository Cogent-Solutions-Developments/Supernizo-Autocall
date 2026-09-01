'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';

import { SiteSettingsSchema, type SiteSettings } from '@supernizo/shared';

import { CopyPublicKeyButton } from '@/app/components/copy-public-key-button';

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

  if (parsedSite.success) {
    return parsedSite.data.data;
  }

  const parsedError = ErrorResponseSchema.safeParse(body);
  throw new Error(parsedError.success ? parsedError.data.error.message : 'The request failed.');
}

function FeatureCheckbox({
  defaultChecked,
  label,
  name,
}: Readonly<{
  defaultChecked: boolean;
  label: string;
  name: keyof Pick<
    SitePayload,
    'trackingEnabled' | 'chatEnabled' | 'audioCallEnabled' | 'videoCallEnabled'
  >;
}>) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function SiteForm({
  defaultSite,
  onSubmit,
  submitLabel,
}: Readonly<{
  defaultSite?: SiteSettings;
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
    <form className="grid gap-4" onSubmit={handleSubmit}>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Site name
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          defaultValue={defaultSite?.name}
          name="name"
          required
        />
      </label>
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Allowed origins
        <textarea
          className="min-h-20 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          defaultValue={defaultSite?.allowedOrigins.join('\n')}
          name="allowedOrigins"
          placeholder="https://www.example.com"
          required
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Widget display name
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultSite?.widgetDisplayName ?? ''}
            name="widgetDisplayName"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Consent mode
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultSite?.consentMode ?? ''}
            name="consentMode"
            placeholder="optional"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Avatar URL
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultSite?.widgetAvatarUrl ?? ''}
            name="widgetAvatarUrl"
            type="url"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Logo URL
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultSite?.widgetLogoUrl ?? ''}
            name="widgetLogoUrl"
            type="url"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Event retention days
          <input
            className="rounded-lg border border-slate-300 px-3 py-2"
            defaultValue={defaultSite?.eventRetentionDays ?? ''}
            min="1"
            name="eventRetentionDays"
            type="number"
          />
        </label>
      </div>
      <fieldset className="grid gap-2 rounded-lg bg-slate-50 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-800">Features</legend>
        <FeatureCheckbox
          defaultChecked={defaultSite?.trackingEnabled ?? true}
          label="Tracking"
          name="trackingEnabled"
        />
        <FeatureCheckbox
          defaultChecked={defaultSite?.chatEnabled ?? true}
          label="Chat"
          name="chatEnabled"
        />
        <FeatureCheckbox
          defaultChecked={defaultSite?.audioCallEnabled ?? true}
          label="Voice calls"
          name="audioCallEnabled"
        />
        <FeatureCheckbox
          defaultChecked={defaultSite?.videoCallEnabled ?? true}
          label="Video calls"
          name="videoCallEnabled"
        />
      </fieldset>
      {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}
      <button
        className="w-fit rounded-lg bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

export function SiteManagement({ canManage, initialSites }: SiteManagementProps) {
  const router = useRouter();
  const [sites, setSites] = useState(initialSites);
  const [selectedSiteId, setSelectedSiteId] = useState(initialSites[0]?.id ?? null);
  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites],
  );

  async function createSite(payload: SitePayload): Promise<void> {
    const response = await fetch('/api/dashboard/sites', {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const site = await readSiteResponse(response);

    setSites((currentSites) =>
      [...currentSites, site].sort((left, right) => left.name.localeCompare(right.name)),
    );
    setSelectedSiteId(site.id);
    router.refresh();
  }

  async function updateSelectedSite(payload: SitePayload): Promise<void> {
    if (!selectedSite) {
      return;
    }

    const response = await fetch(`/api/dashboard/sites/${selectedSite.id}`, {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    });
    const updatedSite = await readSiteResponse(response);

    setSites((currentSites) =>
      currentSites.map((site) => (site.id === updatedSite.id ? updatedSite : site)),
    );
    router.refresh();
  }

  async function deactivateSelectedSite(): Promise<void> {
    if (!selectedSite) {
      return;
    }

    const response = await fetch(`/api/dashboard/sites/${selectedSite.id}/deactivate`, {
      method: 'POST',
    });
    const deactivatedSite = await readSiteResponse(response);

    setSites((currentSites) =>
      currentSites.map((site) => (site.id === deactivatedSite.id ? deactivatedSite : site)),
    );
    router.refresh();
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-slate-950">Sites</h2>
        <div className="mt-4 grid gap-2">
          {sites.map((site) => (
            <button
              className={`rounded-lg px-3 py-2 text-left text-sm ${
                selectedSiteId === site.id
                  ? 'bg-slate-950 text-white'
                  : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              key={site.id}
              onClick={() => setSelectedSiteId(site.id)}
              type="button"
            >
              <span className="block font-medium">{site.name}</span>
              <span className="text-xs opacity-75">{site.status.toLowerCase()}</span>
            </button>
          ))}
          {sites.length === 0 ? (
            <p className="text-sm text-slate-500">No sites available.</p>
          ) : null}
        </div>
      </aside>
      <div className="grid gap-6">
        {canManage ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Register a site</h2>
            <p className="mt-1 text-sm text-slate-600">
              The generated public key identifies tracker requests; it is not a dashboard secret.
            </p>
            <div className="mt-5">
              <SiteForm onSubmit={createSite} submitLabel="Create site" />
            </div>
          </section>
        ) : null}
        {selectedSite ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Site settings</p>
                <h2 className="text-xl font-semibold text-slate-950">{selectedSite.name}</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {selectedSite.status}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3">
              <code className="max-w-full overflow-x-auto text-xs text-slate-700">
                {selectedSite.publicKey}
              </code>
              <CopyPublicKeyButton publicKey={selectedSite.publicKey} />
            </div>
            {canManage ? (
              <div className="mt-5 grid gap-4">
                <SiteForm
                  defaultSite={selectedSite}
                  key={selectedSite.id}
                  onSubmit={updateSelectedSite}
                  submitLabel="Save settings"
                />
                {selectedSite.status === 'ACTIVE' ? (
                  <button
                    className="w-fit rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700"
                    onClick={() => void deactivateSelectedSite()}
                    type="button"
                  >
                    Deactivate site
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 text-sm text-slate-600">
                You have read-only access to this site’s settings.
              </p>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
