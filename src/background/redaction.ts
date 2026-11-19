import { createObservationRedaction } from '../lib/observation-redaction'

// Shared by header activation, Network activation, and request observations.
export const observationRedaction = createObservationRedaction()
