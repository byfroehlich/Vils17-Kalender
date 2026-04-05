import { SmoobuAdapter } from "./smoobu";
import type { ChannelManagerAdapter } from "./types";

// Hier wird später per Organization-Setting der richtige Adapter gewählt.
// In V1 gibt es nur Smoobu.
export function getChannelManagerAdapter(): ChannelManagerAdapter {
  return new SmoobuAdapter();
}

export type { ChannelManagerAdapter, NormalizedApartment, NormalizedReservation } from "./types";
