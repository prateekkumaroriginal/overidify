import { useEffect, useId, useRef, useSyncExternalStore } from 'react'
import { EditorView, runScopeHandlers } from '@codemirror/view'
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, replaceAll, replaceNext, SearchQuery, searchPanelOpen, selectMatches, setSearchQuery } from '@codemirror/search'
import { X } from 'lucide-react'
import type { ResponseEditorSession } from '../lib/response-editor-session'
import { Icon } from './Icon'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from './ui/field'
import { Input } from './ui/input'

type Props = { session: ResponseEditorSession; view: EditorView; disabled: boolean }

export function ResponseSearchPanel({ session, view, disabled }: Props) {
  const state = useSyncExternalStore(session.subscribe, () => session.state)
  const query = getSearchQuery(state)
  const open = searchPanelOpen(state)
  const id = useId()
  const findInput = useRef<HTMLInputElement>(null)
  const invalid = !!query.search && !query.valid

  useEffect(() => {
    if (open) {
      findInput.current?.focus({ preventScroll: true })
      findInput.current?.select()
    }
  }, [open])

  function updateQuery(change: Partial<SearchQuery>) {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ ...query, ...change })) })
  }

  return <section aria-label="Search and replace" className="response-search-panel rounded-b-md border border-t-0 bg-background p-3" onKeyDown={event => {
    if (runScopeHandlers(view, event.nativeEvent, 'search-panel')) event.preventDefault()
    else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      if (event.target === findInput.current) (event.shiftKey ? findPrevious : findNext)(view)
      else replaceNext(view)
    }
  }}>
    <FieldGroup className="gap-3">
      <div className="flex items-start gap-2">
        <FieldGroup className="min-w-0 flex-1 gap-2">
          <Field orientation="responsive" className="gap-2" data-invalid={invalid} data-disabled={disabled}>
            <FieldLabel htmlFor={`${id}-find`} className="sr-only">Find</FieldLabel>
            <Input ref={findInput} id={`${id}-find`} main-field="true" placeholder="Find" value={query.search} disabled={disabled} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} className="flex-1" onChange={event => updateQuery({ search: event.target.value })} />
            <div role="group" aria-label="Find matches" className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={disabled || !query.valid} onClick={() => findPrevious(view)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={disabled || !query.valid} onClick={() => findNext(view)}>Next</Button>
              <Button type="button" variant="outline" size="sm" disabled={disabled || !query.valid} onClick={() => selectMatches(view)}>Select all</Button>
            </div>
          </Field>
          <Field orientation="responsive" className="gap-2" data-disabled={disabled}>
            <FieldLabel htmlFor={`${id}-replace`} className="sr-only">Replace</FieldLabel>
            <Input id={`${id}-replace`} placeholder="Replace" value={query.replace} disabled={disabled} className="flex-1" onChange={event => updateQuery({ replace: event.target.value })} />
            <div role="group" aria-label="Replace matches" className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={disabled || !query.valid} onClick={() => replaceNext(view)}>Replace</Button>
              <Button type="button" variant="outline" size="sm" disabled={disabled || !query.valid} onClick={() => replaceAll(view)}>Replace all</Button>
            </div>
          </Field>
        </FieldGroup>
        <Button type="button" variant="ghost-muted" size="icon-sm" aria-label="Close search" onClick={() => closeSearchPanel(view)}><Icon icon={X} /></Button>
      </div>
      <FieldSet disabled={disabled} className="gap-0">
        <FieldLegend className="sr-only">Search options</FieldLegend>
        <FieldGroup className="flex-row flex-wrap gap-x-5 gap-y-3">
          <Field orientation="horizontal" className="w-auto gap-2">
            <Checkbox id={`${id}-case`} checked={query.caseSensitive} onCheckedChange={checked => updateQuery({ caseSensitive: checked === true })} />
            <FieldLabel htmlFor={`${id}-case`} size="sm">Match case</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto gap-2">
            <Checkbox id={`${id}-regex`} checked={query.regexp} onCheckedChange={checked => updateQuery({ regexp: checked === true })} />
            <FieldLabel htmlFor={`${id}-regex`} size="sm">Regex</FieldLabel>
          </Field>
          <Field orientation="horizontal" className="w-auto gap-2">
            <Checkbox id={`${id}-word`} checked={query.wholeWord} onCheckedChange={checked => updateQuery({ wholeWord: checked === true })} />
            <FieldLabel htmlFor={`${id}-word`} size="sm">Whole word</FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
      {invalid && <FieldError id={`${id}-error`}>Invalid regular expression.</FieldError>}
    </FieldGroup>
  </section>
}
