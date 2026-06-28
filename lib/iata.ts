// 主要都市のIATAコードマッピング（日本出発 + 人気目的地）
export const AIRPORT_CODES: Record<string, string> = {
  // 日本
  "大阪": "KIX", "関西": "KIX", "KIX": "KIX", "ITM": "ITM",
  "東京": "TYO", "羽田": "HND", "成田": "NRT",
  "福岡": "FUK", "名古屋": "NGO", "札幌": "CTS", "那覇": "OKA",
  // アジア
  "パリ": "PAR", "ロンドン": "LON", "ニューヨーク": "NYC",
  "バンコク": "BKK", "台北": "TPE", "ソウル": "SEL", "香港": "HKG",
  "シンガポール": "SIN", "バリ": "DPS", "バリ島": "DPS",
  "ハノイ": "HAN", "ホーチミン": "SGN", "クアラルンプール": "KUL",
  "上海": "SHA", "北京": "BJS", "マニラ": "MNL",
  // ヨーロッパ
  "ローマ": "ROM", "バルセロナ": "BCN", "アムステルダム": "AMS",
  "フランクフルト": "FRA", "ウィーン": "VIE", "プラハ": "PRG",
  "ミラノ": "MXP", "マドリード": "MAD", "チューリッヒ": "ZRH",
  // 北米・オセアニア
  "ハワイ": "HNL", "ロサンゼルス": "LAX", "サンフランシスコ": "SFO",
  "バンクーバー": "YVR", "シドニー": "SYD", "メルボルン": "MEL",
  "オークランド": "AKL",
  // 中東・その他
  "ドバイ": "DXB", "イスタンブール": "IST",
};

export function getIataCode(city: string): string | null {
  // 直接マッチ
  if (AIRPORT_CODES[city]) return AIRPORT_CODES[city];
  // 部分マッチ
  for (const [key, code] of Object.entries(AIRPORT_CODES)) {
    if (city.includes(key) || key.includes(city)) return code;
  }
  return null;
}

export const DEPARTURE_IATA: Record<string, string> = {
  "大阪（KIX/ITM）": "KIX",
  "東京（HND/NRT）": "TYO",
  "福岡（FUK）": "FUK",
  "名古屋（NGO）": "NGO",
};
