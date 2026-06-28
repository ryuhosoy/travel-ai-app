/**
 * LockTrip Hotel Booking MCP API
 * @see https://locktrip.com/ja/agents/docs
 */

const LOCKTRIP_BASE = "https://locktrip.com/mcp/tools";
const LOCKTRIP_SITE = "https://locktrip.com/ja";
const API_CURRENCY = "USD";
const DISPLAY_CURRENCY = "JPY";
const USD_TO_JPY = Number(process.env.LOCKTRIP_USD_JPY_RATE || 150);
const POLL_INTERVAL_MS = 2000;
const INITIAL_WAIT_MS = 2000;
const MAX_POLL_ATTEMPTS = 15;

export interface HotelSearchParams {
  checkin: string;
  checkout: string;
  adults?: number;
  rooms?: number;
  /** 目的地名（英語推奨。search_location に使用） */
  destination: string;
  max?: number;
}

export interface HotelOffer {
  id: string;
  name: string;
  price: number;
  currency: string;
  priceFormatted: string;
  url: string;
  starRating?: number;
  image?: string;
}

interface LocktripLocation {
  id: string;
  name: string;
  type: string;
  fullName: string;
  country?: string;
}

interface LocktripHotel {
  hotelId: string;
  name: string;
  starRating?: number;
  minPrice: number;
  currency: string;
  images?: string[];
  reviewScore?: number;
}

interface SearchLocationResponse {
  locations: LocktripLocation[];
  totalCount: number;
}

interface HotelSearchResponse {
  searchKey: string;
  sessionId?: string;
  status: string;
}

interface SearchResultsResponse {
  hotels: LocktripHotel[];
  totalCount: number;
  searchStatus: string;
  hasMore?: boolean;
}

async function locktripRequest<T>(tool: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${LOCKTRIP_BASE}/${tool}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LockTrip API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 検索系は API キー不要で常に利用可能 */
export function isLocktripConfigured(): boolean {
  return true;
}

export function formatHotelPrice(amount: number, currency: string): string {
  const num = Math.round(amount);
  if (currency === "JPY") {
    return "¥" + num.toLocaleString("ja-JP");
  }
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency,
    }).format(num);
  } catch {
    return `${currency} ${num.toLocaleString("ja-JP")}`;
  }
}

function usdToJpy(amount: number): number {
  return Math.round(amount * USD_TO_JPY);
}

function locationToSlug(fullName: string): string {
  return fullName
    .toLowerCase()
    .replace(/,\s*/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http")) return url;
  return `https://imagecontent.net${url.startsWith("/") ? "" : "/"}${url}`;
}

export function buildLocktripSearchUrl(params: {
  destination: string;
  checkin: string;
  checkout: string;
  adults?: number;
}): string {
  const slug = locationToSlug(params.destination);
  const query = new URLSearchParams({
    checkIn: params.checkin,
    checkOut: params.checkout,
    adults: String(params.adults || 2),
    rooms: "1",
  });
  return `${LOCKTRIP_SITE}/hotels/${slug}?${query.toString()}`;
}

export function buildLocktripHotelUrl(params: {
  hotelId: string;
  checkin: string;
  checkout: string;
}): string {
  const query = new URLSearchParams({
    checkIn: params.checkin,
    checkOut: params.checkout,
  });
  return `${LOCKTRIP_SITE}/hotel/${params.hotelId}?${query.toString()}`;
}

async function searchLocation(query: string): Promise<LocktripLocation | null> {
  const response = await locktripRequest<SearchLocationResponse>("search_location", {
    query,
    language: "en",
  });

  if (!response.locations?.length) return null;

  const city =
    response.locations.find((loc) => loc.type === "CITY") || response.locations[0];
  return city;
}

async function startHotelSearch(params: {
  regionId: string;
  checkin: string;
  checkout: string;
  adults: number;
  rooms: number;
}): Promise<string> {
  const response = await locktripRequest<HotelSearchResponse>("hotel_search", {
    regionId: params.regionId,
    startDate: params.checkin,
    endDate: params.checkout,
    currency: API_CURRENCY,
    rooms: Array.from({ length: params.rooms }, () => ({ adults: params.adults })),
    nationality: "JP",
  });

  if (!response.searchKey) {
    throw new Error("LockTrip hotel_search did not return searchKey");
  }

  return response.searchKey;
}

async function pollSearchResults(
  searchKey: string,
  max: number
): Promise<LocktripHotel[]> {
  await sleep(INITIAL_WAIT_MS);

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await locktripRequest<SearchResultsResponse>("get_search_results", {
      searchKey,
      page: 0,
      size: Math.min(max, 100),
      sortBy: "PRICE_ASC",
      currency: API_CURRENCY,
    });

    if (response.searchStatus === "COMPLETED" || (response.hotels?.length ?? 0) > 0) {
      return response.hotels || [];
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return [];
}

function mapHotel(
  hotel: LocktripHotel,
  checkin: string,
  checkout: string
): HotelOffer | null {
  if (!hotel.minPrice || hotel.minPrice <= 0) return null;

  const priceJpy = usdToJpy(hotel.minPrice);

  return {
    id: hotel.hotelId,
    name: hotel.name,
    price: priceJpy,
    currency: DISPLAY_CURRENCY,
    priceFormatted: formatHotelPrice(priceJpy, DISPLAY_CURRENCY),
    url: buildLocktripHotelUrl({ hotelId: hotel.hotelId, checkin, checkout }),
    starRating: hotel.starRating,
    image: normalizeImageUrl(hotel.images?.[0]),
  };
}

/**
 * search_location → hotel_search → get_search_results のフルフロー
 */
export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  if (!params.destination?.trim()) {
    throw new Error("destination is required for hotel search");
  }

  const location = await searchLocation(params.destination.trim());
  if (!location) {
    throw new Error(`Location not found: ${params.destination}`);
  }

  const adults = params.adults || 2;
  const rooms = params.rooms || 1;
  const max = params.max || 10;

  const searchKey = await startHotelSearch({
    regionId: location.id,
    checkin: params.checkin,
    checkout: params.checkout,
    adults,
    rooms,
  });

  const hotels = await pollSearchResults(searchKey, max);

  return hotels
    .map((h) => mapHotel(h, params.checkin, params.checkout))
    .filter((h): h is HotelOffer => h !== null)
    .sort((a, b) => a.price - b.price)
    .slice(0, max);
}

/** 最安ホテル1件を取得（失敗時は null） */
export async function searchCheapestHotel(
  params: HotelSearchParams
): Promise<HotelOffer | null> {
  try {
    const hotels = await searchHotels({ ...params, max: 1 });
    return hotels[0] || null;
  } catch {
    return null;
  }
}
