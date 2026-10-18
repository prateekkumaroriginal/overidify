import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { Select } from 'radix-ui'
import type { SwitchRule } from '../lib/types'
import { Icon } from './Icon'
import { cn } from '../lib/utils'

type SwitchRuleOptionSelectProps = {
  switchRule: SwitchRule
  disabled?: boolean
  pending?: boolean
  onChange: (optionId: string) => void
  size?: 'sm' | 'default'
}

export function SwitchRuleOptionSelect({ switchRule, disabled, pending = false, onChange, size = 'default' }: SwitchRuleOptionSelectProps) {
  if (switchRule.options.length < 2) return null
  return (
    <Select.Root
      value={switchRule.selectedOptionId}
      disabled={disabled}
      onValueChange={(optionId) => { if (!pending) onChange(optionId) }}
    >
      <Select.Trigger
        className={cn(
          'flex h-9 w-[132px] shrink-0 items-center justify-between gap-2 rounded-md border border-input bg-field px-3 text-xs text-foreground hover:border-primary/20 data-[state=open]:border-primary/25 mobile:w-28 mobile:text-[11px] [&>span:first-child]:truncate',
          size === 'sm' && 'h-7 w-[104px] px-2 text-[11px] mobile:w-[104px]',
          'aria-busy:cursor-wait aria-busy:opacity-100',
        )}
        aria-label={`Option for ${switchRule.name}`}
        aria-disabled={disabled || pending}
        aria-busy={pending || undefined}
        onPointerDown={(event) => { if (pending) event.preventDefault() }}
        onClick={(event) => { if (pending) event.preventDefault() }}
        onKeyDown={(event) => { if (pending && event.key !== 'Tab') event.preventDefault() }}
      >
        <Select.Value />
        <Select.Icon asChild>
          <Icon icon={ChevronDown} className="size-3.5 text-muted-foreground" />
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
            <Icon icon={ArrowRight} className="size-3.5 -rotate-90" />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {switchRule.options.map((option) => (
              <Select.Item
                key={option.id}
                value={option.id}
                className="relative flex min-h-8 cursor-pointer items-center rounded-md py-2 pr-7 pl-2 text-xs wrap-anywhere outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-primary data-[state=checked]:text-primary mobile:text-[11px]"
              >
                <Select.ItemText>{option.name}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2 flex items-center">
                  <Icon icon={Check} className="size-3.5" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground">
            <Icon icon={ArrowRight} className="size-3.5 rotate-90" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}
