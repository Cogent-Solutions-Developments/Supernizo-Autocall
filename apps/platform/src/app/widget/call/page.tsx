import { notFound } from 'next/navigation';

import { CallWidgetFrame } from './call-widget-frame';

type CallWidgetPageProps = Readonly<{ searchParams: Promise<{ host_origin?: string | string[] }> }>;

function validOrigin(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

export default async function CallWidgetPage({ searchParams }: CallWidgetPageProps) {
  const query = await searchParams;
  const hostOrigin = validOrigin(query.host_origin);
  if (!hostOrigin) notFound();
  return <CallWidgetFrame hostOrigin={hostOrigin} />;
}
