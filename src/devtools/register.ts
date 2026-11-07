import { observeExecutions } from './executions'
import type { ExecutionWindow } from './executions'
import { buildIdentity } from '../lib/build-identity'

const executions = observeExecutions(chrome.devtools.inspectedWindow.tabId)
window.addEventListener('unload', () => executions.dispose(), { once: true })
chrome.devtools.panels.create(buildIdentity.name, `${buildIdentity.iconRoot}/icon-32.png`, 'devtools-panel.html', panel => {
  panel.onShown.addListener(panelWindow => {
    const target = panelWindow as ExecutionWindow
    target.overidifyExecutions = executions
    panelWindow.dispatchEvent(new Event('overidify-devtools-shown'))
  })
})
