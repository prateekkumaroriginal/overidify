import { Lock, Plus } from 'lucide-react'
import type { EditorView } from '@codemirror/view'
import { suggestionField, suggestionItems, suggestionQuery } from '../lib/template-editor'
import { nameKey, valuePreview } from '../lib/variables'
import { chooseSuggestion } from './template-editor-view'
import { Icon } from './Icon'

function Highlight({ name, query }: { name: string; query: string }) {
  const start = query ? nameKey(name).indexOf(nameKey(query)) : -1
  if (start < 0) return <>{name}</>
  return <>{name.slice(0, start)}<mark>{name.slice(start, start + query.length)}</mark>{name.slice(start + query.length)}</>
}

/** The `{{` list, positioned under the braces inside `container`. Typing filters it. */
export function VariableSuggestionList({ view, listId, container }: { view: EditorView | null; listId: string; container: HTMLElement | null }) {
  const suggestion = view?.state.field(suggestionField, false)
  if (!view || !suggestion || !container) return null
  const query = suggestionQuery(view.state) ?? ''
  const items = suggestionItems(view.state)
  const coords = view.coordsAtPos(suggestion.from)
  const box = container.getBoundingClientRect()
  const style = coords
    ? { top: coords.bottom - box.top + 4, left: Math.max(0, Math.min(coords.left - box.left, box.width - 280)) }
    : { top: '100%', left: 0 }
  const empty = !items.variables.length && !items.create
  return <div className="variable-suggestions" style={style} onMouseDown={event => event.preventDefault()}>
    {empty ? <div id={listId} className="variable-suggestions-empty" role="status">
      <span>{query ? 'No matching variables. Keep typing for plain text.' : 'No variables yet.'}</span>
      {/* A new tab keeps the current rule draft. */}
      <a href="options.html#/variables" target="_blank" rel="noreferrer">Open Variables</a>
    </div> : <div role="listbox" id={listId} aria-label="Variables">
      {items.variables.map((variable, index) => <div key={variable.id} id={`${listId}-${index}`} role="option" aria-selected={index === suggestion.index}
        className="variable-suggestion" data-highlighted={index === suggestion.index}
        onClick={() => chooseSuggestion(view, index)}>
        <span className="variable-suggestion-name"><Highlight name={variable.name} query={query} /></span>
        <span className="variable-suggestion-value">{variable.secret && <Icon icon={Lock} size={11} />}{valuePreview(variable)}</span>
      </div>)}
      {items.create && <div id={`${listId}-${items.variables.length}`} role="option" aria-selected={suggestion.index === items.variables.length}
        className="variable-suggestion" data-highlighted={suggestion.index === items.variables.length} data-create
        onClick={() => chooseSuggestion(view, items.variables.length)}>
        <span className="variable-suggestion-name">Create <code>{items.create}</code></span>
        <span className="variable-suggestion-value"><Icon icon={Plus} size={12} /></span>
      </div>}
    </div>}
    <div className="variable-suggestions-hint" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> insert <kbd>Esc</kbd> keep as text</div>
  </div>
}

