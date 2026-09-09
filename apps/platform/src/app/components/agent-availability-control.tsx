'use client';

import { useEffect, useState } from 'react';
import { WorkspaceSelect } from './workspace-select';

import { fetchAppApi } from '@/lib/app-fetch';

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
      void fetchAppApi('/api/dashboard/agent-presence', {
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
    <label className="workspace-availability text-sm font-medium text-body">
      <span
        aria-label={`Current status: ${labels[availability]}`}
        title={`Current status: ${labels[availability]}`}
        className={
          availability === 'AVAILABLE'
            ? 'workspace-availability-dot bg-emerald-400'
            : availability === 'BUSY'
              ? 'workspace-availability-dot bg-amber-400'
              : 'workspace-availability-dot bg-slate-400'
        }
      />
      <WorkspaceSelect
        aria-label="Your availability"
        disabled={availability === 'BUSY'}
        onValueChange={(next) => {
          if (next === 'AVAILABLE' || next === 'OFFLINE') setRequestedAvailability(next);
        }}
        value={requestedAvailability}
        options={[
          { value: 'AVAILABLE', label: 'Available' },
          { value: 'OFFLINE', label: 'Offline' },
        ]}
      />
    </label>
  );
}
