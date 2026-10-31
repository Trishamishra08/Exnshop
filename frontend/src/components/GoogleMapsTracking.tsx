import { useCallback, useRef, useEffect, useState } from 'react'
// @ts-ignore - @react-google-maps/api types may not be available
import { GoogleMap, useJsApiLoader, Marker, Polyline } from '@react-google-maps/api'
import { motion } from 'framer-motion'
// Use direct public path which is more reliable in this setup
const getDeliveryIconUrl = () => '/assets/deliveryboy/deliveryIcon.png';

interface Location {
    lat: number
    lng: number
    name?: string
}

interface GoogleMapsTrackingProps {
    storeLocation?: Location
    sellerLocations?: Location[]
    customerLocation: Location
    deliveryLocation?: Location
    isTracking: boolean
    showRoute?: boolean // Whether to compute distance/ETA using Distance Matrix API
    routeOrigin?: Location // Origin for route (delivery partner location)
    routeDestination?: Location // Destination for route (seller shop or customer)
    routeWaypoints?: Location[] // Intermediate waypoints for the route
    destinationName?: string // Name of the destination for the overlay
    onRouteInfoUpdate?: (info: {
        distance: string;
        duration: string;
        durationValue: number; // raw seconds
        distanceValue: number; // raw meters
    } | null) => void
    lastUpdate?: Date | null // Last location update timestamp
}

const mapContainerStyle = {
    width: '100%',
    height: '22rem'
}

