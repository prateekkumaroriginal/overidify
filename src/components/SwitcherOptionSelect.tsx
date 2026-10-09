import { Select } from 'radix-ui'
import type { HeaderSwitcher } from '../lib/types'
import { Icon } from './Icon'

type SwitcherOptionSelectProps = {
  switcher: HeaderSwitcher
  disabled?: boolean
  onChange: (optionId: string) => void
}

export function SwitcherOptionSelect({ switcher, disabled, onChange }: SwitcherOptionSelectProps) {
  if (switcher.options.length < 2) return null
  return (
    <Select.Root
      value={switcher.selectedOptionId}
      disabled={disabled}
      onValueChange={onChange}
    >
      <Select.Trigger
        className="flex h-9 w-[132px] shrink-0 items-center justify-between gap-2 rounded-md border border-input bg-field px-3 text-xs text-foreground hover:border-primary/20 data-[state=open]:border-primary/25 mobile:w-28 mobile:text-[11px] [&>span:first-child]:truncate"
        aria-label={`Option for ${switcher.name}`}
      >
        <Select.Value />
        <Select.Icon asChild>
          <svg className="size-3.5 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-h-[min(280px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-40 max-w-[var(--radix-select-content-available-width)] overflow-hidden rounded-lg border border-border bg-field p-1 text-foreground shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
        >
          <Select.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground">
            <Icon name="arrow" className="size-3.5 -rotate-90" />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {switcher.options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                className="relative flex min-h-8 cursor-pointer items-center rounded-md py-2 pr-7 pl-2 text-xs wrap-anywhere outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-primary data-[state=checked]:text-primary mobile:text-[11px]"
              >
                <Select.ItemText>{option.name}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2 flex items-center">
                  <Icon name="check" className="size-3.5" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <Icon name="arrow" className="size-3.5 rotate-90" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
