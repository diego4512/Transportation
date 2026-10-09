// A szerverrel közös adatmodell (egyetlen forrás: server/src/types.ts)
export type * from '../../../server/src/types';
import type { Alert, Departure, TripDetails, AcInfo } from '../../../server/src/types';

export interface StopGroup {
  name: string;
  lat: number;
  lon: number;
  stopIds: string[];
  routes: import('../../../server/src/types').RouteInfo[];
}

export interface DeparturesResponse {
  departures: Departure[];
  alerts: Alert[];
  source: 'realtime' | 'schedule';
  warning?: string;
}

export interface TripResponse {
  trip: TripDetails;
  alerts: Alert[];
  ac: AcInfo;
  warning?: string;
}

export interface Weather {
  temperature: number;
  apparentTemperature: number;
  cloudCover: number;
  precipitation: number;
  uvIndex: number | null;
  isDay: boolean;
  level: 'hot' | 'warm' | 'mild' | 'cold';
  rain: boolean;
  advice: string[];
}

export interface SunSegment { fromStop: string; toStop: string; start: number; end: number; sunnySide: 'left' | 'right' | 'front' | 'back' | 'none' }
export interface SunResponse {
  advice: {
    recommendedSide: 'left' | 'right' | null;
    preference: 'avoid' | 'seek';
    seconds: Record<'left' | 'right' | 'front' | 'back' | 'none', number>;
    sunnyShare: number;
    avgAltitudeDeg: number | null;
    segments: SunSegment[];
    summary: string;
    underground: boolean;
  };
  weather: Weather | null;
  ac: AcInfo;
  from: string;
  to: string;
}

export interface Status {
  realtime: boolean;
  gtfs: Record<string, string> | null;
  time: number;
}