export default function GoogleMapsTracking({
    storeLocation,
    sellerLocations = [],
    customerLocation,
    deliveryLocation,
    isTracking,
    showRoute = false,
    routeOrigin,
    routeDestination,
    routeWaypoints = [],
    destinationName,
    onRouteInfoUpdate,
    lastUpdate
}: GoogleMapsTrackingProps) {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    const mapRef = useRef<any>(null)
    const lastRouteCalcRef = useRef<{
        time: number
        origin: Location
        destination?: Location
        known?: boolean
        roadFactor: number
        metersPerSecond: number
    }>({ time: 0, origin: { lat: 0, lng: 0 }, roadFactor: 1.3, metersPerSecond: 25000 / 3600 })
    const routeCallRef = useRef(0)
    const hasInitialBoundsFitted = useRef<boolean>(false)
    const [userHasInteracted, setUserHasInteracted] = useState<boolean>(false)
    const [isFullScreen, setIsFullScreen] = useState<boolean>(false)
    const [routeInfo, setRouteInfo] = useState<{
        distance: string;
        duration: string;
        durationValue: number;
        distanceValue: number;
    } | null>(null)
    const [routeError, setRouteError] = useState<string | null>(null)
    const [isGPSWeak, setIsGPSWeak] = useState<boolean>(false)

    // Check for weak GPS signal (no updates for > 45 seconds)
    useEffect(() => {
        if (!lastUpdate) return;

        const checkGPS = () => {
            const now = new Date().getTime();
            const lastTime = new Date(lastUpdate).getTime();
            setIsGPSWeak(now - lastTime > 45000); // 45 seconds threshold
        };

        const interval = setInterval(checkGPS, 10000); // Check every 10 seconds
        checkGPS(); // Initial check

        return () => clearInterval(interval);
    }, [lastUpdate]);

    // Sync routeInfo with parent
    useEffect(() => {
        if (onRouteInfoUpdate) {
            onRouteInfoUpdate(routeInfo);
        }
    }, [routeInfo, onRouteInfoUpdate]);

    const { isLoaded, loadError } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: apiKey || ''
    })

    // Combine storeLocation with sellerLocations
    const allSellers = storeLocation ? [storeLocation, ...sellerLocations] : sellerLocations;

    // Center will be updated dynamically based on deliveryLocation
    const center = deliveryLocation || (allSellers.length > 0 ? {
        lat: (allSellers[0].lat + customerLocation.lat) / 2,
        lng: (allSellers[0].lng + customerLocation.lng) / 2
    } : customerLocation)

    const path = [
        ...allSellers,
        ...(deliveryLocation ? [deliveryLocation] : []),
        customerLocation
    ].filter(loc => loc && (loc.lat !== 0 || loc.lng !== 0))

    // Auto-center and fit bounds when location or route changes
    useEffect(() => {
        if (!isLoaded || !mapRef.current || userHasInteracted || !window.google?.maps) return;

        const bounds = new window.google.maps.LatLngBounds();
        let hasPoints = false;

        // Add delivery location (focus point)
        if (deliveryLocation) {
            bounds.extend(deliveryLocation);
            hasPoints = true;
        }

        // Add route points if visible
        if (showRoute && routeOrigin && routeDestination) {
            bounds.extend(routeOrigin);
            bounds.extend(routeDestination);
            routeWaypoints.forEach(wp => bounds.extend(wp));
            hasPoints = true;
        } else {
            // Add other locations if route not showing
            if (storeLocation) {
                bounds.extend(storeLocation);
                hasPoints = true;
            }
            sellerLocations.forEach(s => {
                bounds.extend(s);
                hasPoints = true;
            });
            bounds.extend(customerLocation);
            hasPoints = true;
        }

        if (hasPoints) {
            if (mapRef.current._setProgrammaticChange) {
                mapRef.current._setProgrammaticChange(true);
            }

            // If in full screen or only have delivery location, focus on delivery boy
            if (deliveryLocation && (isFullScreen || !showRoute)) {
                mapRef.current.panTo(deliveryLocation);
                if (!hasInitialBoundsFitted.current || isFullScreen) {
                    mapRef.current.setZoom(isFullScreen ? 17 : 15);
                    hasInitialBoundsFitted.current = true;
                }
            } else {
                // Fit to include everything (route + locations)
                mapRef.current.fitBounds(bounds, {
                    top: 50,
                    bottom: 50,
                    left: 50,
                    right: 50
                });
                hasInitialBoundsFitted.current = true;
            }

            if (mapRef.current._setProgrammaticChange) {
                setTimeout(() => mapRef.current._setProgrammaticChange(false), 500);
            }
        }
    }, [isLoaded, deliveryLocation, showRoute, routeOrigin, routeDestination, routeWaypoints, storeLocation, sellerLocations, customerLocation, userHasInteracted, isFullScreen]);

    const handleRecenter = () => {
        setUserHasInteracted(false);
        hasInitialBoundsFitted.current = false;
        if (mapRef.current) {
            if (deliveryLocation && (isFullScreen || !showRoute)) {
                mapRef.current.panTo(deliveryLocation);
                mapRef.current.setZoom(isFullScreen ? 17 : 15);
                hasInitialBoundsFitted.current = true;
            } else {
                const bounds = new window.google.maps.LatLngBounds();
                if (deliveryLocation) bounds.extend(deliveryLocation);
                if (showRoute && routeOrigin && routeDestination) {
                    bounds.extend(routeOrigin);
                    bounds.extend(routeDestination);
                    routeWaypoints.forEach(wp => bounds.extend(wp));
                } else {
                    if (storeLocation) bounds.extend(storeLocation);
                    sellerLocations.forEach(s => bounds.extend(s));
                    bounds.extend(customerLocation);
                }
                mapRef.current.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
                hasInitialBoundsFitted.current = true;
            }
        }
    };

    const toggleFullScreen = () => {
        setIsFullScreen(!isFullScreen);
        // Reset interaction/bounds to force re-fit in new size
        setUserHasInteracted(false);
        hasInitialBoundsFitted.current = false;
    };

    const onLoad = useCallback((map: any) => {
        mapRef.current = map

        // Track user interaction with the map (pan, zoom, drag)
        let isProgrammaticChange = false;

        const trackInteraction = () => {
            if (!isProgrammaticChange) {
                setUserHasInteracted(true);
            }
        };

        // Add event listeners to track user interaction
        map.addListener('dragstart', trackInteraction);
        map.addListener('zoom_changed', () => {
            if (!isProgrammaticChange) {
                setTimeout(() => {
                    if (!isProgrammaticChange) {
                        trackInteraction();
                    }
                }, 100);
            }
        });

        // Store the flag setter for use in route calculation
        map._setProgrammaticChange = (value: boolean) => {
            isProgrammaticChange = value;
        };
    }, [])

    // Calculate distance + ETA using Google Distance Matrix Service.
    // (Distance Matrix only needs its own API enabled, not Directions — and we only need the
    // distance/ETA numbers here; the actual line on the map is drawn as a straight Polyline below.)
    const calculateAndDisplayRoute = useCallback((origin: Location, destination: Location, waypoints: Location[] = []) => {
        if (!isLoaded || !window.google?.maps) {
            console.log('⚠️ Cannot calculate distance: map not loaded or not ready')
            return
        }

        // Validate origin and destination
        if (!origin || !destination || !origin.lat || !origin.lng || !destination.lat || !destination.lng) {
            console.log('⚠️ Cannot calculate distance: invalid origin or destination', { origin, destination })
            return
        }

        // Google Routes API is billed per request, so it is called sparingly: at most once a minute,
        // or sooner only when the rider has moved far (~300 m) or the destination changed. In between,
        // the distance is worked out for free from the last answer (same road-to-straight-line ratio
        // and speed), so the screen still updates smoothly.
        const now = Date.now()
        const last = lastRouteCalcRef.current
        const toRad = (d: number) => (d * Math.PI) / 180
        const straightMeters = (p: Location, q: Location) => {
            const dLat = toRad(q.lat - p.lat)
            const dLng = toRad(q.lng - p.lng)
            const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(p.lat)) * Math.cos(toRad(q.lat)) * Math.sin(dLng / 2) ** 2
            return 2 * 6371000 * Math.asin(Math.sqrt(h))
        }
        const fmtDuration = (seconds: number) => {
            const mins = Math.max(1, Math.ceil(seconds / 60))
            if (mins < 60) return `${mins} mins`
            return `${Math.floor(mins / 60)}h ${mins % 60}m`
        }
        const fmtDistance = (meters: number) => (meters < 1000 ? `${Math.round(meters)}m` : `${(meters / 1000).toFixed(1)} km`)
        const show = (meters: number, seconds: number) => {
            const total = seconds + 120 // 2-minute buffer
            setRouteError(null)
            setRouteInfo({ distance: fmtDistance(meters), duration: fmtDuration(total), durationValue: total, distanceValue: Math.round(meters) })
        }

        const sameDestination = !!last.destination && Math.abs(last.destination.lat - destination.lat) < 0.0001 && Math.abs(last.destination.lng - destination.lng) < 0.0001
        const movedFar = !!last.origin.lat && straightMeters(last.origin, origin) > 300
        const dueByTime = now - last.time >= 60000
        const needApiCall = !last.known || !sameDestination || dueByTime || movedFar

        if (!needApiCall) {
            // Free update from the last Routes answer: scale by the road/straight ratio and the speed it implied.
            const straightNow = straightMeters(origin, destination)
            const meters = straightNow * last.roadFactor
            show(meters, meters / last.metersPerSecond)
            return
        }

        lastRouteCalcRef.current = { ...last, time: now, origin: { ...origin }, destination: { ...destination } }
        const myCall = ++routeCallRef.current

        fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey || '',
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
            },
            body: JSON.stringify({
                origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
                destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
                travelMode: 'DRIVE',
            }),
        })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Routes API ${res.status}`))))
            .then((data) => {
                if (myCall !== routeCallRef.current) return // a newer calculation is running
                const route = data?.routes?.[0]
                const meters = Number(route?.distanceMeters)
                const seconds = parseInt(String(route?.duration || '').replace('s', ''), 10)
                if (!Number.isFinite(meters) || !Number.isFinite(seconds)) throw new Error('No route returned')
                const straight = Math.max(1, straightMeters(origin, destination))
                lastRouteCalcRef.current = {
                    time: Date.now(), origin: { ...origin }, destination: { ...destination }, known: true,
                    roadFactor: Math.max(1, meters / straight),
                    metersPerSecond: Math.max(1.5, meters / Math.max(1, seconds)),
                }
                show(meters, seconds)
            })
            .catch((err) => {
                if (myCall !== routeCallRef.current) return
                // Routes API refused (not enabled, key restriction, quota…): fall back to a straight-line estimate.
                console.warn('Routes API unavailable, using a straight-line estimate:', err?.message)
                const road = straightMeters(origin, destination) * 1.3 // roads are longer than the straight line
                show(road, road / (25000 / 3600)) // ~25 km/h average city speed
            })
    }, [isLoaded, apiKey])

    // Handle distance/ETA calculation when routeOrigin and routeDestination are provided
    useEffect(() => {
        if (showRoute && routeOrigin && routeDestination && isLoaded) {
            // Recalculate when origin or destination changes
            calculateAndDisplayRoute(routeOrigin, routeDestination, routeWaypoints)
        } else if (!showRoute) {
            setRouteInfo(null)
        }
    }, [showRoute, routeOrigin, routeDestination, routeWaypoints, isLoaded, calculateAndDisplayRoute])

    // Interpolation State
    const [animatedDeliveryLocation, setAnimatedDeliveryLocation] = useState<Location | undefined>(deliveryLocation);
    const animationRef = useRef<number>();
    const lastDeliveryLocationRef = useRef<Location | undefined>(deliveryLocation);

    // Center is only for initial load, we use panTo/fitBounds for updates
    const [initialCenter] = useState(center);

    // Animation Logic
    useEffect(() => {
        if (!deliveryLocation) return;

        // If no previous location, snap to current (initial load)
        if (!lastDeliveryLocationRef.current) {
            setAnimatedDeliveryLocation(deliveryLocation);
            lastDeliveryLocationRef.current = deliveryLocation;
            return;
        }

        // If location hasn't changed (deep check), do nothing
        if (deliveryLocation.lat === lastDeliveryLocationRef.current.lat &&
            deliveryLocation.lng === lastDeliveryLocationRef.current.lng) {
            return;
        }

        const startLocation = animatedDeliveryLocation || lastDeliveryLocationRef.current;
        const targetLocation = deliveryLocation;
        const startTime = performance.now();
        const duration = 3800; // Slightly less than 4s interval to ensure completion

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out slightly for more natural movement (optional, linear is fine for tracking)
            // const ease = 1 - Math.pow(1 - progress, 3);
            const ease = progress; // Linear for constant speed prediction

            const lat = startLocation.lat + (targetLocation.lat - startLocation.lat) * ease;
            const lng = startLocation.lng + (targetLocation.lng - startLocation.lng) * ease;

            setAnimatedDeliveryLocation({ lat, lng });

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            } else {
                lastDeliveryLocationRef.current = targetLocation;
            }
        };

        cancelAnimationFrame(animationRef.current!);
        animationRef.current = requestAnimationFrame(animate);

        // Update ref for next comparison
        lastDeliveryLocationRef.current = deliveryLocation;

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [deliveryLocation]);


    const containerClasses = isFullScreen
        ? "fixed inset-0 z-[100] bg-white w-screen h-screen flex flex-col"
        : "relative mx-4 mt-4 rounded-lg overflow-hidden shadow-sm";

    if (loadError) {
        return (
            <div className={containerClasses + " bg-red-50 border border-red-200 p-4 text-center"}>
                <p className="text-red-800 text-sm">❌ Failed to load Google Maps</p>
            </div>
        )
    }

    if (!isLoaded) {
        return (
            <div className={containerClasses + " bg-gray-100 p-8 text-center"}>
                <div className="animate-spin text-2xl">🗺️</div>
                <p className="text-gray-600 text-sm mt-2">Loading map...</p>
            </div>
        )
    }

    if (!apiKey) {
        return (
            <div className={containerClasses + " bg-neutral-50 border border-neutral-200 p-6 text-center flex flex-col items-center justify-center gap-2"}>
                <span className="text-2xl">🛵</span>
                <p className="text-neutral-800 text-sm font-semibold">Live order updates active</p>
                <p className="text-neutral-500 text-xs">Live map preview is currently paused. Track your delivery status directly above.</p>
            </div>
        )
    }

    return (
        <div className={containerClasses}>
            {/* Map UI Overlays */}
            <div className={`absolute ${isFullScreen ? 'left-6 top-6' : 'left-3 top-3'} flex flex-col gap-2 z-10`}>
                {isTracking && (
                    <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-white bg-black/70 px-2 py-1 rounded text-sm font-medium">Live</span>
                    </div>
                )}

                {isGPSWeak && isTracking && (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold shadow-lg flex items-center gap-2"
                    >
                        <span className="animate-pulse">⚠️</span>
                        GPS Signal Weak
                    </motion.div>
                )}

                {routeInfo && isFullScreen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white p-3 rounded-lg shadow-xl border border-gray-100 min-w-[150px]"
                    >
                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider mb-1">Estimated Arrival</div>
                        <div className="flex items-end gap-2">
                            <span className="text-xl font-bold text-gray-900">{routeInfo.duration}</span>
                            <span className="text-sm text-gray-500 mb-0.5">({routeInfo.distance})</span>
                        </div>
                        {destinationName && (
                            <div className="text-xs text-blue-600 mt-1 font-medium truncate">
                                to {destinationName}
                            </div>
                        )}
                    </motion.div>
                )}
            </div>

            <div className={`absolute ${isFullScreen ? 'right-6 top-6' : 'right-3 top-3'} flex flex-col gap-2 z-10`}>
                <button
                    onClick={toggleFullScreen}
                    className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
                    title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                >
                    {isFullScreen ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                    )}
                </button>
                <button
                    onClick={handleRecenter}
                    className="p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
                    title="Recenter"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 12h3m12 0h3M12 3v3m0 12v3"/></svg>
                </button>
            </div>

            {routeError && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-full text-xs font-medium shadow-lg flex items-center gap-2">
                        <span>⚠️</span>
                        {routeError}
                    </div>
                </div>
            )}

            {/* Warning when customer location is missing */}
            {isTracking && (!customerLocation || customerLocation.lat === 0) && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 w-max max-w-[90%]">
                    <div className="bg-orange-50 border border-orange-200 text-orange-800 px-4 py-3 rounded-lg text-xs font-medium shadow-lg flex flex-col items-center gap-1 text-center">
                        <div className="flex items-center gap-2">
                             <span>📍</span>
                             <span className="font-bold">Location Unavailable</span>
                        </div>
                        <span>Customer hasn't pinned their location.</span>
                        <span className="text-orange-600/80 text-[10px]">Please rely on the written address.</span>
                    </div>
                </div>
            )}

            <GoogleMap
                mapContainerStyle={isFullScreen ? { width: '100%', height: '100%' } : mapContainerStyle}
                center={initialCenter}
                zoom={13}
                onLoad={onLoad}
                options={{
                    zoomControl: false,
                    streetViewControl: false,
                    mapTypeControl: false,
                    fullscreenControl: false,
                    disableDefaultUI: true,
                    styles: [
                        {
                            featureType: "poi",
                            elementType: "labels",
                            stylers: [{ visibility: "off" }]
                        }
                    ]
                }}
            >
                {/* Customer Marker */}
                {/* Customer Marker - Only show if valid location */}
                {customerLocation && (customerLocation.lat !== 0 || customerLocation.lng !== 0) && (
                <Marker
                    position={customerLocation}
                    icon={{
                        url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="8" y="32" font-size="32">📍</text></svg>')}`,
                        scaledSize: window.google?.maps?.Size ? new window.google.maps.Size(40, 40) : undefined
                    } as any}
                    title="Delivery Address"
                />
                )}

                {/* Seller Markers */}
                {allSellers.map((seller, index) => (
                    <Marker
                        key={`seller-${index}`}
                        position={seller}
                        icon={showRoute && routeDestination?.lat === seller.lat ? {
                            path: window.google?.maps?.SymbolPath?.CIRCLE || 0,
                            scale: 10,
                            fillColor: '#ef4444',
                            fillOpacity: 1,
                            strokeWeight: 3,
                            strokeColor: '#ffffff',
                        } : {
                            url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><text x="8" y="32" font-size="32">🏪</text></svg>')}`,
                            scaledSize: window.google?.maps?.Size ? new window.google.maps.Size(40, 40) : undefined
                        } as any}
                        title={seller.name || "Seller Shop"}
                    />
                ))}

                {/* Delivery Partner Marker (Animated) */}
                {animatedDeliveryLocation && (
                    <Marker
                        position={animatedDeliveryLocation}
                        icon={{
                            url: getDeliveryIconUrl(),
                            scaledSize: window.google?.maps?.Size ? new window.google.maps.Size(60, 60) : undefined,
                            anchor: window.google?.maps?.Point ? new window.google.maps.Point(30, 30) : undefined
                        } as any}
                        title="Delivery Partner"
                    />
                )}
                {/* Straight-line path — Distance Matrix gives distance/ETA numbers but not road
                    geometry, so this line is always what's drawn on the map. */}
                <Polyline
                    path={path}
                    options={{
                        strokeColor: routeError ? '#ef4444' : '#16a34a',
                        strokeOpacity: 0.7,
                        strokeWeight: 4,
                        geodesic: true,
                    }}
                />
            </GoogleMap>
        </div>
    )
}

