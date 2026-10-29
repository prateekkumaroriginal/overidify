import { useState } from 'react'
import type { Node } from 'jsonc-parser'
import type { JsonPath, TreeEdit } from '../lib/response-editor'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'

const defaults: Record<string, string> = { object: '{}', array: '[]', string: '""', number: '0', boolean: 'false', null: 'null' }
type Props = { node: Node; path: JsonPath; body: string; disabled: boolean; edit: (operation: TreeEdit | (() => TreeEdit)) => boolean }

export function ResponseTree({ node, path, body, disabled, edit }: Props) {
  const [open, setOpen] = useState(path.length === 0)
  const [limit, setLimit] = useState(100)
  const [newKey, setNewKey] = useState('""')
  const [newValue, setNewValue] = useState('null')
  const name = path.length ? String(path.at(-1)) : 'Root'
  const label = path.length ? JSON.stringify(path) : 'Root'
  const container = node.type === 'object' || node.type === 'array'
  const raw = body.slice(node.offset, node.offset + node.length)
  const children = node.children ?? []
  function readKey(text: string): string {
    const key: unknown = JSON.parse(text)
    if (typeof key !== 'string') throw new Error('Use a quoted JSON string for the property name.')
    return key
  }
  function commit(input: HTMLInputElement, operation: () => TreeEdit) {
    const success = edit(operation)
    input.setCustomValidity(success ? '' : 'Change not applied. Correct this field or switch to Code.')
  }
  return (
    <div className="min-w-0 border-l border-border pl-3" role="group" aria-label={`${label} value`}>
      <div className="flex flex-wrap items-center gap-2 py-2">
        {container && <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</Button>}
        {typeof path.at(-1) === 'string' ? <Input key={`${label}:${name}`} className="w-36" aria-label={`Property name ${label}`} defaultValue={JSON.stringify(name)} disabled={disabled} onChange={event => event.target.setCustomValidity('')} onBlur={event => { const text = event.target.value; if (text !== JSON.stringify(name)) commit(event.target, () => ({ type: 'rename', path, key: readKey(text) })) }} /> : <span className="text-xs font-semibold">{name}</span>}
        <Select value={node.type} disabled={disabled} onValueChange={type => edit({ type: 'replace', path, value: defaults[type] })}>
          <SelectTrigger className="w-28" aria-label={`Type ${label}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup>{Object.keys(defaults).map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
        {node.type === 'string' || node.type === 'number' ? <Input key={`${label}:${raw}`} className="min-w-32 flex-1" aria-label={`Value ${label}`} defaultValue={raw} aria-description={node.type === 'string' ? 'JSON string with quotes and escapes' : 'JSON number'} disabled={disabled} onChange={event => event.target.setCustomValidity('')} onBlur={event => {
          const value = event.target.value
          if (value !== raw) commit(event.target, () => {
            if (typeof JSON.parse(value) !== node.type) throw new Error(`Use a valid JSON ${node.type}.`)
            return { type: 'replace', path, value }
          })
        }} /> : node.type === 'boolean' ? <Select value={String(node.value)} disabled={disabled} onValueChange={value => edit({ type: 'replace', path, value })}>
          <SelectTrigger className="w-24" aria-label={`Value ${label}`}><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="true">true</SelectItem><SelectItem value="false">false</SelectItem></SelectGroup></SelectContent>
        </Select> : <span className="text-xs text-muted-foreground">{container ? `${children.length} ${node.type === 'array' ? 'items' : 'properties'}` : 'null'}</span>}
        {path.length > 0 && <Button type="button" variant="ghost-muted" size="sm" disabled={disabled} aria-label={`Delete ${label}`} onClick={() => edit({ type: 'remove', path })}>Delete</Button>}
        {typeof path.at(-1) === 'number' && <>
          <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || path.at(-1) === 0} aria-label={`Move up ${label}`} onClick={() => edit({ type: 'move', path, to: Number(path.at(-1)) - 1 })}>↑</Button>
          <Button type="button" variant="ghost-muted" size="sm" disabled={disabled || Number(path.at(-1)) >= (node.parent?.children?.length ?? 0) - 1} aria-label={`Move down ${label}`} onClick={() => edit({ type: 'move', path, to: Number(path.at(-1)) + 1 })}>↓</Button>
        </>}
      </div>
      {container && open && <div className="grid min-w-0 gap-1">
        {children.slice(0, limit).map((child, index) => {
          const childKey = node.type === 'object' ? child.children![0].value as string : index
          const value = node.type === 'object' ? child.children![1] : child
          return <ResponseTree key={JSON.stringify(childKey)} node={value} path={[...path, childKey]} body={body} disabled={disabled} edit={edit} />
        })}
        {children.length > limit && <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => setLimit(limit + 100)}>Show next {Math.min(100, children.length - limit)} items</Button>}
        <div className="flex flex-wrap items-center gap-2 py-2">
          {node.type === 'object' && <Input className="w-36" aria-label={`New property name ${label}`} placeholder='"Property name"' value={newKey} disabled={disabled} onChange={event => setNewKey(event.target.value)} />}
          <Input className="min-w-32 flex-1" aria-label={`New JSON value ${label}`} value={newValue} disabled={disabled} onChange={event => setNewValue(event.target.value)} />
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => edit(() => ({ type: 'add', path, key: node.type === 'object' ? readKey(newKey) : undefined, value: newValue }))}>Add {node.type === 'array' ? 'item' : 'property'}</Button>
        </div>
      </div>}
    </div>
  )
}
