import { useCallback, useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

interface GoogleMapsAutocompleteProps {
  value: string;
  onChange: (address: string, lat: number, lng: number, placeName: string, components?: { city?: string; state?: string }) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
}

type Libraries = ("places" | "drawing" | "geometry" | "visualization")[];
const libraries: Libraries = ['places'];

interface Suggestion {
  id: string;
  main: string;
  secondary: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prediction: any;
}

const DEBOUNCE_MS = 250;

// Clean address by removing Plus Codes and unwanted identifiers
const cleanAddress = (address: string): string => {
  if (!address) return address;

  const cleaned = address
    .replace(/^[A-Z0-9]{2,4}\+[A-Z0-9]{2,4}([,\s]+)?/i, '')
    .replace(/([,\s]+)?[A-Z0-9]{2,4}\+[A-Z0-9]{2,4}$/i, '')
    .replace(/([,\s]+)[A-Z0-9]{2,4}\+[A-Z0-9]{2,4}([,\s]+)/gi, (_match, before, after) => {
      return before.includes(',') || after.includes(',') ? ', ' : ' ';
    })
    .replace(/\s+[A-Z0-9]{2,4}\+[A-Z0-9]{2,4}\s+/gi, ' ')
    .replace(/\b[A-Z0-9]{2,4}\+[A-Z0-9]{2,4}\b/gi, '')
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();

  return cleaned;
};

/**
 * Location search box built on the Places API (New). The legacy
 * `google.maps.places.Autocomplete` widget is not available to Google Cloud
 * projects created after March 2025, so suggestions are fetched with
 * AutocompleteSuggestion and rendered here.
 */
export default function GoogleMapsAutocomplete({
  value,
  onChange,
  placeholder = 'Search location...',
  className = '',
  disabled = false,
  required = false,
}: GoogleMapsAutocompleteProps) {
  const [error, setError] = useState<string>('');
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placesLibRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionTokenRef = useRef<any>(null);
  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: libraries,
  });

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (loadError) setError(`Failed to load Google Maps API: ${loadError.message}`);
  }, [loadError]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close the list when clicking outside the component.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadPlaces = useCallback(async () => {
    if (placesLibRef.current) return placesLibRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as any).google;
    if (!g?.maps?.importLibrary) throw new Error('Google Maps is not ready');
    placesLibRef.current = await g.maps.importLibrary('places');
    return placesLibRef.current;
  }, []);

  const search = useCallback(
    async (text: string) => {
      const requestId = ++requestIdRef.current;
      try {
        setSearching(true);
        const lib = await loadPlaces();
        if (!sessionTokenRef.current) sessionTokenRef.current = new lib.AutocompleteSessionToken();
        const { suggestions: found } = await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          includedRegionCodes: ['in'],
          sessionToken: sessionTokenRef.current,
        });
        if (requestId !== requestIdRef.current) return; // a newer search replaced this one
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped: Suggestion[] = (found || []).filter((s: any) => s.placePrediction).map((s: any) => ({
          id: s.placePrediction.placeId,
          main: s.placePrediction.mainText?.text || s.placePrediction.text?.text || '',
          secondary: s.placePrediction.secondaryText?.text || '',
          prediction: s.placePrediction,
        }));
        setSuggestions(mapped);
        setHighlight(-1);
        setOpen(mapped.length > 0);
        setError('');
      } catch (err: unknown) {
        if (requestId !== requestIdRef.current) return;
        console.error('Places autocomplete error:', err);
        setSuggestions([]);
        setOpen(false);
        setError('Location search is unavailable right now. Please try again.');
      } finally {
        if (requestId === requestIdRef.current) setSearching(false);
      }
    },
    [loadPlaces]
  );

  const handleInput = (text: string) => {
    setInputValue(text);
    // Manual typing hasn't resolved real coordinates yet — pass NaN rather
    // than fabricating 0,0 (which downstream code could mistake for a real,
    // validly-selected location and silently save a corrupted address).
    // Callers should leave latitude/longitude untouched when they see NaN.
    onChange(text, NaN, NaN, text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2 || !isLoaded) {
      requestIdRef.current++;
      setSuggestions([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(() => search(text.trim()), DEBOUNCE_MS);
  };

  const select = async (s: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    requestIdRef.current++;
    try {
      const place = s.prediction.toPlace();
      await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'] });
      // The session ends once a place is chosen; the next search starts a new one.
      sessionTokenRef.current = null;

      if (!place.location) {
        setError('No location details found for this place');
        return;
      }

      const lat = place.location.lat();
      const lng = place.location.lng();
      const rawAddress = place.formattedAddress || place.displayName || s.main;
      const address = cleanAddress(rawAddress);
      const placeName = place.displayName || address;

      let city = '';
      let state = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const component of (place.addressComponents || []) as any[]) {
        const types: string[] = component.types || [];
        if (types.includes('locality')) city = component.longText;
        else if (types.includes('administrative_area_level_3') && !city) city = component.longText;
        else if (types.includes('administrative_area_level_1')) state = component.longText;
      }

      setInputValue(address);
      onChangeRef.current(address, lat, lng, placeName, { city, state });
      setError('');
    } catch (err: unknown) {
      console.error('Places fetchFields error:', err);
      setError('Could not load that place. Please pick another or try again.');
    }
  };

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  return (
    <div className="w-full relative" ref={containerRef}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 border border-neutral-300 rounded-lg placeholder:text-neutral-400 focus:outline-none focus:border-blue-600 bg-white ${className}`}
        disabled={disabled}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onKeyDown={(e) => {
          // Enter means "pick the highlighted suggestion," not "submit the form".
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && suggestions.length > 0) select(suggestions[highlight >= 0 ? highlight : 0]);
          } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
            e.preventDefault();
            setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {searching && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin pointer-events-none" />
      )}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto bg-white border border-neutral-200 rounded-lg shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === highlight}
              // mousedown (not click) so it runs before the input loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                select(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-2 cursor-pointer text-left ${i === highlight ? 'bg-neutral-100' : ''}`}
            >
              <p className="text-sm font-medium text-neutral-900 truncate">{s.main}</p>
              {s.secondary && <p className="text-xs text-neutral-500 truncate">{s.secondary}</p>}
            </li>
          ))}
        </ul>
      )}
      {error && apiKey && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
