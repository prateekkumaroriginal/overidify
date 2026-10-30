chrome.devtools.panels.create('Overidify', 'icons/icon-32.png', 'devtools-panel.html', panel => {
  panel.onShown.addListener(panelWindow => {
    panelWindow.dispatchEvent(new Event('overidify-devtools-shown'))
  })
})
