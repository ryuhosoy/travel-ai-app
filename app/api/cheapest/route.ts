import { NextRequest, NextResponse } from "next/server";
import { flightInspiration } from "@/lib/ignav";
import { DEPARTURE_IATA } from "@/lib/iata";
import {
  buildLocktripSearchUrl,
  buildSkyscannerUrl,
  searchCheapestHotel,
  estimateHotelCost,
  getCityEn,
} from "@/lib/booking";

const IATA_INFO: Record<string, { city: string; country: string; emoji: string; highlight: string }> = {
  BKK: { city: "バンコク", country: "タイ", emoji: "🇹🇭", highlight: "屋台グルメと寺院巡り" },
  TPE: { city: "台北", country: "台湾", emoji: "🇹🇼", highlight: "夜市とグルメの宝庫" },
  SEL: { city: "ソウル", country: "韓国", emoji: "🇰🇷", highlight: "K-POP聖地と絶品料理" },
  ICN: { city: "ソウル", country: "韓国", emoji: "🇰🇷", highlight: "K-POP聖地と絶品料理" },
  HKG: { city: "香港", country: "中国", emoji: "🇭🇰", highlight: "東洋と西洋が融合する都市" },
  SIN: { city: "シンガポール", country: "シンガポール", emoji: "🇸🇬", highlight: "清潔で安全なアジアの要" },
  DPS: { city: "バリ島", country: "インドネシア", emoji: "🇮🇩", highlight: "神々の島でリゾート体験" },
  HAN: { city: "ハノイ", country: "ベトナム", emoji: "🇻🇳", highlight: "フォーと歴史ある旧市街" },
  SGN: { city: "ホーチミン", country: "ベトナム", emoji: "🇻🇳", highlight: "活気ある南国の商都" },
  KUL: { city: "クアラルンプール", country: "マレーシア", emoji: "🇲🇾", highlight: "多民族文化とグルメ" },
  MNL: { city: "マニラ", country: "フィリピン", emoji: "🇵🇭", highlight: "島々へのゲートウェイ" },
  CDG: { city: "パリ", country: "フランス", emoji: "🇫🇷", highlight: "芸術と美食の都" },
  LHR: { city: "ロンドン", country: "イギリス", emoji: "🇬🇧", highlight: "歴史と文化の宝庫" },
  FCO: { city: "ローマ", country: "イタリア", emoji: "🇮🇹", highlight: "永遠の都で歴史を体感" },
  BCN: { city: "バルセロナ", country: "スペイン", emoji: "🇪🇸", highlight: "ガウディ建築と地中海" },
  HNL: { city: "ホノルル", country: "ハワイ", emoji: "🌺", highlight: "太平洋の楽園ビーチ" },
  LAX: { city: "ロサンゼルス", country: "アメリカ", emoji: "🇺🇸", highlight: "エンタメの聖地LA" },
  SYD: { city: "シドニー", country: "オーストラリア", emoji: "🇦🇺", highlight: "オペラハウスと大自然" },
  DXB: { city: "ドバイ", country: "UAE", emoji: "🇦🇪", highlight: "砂漠の超近代都市" },
  IST: { city: "イスタンブール", country: "トルコ", emoji: "🇹🇷", highlight: "東西文明の交差点" },
  SHA: { city: "上海", country: "中国", emoji: "🇨🇳", highlight: "近代と伝統が混在する大都市" },
  AKL: { city: "オークランド", country: "ニュージーランド", emoji: "🇳🇿", highlight: "大自然とワインの国" },
};

async function resolveHotelForDestination(
  city: string,
  checkin: string,
  checkout: string,
  nights: number
): Promise<{ hotelPrice: number; hotelUrl: string; usedRealHotel: boolean }> {
  const destination = getCityEn(city);
  const hotel = await searchCheapestHotel({
    destination,
    checkin,
    checkout,
    adults: 2,
  });
  if (hotel) {
    return { hotelPrice: hotel.price, hotelUrl: hotel.url, usedRealHotel: true };
  }
  return {
    hotelPrice: estimateHotelCost(nights),
    hotelUrl: buildLocktripSearchUrl({ destination, checkin, checkout }),
    usedRealHotel: false,
  };
}

function parseAiJsonArray(text: string): Record<string, unknown>[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response did not contain a JSON array");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>[];
}

