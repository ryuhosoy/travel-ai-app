// LockTrip ホテル検索 + リンク生成
// API: https://locktrip.com/ja/agents/docs

export {
  searchHotels,
  searchCheapestHotel,
  isLocktripConfigured,
  formatHotelPrice,
  buildLocktripSearchUrl,
  buildLocktripHotelUrl,
  type HotelOffer,
  type HotelSearchParams,
} from "./locktrip";

export function buildSkyscannerUrl(params: {
  from: string;
  to: string;
  depart: string;
  return?: string;
  adults?: number;
}): string {
  const depart = params.depart.replace(/-/g, "");
  const ret = params.return?.replace(/-/g, "") || "";
  const adults = params.adults || 1;
  const base = `https://www.skyscanner.jp/transport/flights/${params.from.toLowerCase()}/${params.to.toLowerCase()}/${depart}/${ret}/`;
  return `${base}?adults=${adults}&currency=jpy&locale=ja-JP`;
}

export const CITY_EN: Record<string, string> = {
  "パリ": "Paris", "ロンドン": "London", "ニューヨーク": "New York",
  "バンコク": "Bangkok", "台北": "Taipei", "ソウル": "Seoul",
  "香港": "Hong Kong", "シンガポール": "Singapore", "バリ島": "Bali",
  "バリ": "Bali", "ハノイ": "Hanoi", "ホーチミン": "Ho Chi Minh City",
  "クアラルンプール": "Kuala Lumpur", "上海": "Shanghai", "北京": "Beijing",
  "マニラ": "Manila", "ローマ": "Rome", "バルセロナ": "Barcelona",
  "アムステルダム": "Amsterdam", "フランクフルト": "Frankfurt",
  "ウィーン": "Vienna", "プラハ": "Prague", "ミラノ": "Milan",
  "マドリード": "Madrid", "チューリッヒ": "Zurich",
  "ハワイ": "Honolulu", "ロサンゼルス": "Los Angeles",
  "サンフランシスコ": "San Francisco", "シドニー": "Sydney",
  "メルボルン": "Melbourne", "ドバイ": "Dubai", "イスタンブール": "Istanbul",
  "オークランド": "Auckland",
};

export function getCityEn(jaName: string): string {
  if (CITY_EN[jaName]) return CITY_EN[jaName];
  for (const [key, val] of Object.entries(CITY_EN)) {
    if (jaName.includes(key)) return val;
  }
  return jaName;
}

/** 1泊あたりの見積もり（API 未使用時） */
export function estimateHotelCost(nights: number, perNight = 15000): number {
  return nights * perNight;
}

function nightsBetween(checkin: string, checkout: string): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

export { nightsBetween };
