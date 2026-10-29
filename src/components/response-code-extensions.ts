import { Compartment } from '@codemirror/state'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, HighlightStyle, foldGutter, foldKeymap, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { json } from '@codemirror/lang-json'
import { search, searchKeymap } from '@codemirror/search'
import { lintGutter } from '@codemirror/lint'

export function responseCodeExtensions() {
  const language = new Compartment(), editable = new Compartment()
  return { language, editable, extensions: [
    lineNumbers(), drawSelection(), highlightActiveLine(), highlightActiveLineGutter(),
    bracketMatching(), indentOnInput(), indentUnit.of('  '), foldGutter(), lintGutter(), search(),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.string, color: 'var(--syntax-string)' },
      { tag: tags.propertyName, color: 'var(--syntax-key)' },
      { tag: tags.number, color: 'var(--syntax-number)' },
      { tag: [tags.bool, tags.null], color: 'var(--syntax-keyword)' },
      { tag: tags.invalid, color: 'var(--destructive)' },
    ])),
    language.of(json()), editable.of(EditorView.editable.of(true)),
    keymap.of([...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab, ...defaultKeymap]),
    EditorView.contentAttributes.of({ 'aria-label': 'Response body', spellcheck: 'false' }),
    EditorView.theme({
      '&': { backgroundColor: 'var(--field)', color: 'var(--foreground)', fontSize: '12px' },
      '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' },
      '.cm-scroller': { fontFamily: 'ui-monospace, monospace', overflow: 'auto' },
      '.cm-content': { minHeight: '300px', caretColor: 'var(--primary)' },
      '.cm-gutters': { backgroundColor: 'var(--card)', color: 'var(--muted-foreground)', borderColor: 'var(--border)' },
      '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--selection)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent)' },
      '.cm-cursor': { borderLeftColor: 'var(--primary)' },
      '.cm-panels, .cm-tooltip': { backgroundColor: 'var(--card)', color: 'var(--foreground)', borderColor: 'var(--border)' },
      '.cm-search input, .cm-search button, .cm-search select': { background: 'var(--secondary)', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '4px' },
      '.cm-foldPlaceholder': { backgroundColor: 'var(--secondary)', color: 'var(--foreground)', borderColor: 'var(--border)' },
    }, { dark: true }),
  ] }
}
