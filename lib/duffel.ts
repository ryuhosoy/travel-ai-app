import { Duffel, DuffelError } from "@duffel/api";
import type { Offer } from "@duffel/api/types";

type SearchOffer = Omit<Offer, "available_services">;

let client: Duffel | null = null;

function getClient(): Duffel {
  if (!client) {
    const token = process.env.DUFFEL_ACCESS_TOKEN;
    if (!token) throw new Error("DUFFEL_ACCESS_TOKEN is not set");
    client = new Duffel({ token });
  }
  return client;
}

function handleDuffelError(e: unknown): never {
  if (e instanceof DuffelError) {
    const msg = e.errors.map((err) => err.message).join("; ");
    throw new Error(msg || "Duffel API error");
  }
  throw e;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

export function parseDuration(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return iso;
  const h = m[1] || "0";
  const min = m[2] || "0";
  return `${h}時間${min}分`;
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
}

function mapDuffelOffer(offer: SearchOffer): FlightOffer {
  const slice = offer.slices[0];
  const seg = slice?.segments[0];
  if (!seg) throw new Error("Invalid offer data");

  const airline =
    seg.operating_carrier.iata_code || seg.marketing_carrier.iata_code || "—";

  return {
    id: offer.id,
    price: Number(offer.total_amount),
    currency: offer.total_currency,
    airline,
    flightNo: `${seg.operating_carrier.iata_code || airline}${seg.operating_carrier_flight_number}`,
    departure: seg.origin.iata_code || "—",
    arrival: seg.destination.iata_code || "—",
    departureTime: formatTime(seg.departing_at),
    arrivalTime: formatTime(seg.arriving_at),
    duration: parseDuration(slice.duration || seg.duration),
    seats: 0,
  };
}

function buildPassengers(adults: number) {
  return Array.from({ length: adults }, () => ({ type: "adult" as const }));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

async function createOfferSearch(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
}): Promise<SearchOffer[]> {
  const slices = [
    {
      origin: params.origin,
      destination: params.destination,
      departure_date: params.departureDate,
      departure_time: null,
      arrival_time: null,
    },
  ];

  if (params.returnDate) {
    slices.push({
      origin: params.destination,
      destination: params.origin,
      departure_date: params.returnDate,
      departure_time: null,
      arrival_time: null,
    });
  }

  try {
    const response = await getClient().offerRequests.create({
      slices,
      passengers: buildPassengers(params.adults || 1),
      cabin_class: "economy",
      supplier_timeout: 15000,
    });

    return response.data.offers || [];
  } catch (e) {
    handleDuffelError(e);
  }
}

export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  max?: number;
}): Promise<FlightOffer[]> {
  const offers = await createOfferSearch(params);

  return offers
    .sort((a, b) => Number(a.total_amount) - Number(b.total_amount))
    .slice(0, params.max || 5)
    .map(mapDuffelOffer);
}

export interface FlightDestination {
  destination: string;
  departureDate: string;
  returnDate: string;
  price: { total: string; currency: string };
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
          return {
            destination: cheapest.arrival || destination,
            departureDate,
            returnDate,
            price: {
              total: String(cheapest.price),
              currency: cheapest.currency,
            },
          };
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
