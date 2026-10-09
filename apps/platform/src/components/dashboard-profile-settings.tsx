'use client';
import Image from 'next/image';
import { Upload, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiErrorEnvelopeSchema, UserProfileSchema, type UserProfile } from '@supernizo/shared';
import { fetchAppApi } from '@/lib/app-fetch';
import { readProfilePhoto } from '@/lib/profile-photo';

function ProfileAvatar({ profile, size = 40 }: Readonly<{ profile: UserProfile; size?: number }>) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials = profile.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-sky-300/10 text-sm font-medium text-sky-100"
      style={{ width: size, height: size }}
    >
      {profile.imageUrl && profile.imageUrl !== failedUrl ? (
        <Image
          alt=""
          className="h-full w-full object-cover"
          height={size}
          width={size}
          onError={() => setFailedUrl(profile.imageUrl)}
          src={profile.imageUrl}
          unoptimized
        />
      ) : (
        <span aria-hidden="true">{initials || 'U'}</span>
      )}
    </span>
  );
}

export function DashboardProfileSummary({ profile }: Readonly<{ profile: UserProfile }>) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={profile.displayName}>
      <ProfileAvatar profile={profile} />
      <span className="hidden max-w-36 truncate text-sm text-strong lg:block">
        {profile.displayName}
      </span>
    </div>
  );
}

export function DashboardProfileSettings({
  initialProfile,
  renderTrigger,
}: Readonly<{
  initialProfile: UserProfile;
  renderTrigger: (openSettings: () => void) => ReactNode;
}>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [profile, setProfile] = useState(initialProfile);
  const [isOpen, setIsOpen] = useState(false);
  const [displayName, setDisplayName] = useState(initialProfile.displayName);
  const [imageUrl, setImageUrl] = useState(initialProfile.imageUrl ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const busy = saving || readingPhoto;

  useEffect(() => {
    if (isOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [isOpen]);

  function openSettings() {
    setDisplayName(profile.displayName);
    setImageUrl(profile.imageUrl ?? '');
    setError(null);
    setIsOpen(true);
  }
  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setReadingPhoto(true);
    setError(null);
    try {
      setImageUrl(await readProfilePhoto(file));
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'The photo could not be read.');
    } finally {
      setReadingPhoto(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetchAppApi('/api/dashboard/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, imageUrl: imageUrl.trim() || null }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const parsed = ApiErrorEnvelopeSchema.safeParse(body);
        throw new Error(
          parsed.success ? parsed.data.error.message : 'Your profile could not be saved.',
        );
      }
      const parsed = UserProfileSchema.safeParse(
        body && typeof body === 'object' && 'data' in body ? body.data : null,
      );
      if (!parsed.success) throw new Error('Your profile could not be saved.');
      setProfile(parsed.data);
      setIsOpen(false);
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      {renderTrigger(openSettings)}
      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        aria-labelledby="profile-settings-heading"
        className="workspace-theme profile-settings-dialog"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="workspace-eyebrow">Your account</p>
            <h2 className="mt-2 text-2xl font-light text-strong" id="profile-settings-heading">
              Profile settings
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Choose the name and photo shown in your dashboard.
            </p>
          </div>
          <button
            aria-label="Close profile settings"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-white/10"
            disabled={busy}
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <form className="grid gap-5" onSubmit={save}>
          <div className="flex flex-col items-center gap-3">
            <ProfileAvatar
              profile={{
                displayName: displayName || profile.displayName,
                imageUrl: imageUrl || null,
              }}
              size={80}
            />
            <label
              className={
                'workspace-button focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-sky-200 ' +
                (busy ? 'pointer-events-none opacity-50' : 'cursor-pointer')
              }
            >
              <Upload aria-hidden="true" className="size-4" />
              {readingPhoto ? 'Reading photo…' : 'Upload photo'}
              <input
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload profile photo"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  void choosePhoto(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
                type="file"
              />
            </label>
            <p className="text-xs text-muted">JPG, PNG or WebP · up to 256 KB</p>
          </div>
          <label className="grid gap-2 text-sm text-body">
            Display name
            <input
              autoComplete="nickname"
              className="workspace-input"
              disabled={busy}
              maxLength={191}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              value={displayName}
            />
          </label>
          <label className="grid gap-2 text-sm text-body">
            Photo URL <span className="text-xs text-muted">Or paste a link to your photo.</span>
            <input
              className="workspace-input"
              disabled={busy}
              maxLength={2048}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder={
                imageUrl.startsWith('data:')
                  ? 'Uploaded photo selected'
                  : 'https://example.com/photo.jpg'
              }
              type="url"
              value={imageUrl.startsWith('data:') ? '' : imageUrl}
            />
          </label>
          {imageUrl ? (
            <button
              className="mx-auto text-xs text-muted underline underline-offset-4 hover:text-strong"
              disabled={busy}
              onClick={() => setImageUrl('')}
              type="button"
            >
              Remove photo
            </button>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-center gap-3 pt-1">
            <button
              className="workspace-button"
              disabled={busy}
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="workspace-button workspace-button-primary"
              disabled={busy}
              type="submit"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
