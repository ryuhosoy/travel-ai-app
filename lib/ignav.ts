/**
 * Ignav Flight API
 * @see https://ignav.com/docs
 */

const IGNAV_BASE = "https://ignav.com";
const DEFAULT_MARKET = "JP";

const PLACEHOLDER_KEYS = new Set(["", "your_ignav_api_key"]);

/** 都市コード → 主要国際空港 */
const METRO_AIRPORT: Record<string, string> = {
  TYO: "NRT",
  PAR: "CDG",
  LON: "LHR",
  NYC: "JFK",
  ROM: "FCO",
  SEL: "ICN",
  BJS: "PEK",
  SHA: "PVG",
};

let apiKeyStatusLogged = false;

interface IgnavPrice {
  amount: number;
  currency: string;
}

interface IgnavSegment {
  marketing_carrier_code?: string | null;
  flight_number?: string | null;
  operating_carrier_name?: string | null;
  departure_airport: string;
  departure_time_local: string;
  arrival_airport: string;
  arrival_time_local: string;
  duration_minutes: number;
}

interface IgnavLeg {
  carrier?: string | null;
  duration_minutes?: number | null;
  segments: IgnavSegment[];
}

interface IgnavItinerary {
  price: IgnavPrice;
  outbound: IgnavLeg;
  inbound?: IgnavLeg | null;
  cabin_class?: string | null;
  ignav_id: string;
}

interface FareSearchResponse {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string | null;
  itineraries: IgnavItinerary[];
}

interface BookingLinksResponse {
  booking_options: Array<{
    legs: string[];
    links: Array<{
      provider_name: string;
      url: string;
      provider_type: string;
      price?: IgnavPrice | null;
    }>;
  }>;
}

export function isIgnavConfigured(): boolean {
  const key = process.env.IGNAV_API_KEY;
  return Boolean(key && !PLACEHOLDER_KEYS.has(key));
}

function logApiKeyStatus(key: string | undefined): void {
  if (apiKeyStatusLogged) return;
  apiKeyStatusLogged = true;

  if (!key) {
    console.log("[Ignav] IGNAV_API_KEY: not set");
    return;
  }
  if (PLACEHOLDER_KEYS.has(key)) {
    console.log("[Ignav] IGNAV_API_KEY: placeholder value");
    return;
  }

  const masked = `${key.slice(0, 10)}...${key.slice(-4)}`;
  console.log(`[Ignav] IGNAV_API_KEY: set (${masked})`);
}

function normalizeAirport(code: string): string {
  const upper = code.toUpperCase();
  return METRO_AIRPORT[upper] || upper;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(minutes?: number | null): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}時間${m}分`;
}

export function formatJPY(amount: string | number): string {
  return "¥" + Math.round(Number(amount)).toLocaleString("ja-JP");
}

export function formatPrice(amount: string | number, currency: string): string {
  const num = Math.round(Number(amount));
  if (currency === "JPY") return formatJPY(num);
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString("ja-JP")}`;
  }
}

async function ignavRequest<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const key = process.env.IGNAV_API_KEY;
  logApiKeyStatus(key);
  if (!key || PLACEHOLDER_KEYS.has(key)) {
    throw new Error("IGNAV_API_KEY is not set");
  }

  const res = await fetch(`${IGNAV_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": key,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } }).error?.message ||
      `Ignav API error (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

async function fetchBookingUrl(ignavId: string, market = DEFAULT_MARKET): Promise<string | null> {
  try {
    const data = await ignavRequest<BookingLinksResponse>("/api/fares/booking-links", {
      ignav_id: ignavId,
      market,
    });
    for (const option of data.booking_options || []) {
      const link = option.links?.[0];
      if (link?.url) return link.url;
    }
    return null;
  } catch {
    return null;
  }
}

export interface FlightOffer {
  id: string;
  price: number;
  currency: string;
  airline: string;
  flightNo: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  seats: number;
  bookingUrl?: string;
}

function mapItinerary(
  itinerary: IgnavItinerary,
  origin: string,
  destination: string
): FlightOffer | null {
  const segments = itinerary.outbound?.segments;
  if (!segments?.length) return null;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const airline = first.marketing_carrier_code || itinerary.outbound.carrier || "—";

  return {
    id: itinerary.ignav_id,
    price: itinerary.price.amount,
    currency: itinerary.price.currency,
    airline,
    flightNo: `${first.marketing_carrier_code || ""}${first.flight_number || ""}`,
    departure: first.departure_airport || origin,
    arrival: last.arrival_airport || destination,
    departureTime: formatTime(first.departure_time_local),
    arrivalTime: formatTime(last.arrival_time_local),
    duration: formatMinutes(itinerary.outbound.duration_minutes),
    seats: 0,
  };
}

async function searchItineraries(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
}): Promise<IgnavItinerary[]> {
  const origin = normalizeAirport(params.origin);
  const destination = normalizeAirport(params.destination);
  const body: Record<string, unknown> = {
    origin,
    destination,
    departure_date: params.departureDate,
    adults: params.adults || 1,
    cabin_class: "economy",
    market: DEFAULT_MARKET,
  };

  const path = params.returnDate ? "/api/fares/round-trip" : "/api/fares/one-way";
  if (params.returnDate) body.return_date = params.returnDate;

  const response = await ignavRequest<FareSearchResponse>(path, body);
  return response.itineraries || [];
}

export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  max?: number;
}): Promise<FlightOffer[]> {
  const itineraries = await searchItineraries(params);
  const max = params.max || 5;

  const sorted = [...itineraries].sort((a, b) => a.price.amount - b.price.amount).slice(0, max);

  const offers = sorted
    .map((it) => mapItinerary(it, params.origin, params.destination))
    .filter((o): o is FlightOffer => o !== null);

  await Promise.all(
    offers.map(async (offer) => {
      offer.bookingUrl = (await fetchBookingUrl(offer.id)) || undefined;
    })
  );

  return offers;
}

export interface FlightDestination {
  destination: string;
  departureDate: string;
  returnDate: string;
  price: { total: string; currency: string };
  flightUrl?: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

const INSPIRATION_BATCH_SIZE = 4;

export async function flightInspiration(
  origin: string,
  options: {
    destinations: string[];
    month?: string;
    nights?: number;
  }
): Promise<FlightDestination[]> {
  const nights = options.nights || 4;
  const departureDate = options.month
    ? `${options.month}-15`
    : new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const returnDate = addDays(departureDate, nights);

  const uniqueDestinations = [
    ...new Set(options.destinations.filter((d) => d !== origin)),
  ];

  const results: FlightDestination[] = [];

  for (let i = 0; i < uniqueDestinations.length; i += INSPIRATION_BATCH_SIZE) {
    const batch = uniqueDestinations.slice(i, i + INSPIRATION_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (destination) => {
        try {
          const offers = await searchFlights({
            origin,
            destination,
            departureDate,
            returnDate,
            adults: 1,
            max: 1,
          });
          if (offers.length === 0) return null;
          const cheapest = offers[0];
          const result: FlightDestination = {
            destination: cheapest.arrival || destination,
            departureDate,
            returnDate,
            price: {
              total: String(cheapest.price),
              currency: cheapest.currency,
            },
          };
          if (cheapest.bookingUrl) result.flightUrl = cheapest.bookingUrl;
          return result;
        } catch {
          return null;
        }
      })
    );
    results.push(...batchResults.filter((r): r is FlightDestination => r !== null));
  }

  return results
    .sort((a, b) => Number(a.price.total) - Number(b.price.total))
    .slice(0, 6);
}
