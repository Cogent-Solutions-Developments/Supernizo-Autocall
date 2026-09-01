'use client';

import { useEffect, useState } from 'react';

type Availability = 'AVAILABLE' | 'BUSY' | 'OFFLINE';

const labels: Record<Availability, string> = {
  AVAILABLE: 'Available',
  BUSY: 'Busy',
  OFFLINE: 'Offline',
};

export function AgentAvailabilityControl() {
  const [requestedAvailability, setRequestedAvailability] = useState<Availability>('AVAILABLE');
  const [availability, setAvailability] = useState<Availability>('AVAILABLE');

  useEffect(() => {
    let active = true;
    const heartbeat = () => {
      void fetch('/api/dashboard/agent-presence', {
        body: JSON.stringify({ availability: requestedAvailability }),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Agent heartbeat failed.');
          return response.json() as Promise<{ data: { availability: Availability } }>;
        })
        .then((response) => active && setAvailability(response.data.availability))
        .catch(() => active && setAvailability('OFFLINE'));
    };
    heartbeat();
    const interval = window.setInterval(heartbeat, 20_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [requestedAvailability]);

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <span
        className={
          availability === 'AVAILABLE'
            ? 'text-emerald-700'
            : availability === 'BUSY'
              ? 'text-amber-700'
              : 'text-slate-500'
        }
      >
        {labels[availability]}
      </span>
      <select
        aria-label="Your availability"
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
        disabled={availability === 'BUSY'}
        onChange={(event) => setRequestedAvailability(event.target.value as Availability)}
        value={requestedAvailability}
      >
        <option value="AVAILABLE">Available</option>
        <option value="OFFLINE">Offline</option>
      </select>
    </label>
  );
}
