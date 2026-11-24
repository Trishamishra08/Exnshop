import { createContext } from 'react';

export interface Location {
  latitude: number;
  longitude: number;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  /** "gps": the device's live location (refreshed when the app opens); "manual": an address the customer chose. */
  source?: 'gps' | 'manual';
  /** How precise the device said the fix is, in metres (laptops often give 1-20 km). */
  accuracy?: number;
  /** When this location was taken (ms since epoch). */
  updatedAt?: number;
}

export interface LocationContextType {
  location: Location | null;
  isLocationEnabled: boolean;
  isLocationLoading: boolean;
  locationError: string | null;
  locationPermissionStatus: 'granted' | 'denied' | 'prompt' | 'session_granted';
  requestLocation: () => Promise<void>;
  updateLocation: (location: Location) => Promise<void>;
  clearLocation: () => void;
}

export const LocationContext = createContext<LocationContextType | undefined>(undefined);

