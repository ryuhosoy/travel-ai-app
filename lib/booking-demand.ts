/**
 * Booking.com Demand API v3.1
 * @see https://developers.booking.com/demand/docs/open-api/demand-api
 * @see https://developers.booking.com/demand/docs/accommodations/accommodation-tutorial
 */

const PRODUCTION_BASE = "https://demandapi.booking.com/3.1";
const SANDBOX_BASE = "https://demandapi-sandbox.booking.com/3.1";

export interface HotelSearchParams {
  checkin: string;
  checkout: string;
  adults?: number;
  rooms?: number;
  /** IATA空港コード（例: BKK, CDG） */
  airport?: string;
  /** Booking.com city ID */
  city?: number;
  currency?: string;
  max?: number;
}

export interface HotelOffer {
  id: number;
  name: string;
  price: number;
  currency: string;
  priceFormatted: string;
  url: string;
}

interface DemandPriceBlock {
  total?: number | { booker_currency?: number; accommodation_currency?: number };
  display?: { booker_currency?: number; accommodation_currency?: number };
  book?: number;
}

interface DemandSearchItem {
  id: number;
  url?: string;
  deep_link_url?: string;
  currency?: { booker?: string; accommodation?: string };
  price?: DemandPriceBlock;
}

interface DemandSearchResponse {
  request_id?: string;
  data?: DemandSearchItem[];
  next_page?: string | null;
}

export function isDemandApiConfigured(): boolean {
  return !!(
    process.env.BOOKING_DEMAND_API_TOKEN &&
    process.env.BOOKING_AFFILIATE_ID &&
    process.env.BOOKING_AFFILIATE_ID !== "your_booking_affiliate_id"
  );
}

function getBaseUrl(): string {
  return process.env.BOOKING_DEMAND_SANDBOX === "true"
    ? SANDBOX_BASE
    : PRODUCTION_BASE;
}

function getAffiliateId(): number {
  const id = process.env.BOOKING_AFFILIATE_ID;
  if (!id) throw new Error("BOOKING_AFFILIATE_ID is not set");
  return Number(id);
}

async function demandRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.BOOKING_DEMAND_API_TOKEN;
  if (!token) throw new Error("BOOKING_DEMAND_API_TOKEN is not set");

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Affiliate-Id": String(getAffiliateId()),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Booking Demand API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<T>;
}

function extractPrice(item: DemandSearchItem): { amount: number; currency: string } {
  const currency = item.currency?.booker || item.currency?.accommodation || "JPY";
  const p = item.price;
  if (!p) return { amount: 0, currency };

  if (typeof p.total === "number") {
    return { amount: p.total, currency };
  }
  if (p.total?.booker_currency != null) {
    return { amount: p.total.booker_currency, currency };
  }
  if (p.display?.booker_currency != null) {
    return { amount: p.display.booker_currency, currency };
  }
  if (p.book != null) {
    return { amount: p.book, currency };
  }
  return { amount: 0, currency };
}

function nameFromBookingUrl(url: string): string {
  const match = url.match(/\/hotel\/[^/]+\/([^.]+)\.html/);
  if (!match) return "宿泊施設";
  return decodeURIComponent(match[1]).replace(/-/g, " ");
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

function mapSearchItem(item: DemandSearchItem): HotelOffer | null {
  if (!item.url) return null;
  const { amount, currency } = extractPrice(item);
  if (amount <= 0) return null;

  return {
    id: item.id,
    name: nameFromBookingUrl(item.url),
    price: Math.round(amount),
    currency,
    priceFormatted: formatHotelPrice(amount, currency),
    url: item.url,
  };
}

/**
 * POST /accommodations/search
 * 空港コードまたは city ID で宿泊施設を検索
 */
export async function searchHotels(params: HotelSearchParams): Promise<HotelOffer[]> {
  if (!params.airport && params.city == null) {
    throw new Error("airport or city is required for hotel search");
  }

  const body: Record<string, unknown> = {
    booker: {
      country: "jp",
      platform: "desktop",
      travel_purpose: "leisure",
    },
    checkin: params.checkin,
    checkout: params.checkout,
    currency: params.currency || "JPY",
    guests: {
      number_of_adults: params.adults || 2,
      number_of_rooms: params.rooms || 1,
    },
    rows: Math.min(params.max || 10, 30),
    extras: ["products"],
  };

  if (params.airport) body.airport = params.airport.toUpperCase();
  if (params.city != null) body.city = params.city;

  const response = await demandRequest<DemandSearchResponse>(
    "/accommodations/search",
    body
  );

  return (response.data || [])
    .map(mapSearchItem)
    .filter((h): h is HotelOffer => h !== null)
    .sort((a, b) => a.price - b.price)
    .slice(0, params.max || 10);
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
