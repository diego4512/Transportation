/** A szerver által kiadott (normalizált) adatmodell. A web kliens ugyanezt használja (web/src/lib/types.ts). */

export interface RouteInfo {
  id: string;
  shortName: string;
  longName: string;
  /** GTFS route_type: 0 villamos, 1 metró, 2 vasút/HÉV, 3 busz, 4 hajó, 11 troli, 109 HÉV */
  type: number;
  color: string;
  textColor: string;
}

export interface StopInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  code: string | null;
  parent: string | null;
  wheelchair: boolean | null;
  routes: RouteInfo[];
  distance?: number;
}

export interface Departure {
  tripId: string;
  serviceDate: string;
  stopId: string;
  stopSequence: number | null;
  route: RouteInfo;
  headsign: string;
  /** epoch másodperc */
  scheduled: number;
  predicted: number | null;
  delaySec: number | null;
  realtime: boolean;
  wheelchair: boolean;
  alertIds: string[];
  vehicle?: VehicleInfo | null;
  /** Megbízhatóság az eddig megfigyelt késések alapján (ha van adat). */
  reliability?: Reliability | null;
}

export interface VehicleInfo {
  vehicleId: string;
  tripId: string | null;
  routeId: string | null;
  /** a járat adatai, ha a BKK válasz tartalmazza */
  route?: RouteInfo | null;
  lat: number;
  lon: number;
  bearing: number | null;
  label: string | null;
  licensePlate: string | null;
  model: string | null;
  stopId: string | null;
  stopSequence: number | null;
  status: string | null;
  stopDistancePercent: number | null;
  wheelchair: boolean | null;
  occupancy: string | null;
  lastUpdate: number | null;
  airConditioning: AcInfo;
}

export interface AcInfo {
  /** true: van klíma, false: nincs, null: nem tudjuk */
  value: boolean | null;
  /** 'api': az API mondja; 'model': járműtípus-táblázatból; 'unknown' */
  source: 'api' | 'model' | 'unknown';
  note?: string;
}

export interface TripStop {
  stopId: string;
  name: string;
  lat: number;
  lon: number;
  sequence: number;
  distance: number | null;
  scheduledArrival: number;
  scheduledDeparture: number;
  predictedArrival: number | null;
  predictedDeparture: number | null;
}

export interface TripDetails {
  tripId: string;
  serviceDate: string;
  route: RouteInfo;
  headsign: string;
  directionId: number | null;
  wheelchair: boolean;
  stops: TripStop[];
  /** [lat, lon, shape_dist_traveled] */
  shape: [number, number, number | null][];
  vehicle: VehicleInfo | null;
  alertIds: string[];
  realtime: boolean;
}

export interface AlertReason {
  /** gépi kód: accident, technical, construction, event, weather, traffic, police, medical, demonstration, other */
  code: string;
  label: string;
  emoji: string;
}

export interface Alert {
  id: string;
  header: string;
  description: string;
  url: string | null;
  start: number | null;
  end: number | null;
  routeIds: string[];
  stopIds: string[];
  reason: AlertReason;
}

export interface Reliability {
  samples: number;
  avgDelaySec: number;
  /** a megfigyelések hány %-a volt 3 percnél kisebb késésű */
  onTimePct: number;
}