function buildFallbackDestinations(
  originIata: string,
  checkin: string,
  checkout: string,
  nights: number
): Record<string, unknown>[] {
  const picks = ["BKK", "TPE", "HAN", "MNL", "SGN", "KUL"] as const;
  return picks.map((iata) => {
    const info = IATA_INFO[iata];
    const flightPrice = estimateHotelCost(nights, 12000);
    const hotelPrice = estimateHotelCost(nights);
    return {
      city: info.city,
      country: info.country,
      emoji: info.emoji,
      highlight: info.highlight,
      iata,
      flightPrice,
      hotelPrice,
      estimatedTotal: flightPrice + hotelPrice,
      departureDate: checkin,
      returnDate: checkout,
      flightUrl: buildSkyscannerUrl({
        from: originIata,
        to: iata,
        depart: checkin,
        return: checkout,
      }),
      hotelUrl: buildLocktripSearchUrl({
        destination: getCityEn(info.city),
        checkin,
        checkout,
      }),
    };
  });
}

async function fetchAiDestinations(
  departure: string,
  month: string,
  nights: string,
  originIata: string,
  checkin: string,
  checkout: string,
  nightCount: number
): Promise<Record<string, unknown>[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `旅行目的地を提案するAIです。JSON配列のみを返してください。説明文は不要です。

[{
  "city": "都市名（日本語）",
  "country": "国名",
  "emoji": "国旗絵文字1文字",
  "highlight": "魅力12文字以内",
  "iata": "空港IATAコード",
  "flightPrice": 35000,
  "hotelPrice": 60000
}]

6都市を安い順に。flightPrice/hotelPriceは円の数値のみ。`,
      messages: [{
        role: "user",
        content: `出発地: ${departure}、時期: ${month}、泊数: ${nights}泊`,
      }],
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(data.error.message || "Anthropic API error");
  }

  const text = data.content?.[0]?.text || "[]";
  const raw = parseAiJsonArray(text);

  return raw.map((item) => {
    const iata = String(item.iata || "");
    const flightPrice = Math.round(Number(item.flightPrice || 0));
    const hotelPrice = Math.round(Number(item.hotelPrice || estimateHotelCost(nightCount)));
    const cityEn = getCityEn(String(item.city || iata));
    return {
      city: item.city,
      country: item.country,
      emoji: item.emoji,
      highlight: item.highlight,
      iata,
      flightPrice,
      hotelPrice,
      estimatedTotal: flightPrice + hotelPrice,
      departureDate: checkin,
      returnDate: checkout,
      flightUrl: buildSkyscannerUrl({
        from: originIata,
        to: iata,
        depart: checkin,
        return: checkout,
      }),
      hotelUrl: buildLocktripSearchUrl({
        destination: cityEn,
        checkin,
        checkout,
      }),
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    const { departure, month, nights } = await req.json();
    const originIata = DEPARTURE_IATA[departure] || "KIX";
    const nightCount = Number(nights || 4);

    let destinations: Record<string, unknown>[] = [];
    let usedRealData = false;
    let usedRealHotels = false;

    const checkin = month ? `${month}-15` : new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const checkout = new Date(new Date(checkin).getTime() + nightCount * 86400000).toISOString().split("T")[0];

    try {
      const inspirations = await flightInspiration(originIata, {
        destinations: Object.keys(IATA_INFO),
        month,
        nights: nightCount,
      });
      usedRealData = inspirations.length > 0;

      for (const item of inspirations) {
        const iata = item.destination;
        const info = IATA_INFO[iata] || {
          city: iata, country: "Unknown", emoji: "✈️", highlight: "魅力的な目的地",
        };
        const flightPrice = Math.round(Number(item.price.total));
        const { hotelPrice, hotelUrl, usedRealHotel } = await resolveHotelForDestination(
          info.city,
          item.departureDate || checkin,
          item.returnDate || checkout,
          nightCount
        );
        if (usedRealHotel) usedRealHotels = true;

        destinations.push({
          city: info.city,
          country: info.country,
          emoji: info.emoji,
          highlight: info.highlight,
          iata,
          flightPrice,
          hotelPrice,
          estimatedTotal: flightPrice + hotelPrice,
          departureDate: item.departureDate,
          returnDate: item.returnDate,
          flightUrl:
            item.flightUrl ||
            buildSkyscannerUrl({
              from: originIata,
              to: iata,
              depart: item.departureDate,
              return: item.returnDate,
            }),
          hotelUrl,
        });
      }
    } catch {
      // Ignav API が失敗した場合は AI にフォールバック
    }

    if (destinations.length === 0) {
      try {
        destinations = await fetchAiDestinations(
          departure,
          month,
          nights,
          originIata,
          checkin,
          checkout,
          nightCount
        );
      } catch {
        destinations = buildFallbackDestinations(originIata, checkin, checkout, nightCount);
      }
    }

    return NextResponse.json({ destinations, usedRealData, usedRealHotels });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
