import { notFound } from 'next/navigation';

import { ChatWidgetFrame } from './chat-widget-frame';

type ChatWidgetPageProps = Readonly<{ searchParams: Promise<{ host_origin?: string | string[] }> }>;

function validOrigin(value: string | string[] | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

export default async function ChatWidgetPage({ searchParams }: ChatWidgetPageProps) {
  const query = await searchParams;
  const hostOrigin = validOrigin(query.host_origin);
  if (!hostOrigin) notFound();

  return <ChatWidgetFrame hostOrigin={hostOrigin} />;
}
