'use client';

import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

type SelectOption = Readonly<{ value: string; label: string; disabled?: boolean }>;
type WorkspaceSelectProps = Readonly<{
  'aria-label': string;
  options: readonly SelectOption[];
  className?: string;
  defaultValue?: string;
  value?: string;
  name?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
}>;

export function WorkspaceSelect({
  'aria-label': label,
  options,
  className = '',
  defaultValue,
  value,
  name,
  disabled = false,
  onValueChange,
}: WorkspaceSelectProps) {
  const [selection, setSelection] = useState(defaultValue ?? options[0]?.value ?? '');
  const selectedValue = value ?? selection;
  // Prefix every item so an empty "All" filter is a valid Radix value, without collisions.
  const encode = (itemValue: string) => `value:${itemValue}`;

  return (
    <>
      {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} /> : null}
      <Select.Root
        value={options.length ? encode(selectedValue) : ''}
        disabled={disabled || options.length === 0}
        onValueChange={(next) => {
          const decoded = next.slice('value:'.length);
          setSelection(decoded);
          onValueChange?.(decoded);
        }}
      >
        <Select.Trigger
          aria-label={label}
          className={`workspace-filter workspace-select-trigger ${className}`}
        >
          <Select.Value placeholder="No options" />
          <Select.Icon asChild>
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-cyan-100/60" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            className="workspace-theme workspace-select-menu"
            position="popper"
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={12}
          >
            <Select.ScrollUpButton className="workspace-select-scroll">
              <ChevronUp className="size-4" />
            </Select.ScrollUpButton>
            <Select.Viewport className="workspace-select-viewport">
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={encode(option.value)}
                  disabled={option.disabled ?? false}
                  className="workspace-select-item"
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3 inline-flex">
                    <Check className="size-4" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
            <Select.ScrollDownButton className="workspace-select-scroll">
              <ChevronDown className="size-4" />
            </Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </>
  );
}
