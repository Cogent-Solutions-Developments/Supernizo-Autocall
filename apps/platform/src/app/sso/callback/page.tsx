import { AuthClientProvider } from '@/app/components/auth-client-provider';
import { SupernizoSignIn } from '@/app/components/supernizo-sign-in';

export const metadata = { title: 'Opening Autocall | Supernizo', referrer: 'no-referrer' as const };
export const dynamic = 'force-dynamic';

export default function SupernizoCallbackPage() {
  return (
    <AuthClientProvider>
      <SupernizoSignIn />
    </AuthClientProvider>
  );
}
