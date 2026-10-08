import { useEffect, useRef } from 'react'

export function useEditorShortcuts(returnRoute: string, pending: boolean) {
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return

      if (event.key === 'Escape') {
        event.preventDefault()
        window.location.hash = returnRoute
        return
      }

      if (event.key !== 'Enter') return

      if (event.ctrlKey) {
        event.preventDefault()
        if (!pending && !event.repeat) formRef.current?.requestSubmit()
        return
      }

      const target = event.target
      if (!(target instanceof HTMLElement) || !formRef.current?.contains(target)) return
      if (target instanceof HTMLTextAreaElement || target.closest('a')) return
      const button = target.closest('button')
      if (button && button.type !== 'submit') return
      event.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [returnRoute, pending])

  return formRef
}
