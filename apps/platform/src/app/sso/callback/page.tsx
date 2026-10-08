import { AuthClientProvider } from '@/components/auth-client-provider';
import { SupernizoSignIn } from '@/components/supernizo-sign-in';
import {
  notificationDeepLinkFromValues,
  notificationDeepLinkPath,
} from '@/server/interfaces/auth/notification-deep-link';

export const metadata = { title: 'Opening Autocall | Supernizo', referrer: 'no-referrer' as const };
export const dynamic = 'force-dynamic';

type CallbackPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function SupernizoCallbackPage({ searchParams }: CallbackPageProps) {
  const target = notificationDeepLinkFromValues(await searchParams);
  return (
    <AuthClientProvider>
      <SupernizoSignIn callbackPath={notificationDeepLinkPath(target)} />
    </AuthClientProvider>
  );
}
