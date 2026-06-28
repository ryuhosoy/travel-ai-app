export interface TravelPlanRequest {
  message: string;
  flightPrice?: number;
  flightInfo?: string;
}

export interface TravelPlan {
  destination: string;
  destinationEn: string;
  destinationIata: string;
  departureDate: string;
  returnDate: string;
  duration: string;
  adults: number;
  summary: string;
  itinerary: Array<{ day: number; title: string; description: string }>;
  costs: {
    flight: number;
    hotel: number;
    activities: number;
    food: number;
    total: number;
  };
  tips: string[];
}

export async function generateTravelPlan(req: TravelPlanRequest): Promise<TravelPlan> {
  const today = new Date().toISOString().split("T")[0];
  const systemPrompt = `あなたはプロの旅行プランナーAIです。ユーザーのリクエストを解析し、以下のJSON形式のみで旅行プランを返してください。マークダウンや説明文は不要です。JSONだけを返してください。

{
  "destination": "目的地（日本語）",
  "destinationEn": "目的地（英語、例: Paris）",
  "destinationIata": "最寄り空港IATAコード（例: CDG）",
  "departureDate": "出発日 YYYY-MM-DD形式",
  "returnDate": "帰国日 YYYY-MM-DD形式",
  "duration": "旅行期間（例: 5日間）",
  "adults": 大人人数（数値）,
  "summary": "プランの魅力を一言で（30文字以内）",
  "itinerary": [
    { "day": 1, "title": "日程タイトル", "description": "具体的な観光スポットや食事を含む詳細な説明" }
  ],
  "costs": {
    "flight": 航空券費用（往復、数値、円）,
    "hotel": ホテル費用（合計、数値、円）,
    "activities": 観光・体験費用（数値、円）,
    "food": 食費（数値、円）,
    "total": 合計（数値、円）
  },
  "tips": ["旅行のコツや注意点を3つ"]
}

今日の日付: ${today}
${req.flightPrice ? `実際の航空券最安値: ¥${req.flightPrice.toLocaleString()}（この価格を使ってください）` : ""}
${req.flightInfo ? `航空便情報: ${req.flightInfo}` : ""}

注意:
- 日程は出発日から帰国日まで全て埋めること
- コストは現実的な金額にすること
- 出発地が不明な場合は大阪（KIX）とすること
- 時期が不明な場合は来月とすること`;

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
      system: systemPrompt,
      messages: [{ role: "user", content: req.message }],
    }),
  });

  const data = await res.json();
  const text = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
  return JSON.parse(text);
}
