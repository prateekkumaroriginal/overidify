export type ResponseEditorMode = 'code' | 'tree'
const key = 'overidify.response-editor-mode.v1'

export function readResponseEditorMode(storage: Pick<Storage, 'getItem'>, treeAvailable = true): ResponseEditorMode {
  try { return treeAvailable && storage.getItem(key) === 'tree' ? 'tree' : 'code' } catch { return 'code' }
}
export function saveResponseEditorMode(storage: Pick<Storage, 'setItem'>, mode: ResponseEditorMode) {
  try { storage.setItem(key, mode) } catch { /* Editing still works when preferences cannot be saved. */ }
}
