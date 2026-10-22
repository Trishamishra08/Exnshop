export interface DeliveryAddressInput {
  address?: string;
  street?: string;
  houseNo?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  latitude?: number;
  longitude?: number;
}

export interface FormattedAddressResult {
  formatted: string;
  cleanAddress: string;
  cityStatePincode: string;
  latitude?: number;
  longitude?: number;
  mapsUrl?: string;
}

/**
 * Cleanly formats a delivery address snapshot to avoid duplicate city, state, and pincode text.
 */
export function formatDeliveryAddress(
  deliveryAddress?: DeliveryAddressInput | null
): FormattedAddressResult {
  if (!deliveryAddress) {
    return {
      formatted: "N/A",
      cleanAddress: "N/A",
      cityStatePincode: "",
    };
  }

  const city = (deliveryAddress.city || "").trim();
  const state = (deliveryAddress.state || "").trim();
  const pincode = (deliveryAddress.pincode || "").trim();
  const rawAddress = (deliveryAddress.address || deliveryAddress.street || "").trim();

  // Clean up "Current Location, " prefix if present
  let cleanAddress = rawAddress.replace(/^Current Location,?\s*/i, "").trim();
  if (!cleanAddress) {
    cleanAddress = rawAddress || [city, state, pincode].filter(Boolean).join(", ");
  }

  // Check if city, state, or pincode are already in the cleanAddress string to prevent duplication
  const lowerClean = cleanAddress.toLowerCase();
  const extraParts: string[] = [];

  if (city && !lowerClean.includes(city.toLowerCase())) {
    extraParts.push(city);
  }
  if (state && !lowerClean.includes(state.toLowerCase())) {
    extraParts.push(state);
  }
  if (pincode && !lowerClean.includes(pincode)) {
    extraParts.push(pincode);
  }

  const parts = [cleanAddress];
  if (extraParts.length > 0) {
    parts.push(extraParts.join(", "));
  }

  const formatted = parts.filter(Boolean).join(", ");

  const lat = typeof deliveryAddress.latitude === "number" && !isNaN(deliveryAddress.latitude) ? deliveryAddress.latitude : undefined;
  const lng = typeof deliveryAddress.longitude === "number" && !isNaN(deliveryAddress.longitude) ? deliveryAddress.longitude : undefined;
  const mapsUrl = lat !== undefined && lng !== undefined ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : undefined;

  return {
    formatted,
    cleanAddress,
    cityStatePincode: [city, state, pincode].filter(Boolean).join(", "),
    latitude: lat,
    longitude: lng,
    mapsUrl,
  };
}

/**
 * The backend stores an address as one string, "<flat>, <street>". Splits it back for the
 * address form without losing anything: the first segment is the flat/house number and the
 * rest is the street, so joining them again gives the exact same string.
 */
export function splitSavedAddress(address?: string | null): { flat: string; street: string } {
  const text = (address || "").trim();
  const cut = text.indexOf(", ");
  if (cut < 0) return { flat: "", street: text };
  return { flat: text.slice(0, cut), street: text.slice(cut + 2) };
}

/** True when two coordinates are within `withinKm` of each other (default 1 km). */
export function isSamePlace(
  a: { latitude?: number; longitude?: number },
  b: { latitude?: number; longitude?: number },
  withinKm = 1
): boolean {
  if (
    typeof a.latitude !== "number" || typeof a.longitude !== "number" ||
    typeof b.latitude !== "number" || typeof b.longitude !== "number"
  ) {
    return false;
  }
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h)) <= withinKm;
}
