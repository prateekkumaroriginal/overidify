import type { HeaderRedaction, HeaderRedactionByTab } from './dnr.ts'
import { requestUrlKey } from './network-matching.ts'
import { HIDDEN_FROM_VARIABLE } from './execution-history.ts'
import type { ObservedHeader } from './execution-history.ts'

/**
 * What must be hidden from request observations in one tab. Resolved header
 * names and request URL keys can contain variable values, so these layers are
 * kept in worker memory only and never persisted.
 */
export type RedactionLayer = { headers: HeaderRedaction; urls: Set<string>; unknownHeaders: boolean; unknownUrls: boolean }

export const DETAILS_HIDDEN = 'Request details hidden while variable rules were loading.'
export const URL_HIDDEN = "Hidden because a Network Rule's request URL contains a variable."

export function emptyLayer(patch: Partial<RedactionLayer> = {}): RedactionLayer {
  return { headers: new Map(), urls: new Set(), unknownHeaders: false, unknownUrls: false, ...patch }
}

export function mergeLayers(layers: Iterable<RedactionLayer>): RedactionLayer {
  const merged = emptyLayer()
  for (const layer of layers) {
    for (const [name, mode] of layer.headers) if (merged.headers.get(name) !== 'drop') merged.headers.set(name, mode)
    for (const url of layer.urls) merged.urls.add(url)
    merged.unknownHeaders ||= layer.unknownHeaders
    merged.unknownUrls ||= layer.unknownUrls
  }
  return merged
}

/** Keep both sides of a transition until installation is confirmed. Request
 * observers keep their own snapshot for the lifetime of each browser request.
 */
export function createObservationRedaction() {
  let headers = new Map<number, RedactionLayer>()
  type DocumentProtection = { layer: RedactionLayer; sent?: Set<string> }
  const network = new Map<number, Map<string, DocumentProtection>>()
  let headerReady = false
  let networkReady = false

  const headerLayers = (source: HeaderRedactionByTab) => [...source].map(([tabId, layer]) =>
    [tabId, layer === null ? emptyLayer({ unknownHeaders: true }) : emptyLayer({ headers: layer })] as const)

  function networkDocuments(tabId: number) {
    const documents = network.get(tabId) ?? new Map<string, DocumentProtection>()
    network.set(tabId, documents)
    return documents
  }

  return {
    /** A browser update applies to all affected tabs together. */
    headerTransition(previous: HeaderRedactionByTab, next: HeaderRedactionByTab) {
      const upcoming = new Map(headerLayers(next))
      const pending = new Map(headers)
      for (const [tabId, layer] of [...headerLayers(previous), ...upcoming]) {
        pending.set(tabId, mergeLayers([pending.get(tabId) ?? emptyLayer(), layer]))
      }
      headers = pending
      headerReady = true
      return (ok: boolean) => { if (ok) headers = upcoming }
    },
    /** Surviving documents may still hold settings from before a worker restart. */
    initializeNetwork(possiblyActiveDocuments: Iterable<readonly [number, string]>) {
      for (const [tabId, documentId] of possiblyActiveDocuments) {
        networkDocuments(tabId).set(documentId, { layer: emptyLayer({ unknownUrls: true }) })
      }
      networkReady = true
    },
    /** Sending adds protection. Acknowledgment only retires settings for this document. */
    networkSettingsSent(tabId: number, documentId: string, urls: Set<string>) {
      const previous = network.get(tabId)?.get(documentId)
      if (!previous && !urls.size) return () => !network.get(tabId)?.has(documentId)
      const documents = networkDocuments(tabId)
      const next = emptyLayer({ urls })
      const sent = previous?.sent
      const sameUrls = sent?.size === urls.size && [...urls].every(url => sent.has(url))
      const pending = sameUrls ? previous! : { layer: mergeLayers([previous?.layer ?? emptyLayer(), next]), sent: urls }
      documents.set(documentId, pending)
      return () => {
        if (network.get(tabId) !== documents || documents.get(documentId) !== pending) return false
        if (urls.size) documents.set(documentId, { layer: next, sent: urls })
        else documents.delete(documentId)
        if (!documents.size) network.delete(tabId)
        return true
      }
    },
    forgetTab(tabId: number) {
      headers.delete(tabId)
      network.delete(tabId)
    },
    protection(tabId: number): RedactionLayer {
      const merged = mergeLayers([headers.get(tabId) ?? emptyLayer(), ...[...network.get(tabId)?.values() ?? []].map(document => document.layer)])
      if (!headerReady) merged.unknownHeaders = true
      if (!networkReady) merged.unknownUrls = true
      return merged
    },
  }
}
export type ObservationRedaction = ReturnType<typeof createObservationRedaction>

type RawHeader = { name: string; value?: string }
export type RedactedObservation = { url?: string; urlOmitted?: string; headers?: ObservedHeader[]; hiddenHeaders?: number; detailsHidden?: string }

/** Removes only what Overidify inserted from a variable; unrelated details stay visible. */
export function redactObservation(url: string, rawHeaders: RawHeader[] | undefined, protection: RedactionLayer): RedactedObservation {
  const result: RedactedObservation = {}
  if (protection.unknownHeaders || protection.unknownUrls) result.detailsHidden = DETAILS_HIDDEN
  if (protection.unknownUrls) result.urlOmitted = DETAILS_HIDDEN
  else if (protection.urls.size && protection.urls.has(requestUrlKey(url) ?? '')) result.urlOmitted = URL_HIDDEN
  else result.url = url
  if (protection.unknownHeaders) return result
  let hidden = 0
  result.headers = (rawHeaders ?? []).flatMap((header): ObservedHeader[] => {
    if (typeof header.name !== 'string' || typeof header.value !== 'string') return []
    const mode = protection.headers.get(header.name.toLowerCase())
    if (mode === 'drop') { hidden++; return [] }
    return [{ key: header.name, value: mode === 'value' ? HIDDEN_FROM_VARIABLE : header.value }]
  })
  if (hidden) result.hiddenHeaders = hidden
  return result
}
