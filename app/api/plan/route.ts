import { NextRequest, NextResponse } from "next/server";
import { generateTravelPlan } from "@/lib/claude";
import { searchFlights, formatPrice } from "@/lib/ignav";
import { getIataCode } from "@/lib/iata";
import {
  buildLocktripSearchUrl,
  buildSkyscannerUrl,
  getCityEn,
  searchHotels,
  nightsBetween,
} from "@/lib/booking";

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();

    const plan = await generateTravelPlan({ message });

    // Ignav API でフライト検索
    let cheapestFlight = null;
    let flightOffers: Awaited<ReturnType<typeof searchFlights>> = [];
    let flightSearchError = null;

    try {
      const destIata = plan.destinationIata || getIataCode(plan.destination);
      if (destIata && plan.departureDate) {
        const offers = await searchFlights({
          origin: "KIX",
          destination: destIata,
          departureDate: plan.departureDate,
          returnDate: plan.returnDate || undefined,
          adults: plan.adults || 1,
          max: 5,
        });
        flightOffers = offers;
        if (offers.length > 0) {
          cheapestFlight = offers[0];
          const realPrice = Math.round(cheapestFlight.price);
          plan.costs.flight = realPrice;
          plan.costs.total = realPrice + plan.costs.hotel + plan.costs.activities + plan.costs.food;
        }
      }
    } catch (e: unknown) {
      flightSearchError = e instanceof Error ? e.message : "Flight search failed";
    }

    const destIataForLink = plan.destinationIata || getIataCode(plan.destination) || "CDG";
    const cityEn = getCityEn(plan.destination);

    const flightUrl =
      flightOffers[0]?.bookingUrl ||
      buildSkyscannerUrl({
        from: "KIX",
        to: destIataForLink,
        depart: plan.departureDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        return: plan.returnDate,
        adults: plan.adults || 1,
      });

    // LockTrip API でホテル検索
    let hotels: Awaited<ReturnType<typeof searchHotels>> = [];
    let hotelUrl = buildLocktripSearchUrl({
      destination: cityEn,
      checkin: plan.departureDate,
      checkout: plan.returnDate,
      adults: plan.adults || 2,
    });
    let hotelSearchError: string | null = null;
    let hasRealHotels = false;

    if (plan.departureDate && plan.returnDate) {
      try {
        hotels = await searchHotels({
          destination: cityEn,
          checkin: plan.departureDate,
          checkout: plan.returnDate,
          adults: plan.adults || 2,
          max: 5,
        });
        if (hotels.length > 0) {
          hasRealHotels = true;
          hotelUrl = buildLocktripSearchUrl({
            destination: cityEn,
            checkin: plan.departureDate,
            checkout: plan.returnDate,
            adults: plan.adults || 2,
          });
          plan.costs.hotel = hotels[0].price;
          plan.costs.total =
            plan.costs.flight + plan.costs.hotel + plan.costs.activities + plan.costs.food;
        }
      } catch (e: unknown) {
        hotelSearchError = e instanceof Error ? e.message : "Hotel search failed";
      }
    }

    const flights = flightOffers.slice(0, 3).map((offer) => ({
      airline: offer.airline,
      flightNo: offer.flightNo,
      departure: offer.departure,
      arrival: offer.arrival,
      departureTime: offer.departureTime,
      arrivalTime: offer.arrivalTime,
      duration: offer.duration,
      price: formatPrice(offer.price, offer.currency),
      priceRaw: Math.round(offer.price),
      seats: offer.seats,
    }));

    const hotelCards = hotels.slice(0, 3).map((h) => ({
      id: h.id,
      name: h.name,
      price: h.priceFormatted,
      priceRaw: h.price,
      url: h.url,
    }));

    return NextResponse.json({
      plan,
      flights,
      hotels: hotelCards,
      flightUrl,
      hotelUrl,
      flightSearchError,
      hotelSearchError,
      hasRealFlights: flights.length > 0,
      hasRealHotels,
      nights: nightsBetween(plan.departureDate, plan.returnDate),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "プランの生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
