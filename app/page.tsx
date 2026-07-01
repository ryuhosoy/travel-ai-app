"use client";
import { useState } from "react";
import {
  Send, Plane, MapPin, Hotel, Ticket, ChevronRight,
  Loader2, Search, TrendingDown, Utensils, Info,
  ExternalLink, Clock, Users, CheckCircle2
} from "lucide-react";

type FlightOffer = {
  airline: string; flightNo: string; departure: string; arrival: string;
  departureTime: string; arrivalTime: string; duration: string;
  price: string; priceRaw: number; seats: number;
};
type TravelPlan = {
  destination: string; destinationEn: string; destinationIata: string;
  departureDate: string; returnDate: string; duration: string; adults: number;
  summary: string;
  itinerary: Array<{ day: number; title: string; description: string }>;
  costs: { flight: number; hotel: number; activities: number; food: number; total: number };
  tips: string[];
};
type HotelOffer = {
  id: string; name: string; price: string; priceRaw: number; url: string;
};
type PlanResult = {
  plan: TravelPlan; flights: FlightOffer[]; hotels: HotelOffer[];
  flightUrl: string; hotelUrl: string;
  hasRealFlights: boolean; hasRealHotels: boolean;
  flightSearchError?: string; hotelSearchError?: string; nights?: number;
};
type Destination = {
  city: string; country: string; emoji: string; highlight: string; iata: string;
  flightPrice: number; hotelPrice?: number; estimatedTotal: number;
  flightUrl: string; hotelUrl: string;
};

const QUICK_PROMPTS = [
  "来月バリ島に4泊5日、カップル旅行。予算30万",
  "夏休みにヨーロッパ周遊10日間、予算40万",
  "年末年始に台湾グルメ旅行、3泊4日、ひとり旅",
  "春休みにハワイ家族旅行1週間、大人2人子供2人",
];
const DEPARTURES = ["大阪（KIX/ITM）", "東京（HND/NRT）", "福岡（FUK）", "名古屋（NGO）"];

function fmt(n: number) { return "¥" + Math.round(n).toLocaleString("ja-JP"); }

// ---- Sub components ----

function HotelCard({ h }: { h: HotelOffer }) {
  return (
    <a href={h.url} target="_blank" rel="noopener noreferrer" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderRadius: 10,
      border: "1px solid var(--border)", background: "var(--surface)",
      textDecoration: "none", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "#FFF3E0",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}><Hotel size={16} color="#E65100" /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>{h.name}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>LockTrip</div>
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E65100" }}>{h.price}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>合計</div>
      </div>
    </a>
  );
}

function FlightCard({ f, url }: { f: FlightOffer; url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 16px", borderRadius: 10,
      border: "1px solid var(--border)", background: "var(--surface)",
      textDecoration: "none", gap: 12, transition: "box-shadow 0.15s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8, background: "var(--accent-light)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "var(--accent)",
        }}>{f.airline}</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{f.flightNo}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
            <Clock size={11} />{f.departureTime} → {f.arrivalTime} · {f.duration}
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{f.price}</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>残{f.seats}席</div>
      </div>
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, overflow: "hidden", marginBottom: 14,
    }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 15 }}>
        {title}
      </div>
      <div style={{ padding: "14px 20px" }}>{children}</div>
    </div>
  );
}

// ---- Main ----
export default function Home() {
  const [tab, setTab] = useState<"plan" | "cheap">("plan");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState("");

  const [departure, setDeparture] = useState(DEPARTURES[0]);
  const [month, setMonth] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 7);
  });
  const [nights, setNights] = useState("4");
  const [cheapLoading, setCheapLoading] = useState(false);
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [usedRealData, setUsedRealData] = useState(false);
  const [usedRealHotels, setUsedRealHotels] = useState(false);
  const [cheapError, setCheapError] = useState("");

  async function handlePlan() {
    if (!input.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const data = await res.json();
      if (data.plan) setResult(data);
      else setError(data.error || "エラーが発生しました");
    } catch { setError("通信エラーが発生しました"); }
    finally { setLoading(false); }
  }

  async function handleCheap() {
    setCheapLoading(true);
    setDestinations(null);
    setCheapError("");
    try {
      const res = await fetch("/api/cheapest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departure, month, nights }),
      });
      const data = await res.json();
      if (data.destinations?.length) {
        setDestinations(data.destinations);
        setUsedRealData(data.usedRealData);
        setUsedRealHotels(!!data.usedRealHotels);
      } else {
        setCheapError(data.error || "目的地の取得に失敗しました");
      }
    } catch {
      setCheapError("通信エラーが発生しました");
    } finally {
      setCheapLoading(false);
    }
  }

  const plan = result?.plan;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{
        background: "var(--surface)", borderBottom: "1px solid var(--border)",
        padding: "0 24px", height: 56, display: "flex", alignItems: "center",
        justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Plane size={18} style={{ color: "var(--accent)" }} />
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>トラベルAI</span>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {(["plan", "cheap"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "6px 14px", borderRadius: 8, border: "none",
              background: tab === t ? "var(--accent-light)" : "transparent",
              color: tab === t ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: tab === t ? 600 : 400, fontSize: 14, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              {t === "plan" ? <><MapPin size={14} />プラン作成</> : <><TrendingDown size={14} />最安目的地</>}
            </button>
          ))}
        </div>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>

        {/* ===== PLAN TAB ===== */}
        {tab === "plan" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 6 }}>
                どこへ行きますか？
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
                行きたい場所・期間・予算を自由に入力してください
              </p>
            </div>

            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
              padding: "14px 16px", marginBottom: 10, display: "flex", gap: 12, alignItems: "flex-end",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePlan(); } }}
                placeholder="例：来月パリに5日間。予算20万、ホテルは中級以上希望"
                rows={3}
                style={{
                  flex: 1, border: "none", outline: "none", resize: "none",
                  fontSize: 15, color: "var(--text-primary)", background: "transparent",
                  fontFamily: "inherit", lineHeight: 1.6,
                }}
              />
              <button onClick={handlePlan} disabled={loading || !input.trim()} style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: input.trim() ? "var(--accent)" : "var(--border)",
                border: "none", cursor: input.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.2s",
              }}>
                {loading
                  ? <Loader2 size={18} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
                  : <Send size={16} color="#fff" />}
              </button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 28 }}>
              {QUICK_PROMPTS.map((p) => (
                <button key={p} onClick={() => setInput(p)} style={{
                  padding: "5px 12px", borderRadius: 100, border: "1px solid var(--border)",
                  background: "var(--surface)", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
                }}>{p}</button>
              ))}
            </div>

            {error && (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                padding: "12px 16px", color: "#DC2626", fontSize: 14, marginBottom: 20,
              }}>{error}</div>
            )}

            {loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-secondary)", fontSize: 14, marginBottom: 4 }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  AIがプランを作成中…Ignavで航空券を検索中…
                </div>
                {[90, 140, 70, 100].map((h, i) => (
                  <div key={i} className="skeleton" style={{ height: h }} />
                ))}
              </div>
            )}

            {result && plan && !loading && (
              <div className="fade-up">
                {/* Destination header */}
                <div style={{
                  background: "var(--accent)", borderRadius: 14, padding: "20px 24px",
                  marginBottom: 14, color: "#fff",
                }}>
                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    <Users size={13} />{plan.adults}名 · {plan.duration}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 6 }}>
                    {plan.destination}
                  </div>
                  <div style={{ fontSize: 14, opacity: 0.9 }}>{plan.summary}</div>
                </div>

                {/* Flights */}
                {result.hasRealFlights && (
                  <Section title={`✈️ 航空券（Ignav実価格 · ${result.flights.length}件）`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.flights.map((f, i) => (
                        <FlightCard key={i} f={f} url={result.flightUrl} />
                      ))}
                    </div>
                    <a href={result.flightUrl} target="_blank" rel="noopener noreferrer" style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      marginTop: 10, padding: "9px", borderRadius: 8, fontSize: 13,
                      border: "1px solid var(--accent)", color: "var(--accent)",
                      textDecoration: "none", fontWeight: 500,
                    }}>
                      予約サイトで全便を比較 <ExternalLink size={13} />
                    </a>
                  </Section>
                )}

                {!result.hasRealFlights && (
                  <div style={{
                    background: "var(--accent-light)", border: "1px solid #C7D7FA",
                    borderRadius: 10, padding: "10px 14px", fontSize: 13,
                    color: "var(--accent)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Info size={14} />
                    Ignavの検索結果は参考価格です。予約サイトで実際の便をご確認ください。
                    <a href={result.flightUrl} target="_blank" rel="noopener noreferrer"
                      style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", fontWeight: 600 }}>
                      予約サイト <ExternalLink size={12} />
                    </a>
                  </div>
                )}

                {/* Hotels */}
                {result.hasRealHotels && result.hotels?.length > 0 && (
                  <Section title={`🏨 ホテル（LockTrip実価格 · ${result.hotels.length}件）`}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {result.hotels.map((h) => (
                        <HotelCard key={h.id} h={h} />
                      ))}
                    </div>
                    <a href={result.hotelUrl} target="_blank" rel="noopener noreferrer" style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      marginTop: 10, padding: "9px", borderRadius: 8, fontSize: 13,
                      border: "1px solid #E65100", color: "#E65100",
                      textDecoration: "none", fontWeight: 500,
                    }}>
                      LockTripで他のホテルを見る <ExternalLink size={13} />
                    </a>
                  </Section>
                )}

                {/* Itinerary */}
                <Section title="📅 旅程">
                  <div>
                    {plan.itinerary.map((day, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 14, alignItems: "flex-start",
                        paddingBottom: i < plan.itinerary.length - 1 ? 14 : 0,
                        marginBottom: i < plan.itinerary.length - 1 ? 14 : 0,
                        borderBottom: i < plan.itinerary.length - 1 ? "1px solid var(--border)" : "none",
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, background: "var(--accent-light)",
                          color: "var(--accent)", display: "flex", alignItems: "center",
                          justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>{day.day}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{day.title}</div>
                          <div style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.7 }}>{day.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>

                {/* Costs */}
                <div style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 14, overflow: "hidden", marginBottom: 14,
                }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", fontWeight: 600, fontSize: 15 }}>
                    💰 費用の内訳
                    {result.hasRealFlights && (
                      <span style={{
                        marginLeft: 8, fontSize: 12, fontWeight: 500, padding: "2px 8px",
                        background: "var(--success-light)", color: "var(--success)", borderRadius: 6,
                      }}>航空券はIgnav実価格</span>
                    )}
                    {result.hasRealHotels && (
                      <span style={{
                        marginLeft: 8, fontSize: 12, fontWeight: 500, padding: "2px 8px",
                        background: "#FFF3E0", color: "#E65100", borderRadius: 6,
                      }}>ホテルはLockTrip実価格</span>
                    )}
                  </div>
                  <div style={{ padding: "0 20px" }}>
                    {[
                      { icon: <Plane size={13} />, label: "航空券（往復）", value: plan.costs.flight },
                      { icon: <Hotel size={13} />, label: "ホテル", value: plan.costs.hotel },
                      { icon: <Ticket size={13} />, label: "観光・体験", value: plan.costs.activities },
                      { icon: <Utensils size={13} />, label: "食費", value: plan.costs.food },
                    ].map((row, i) => (
                      <div key={i} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "11px 0", borderBottom: "1px solid var(--border)",
                      }}>
                        <span style={{ color: "var(--text-secondary)", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
                          {row.icon}{row.label}
                        </span>
                        <span style={{ fontWeight: 500, fontSize: 14 }}>{fmt(row.value)}</span>
                      </div>
                    ))}
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "14px 0", background: "transparent",
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>合計（目安）</span>
                      <span style={{ fontWeight: 700, fontSize: 20, color: "var(--accent)" }}>{fmt(plan.costs.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Tips */}
                {plan.tips?.length > 0 && (
                  <Section title="💡 旅のアドバイス">
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {plan.tips.map((tip, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
                          <CheckCircle2 size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                          <span style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{tip}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* CTA */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 4 }}>
                  <a href={result.flightUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "13px 16px", borderRadius: 10, textDecoration: "none",
                    background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14,
                  }}>
                    <Plane size={15} />航空券を比較
                    <ExternalLink size={13} style={{ opacity: 0.8 }} />
                  </a>
                  <a href={result.hotelUrl} target="_blank" rel="noopener noreferrer" style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    padding: "13px 16px", borderRadius: 10, textDecoration: "none",
                    border: "1px solid var(--border)", background: "var(--surface)",
                    color: "var(--text-primary)", fontWeight: 600, fontSize: 14,
                  }}>
                    <Hotel size={15} />ホテルを検索
                    <ExternalLink size={13} style={{ opacity: 0.5 }} />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== CHEAP TAB ===== */}
        {tab === "cheap" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.5px", marginBottom: 6 }}>
                最安値の目的地
              </h1>
              <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
                Ignavの航空券・LockTripのホテルデータから最安値の旅先を提案します
              </p>
            </div>

            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: 20, marginBottom: 20,
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "出発地", el: (
                    <select value={departure} onChange={(e) => setDeparture(e.target.value)} style={{
                      width: "100%", padding: "9px 10px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer",
                    }}>
                      {DEPARTURES.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  )},
                  { label: "時期", el: (
                    <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{
                      width: "100%", padding: "9px 10px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      background: "var(--surface)", color: "var(--text-primary)",
                    }} />
                  )},
                  { label: "泊数", el: (
                    <select value={nights} onChange={(e) => setNights(e.target.value)} style={{
                      width: "100%", padding: "9px 10px", borderRadius: 8,
                      border: "1px solid var(--border)", fontSize: 13,
                      background: "var(--surface)", color: "var(--text-primary)", cursor: "pointer",
                    }}>
                      {["2", "3", "4", "5", "7", "10"].map((n) => <option key={n} value={n}>{n}泊</option>)}
                    </select>
                  )},
                ].map(({ label, el }, i) => (
                  <div key={i}>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6, fontWeight: 500 }}>
                      {label}
                    </label>
                    {el}
                  </div>
                ))}
              </div>
              <button onClick={handleCheap} disabled={cheapLoading} style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "var(--accent)", border: "none", color: "#fff",
                fontWeight: 600, fontSize: 15, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                {cheapLoading
                  ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />Ignavで検索中…</>
                  : <><Search size={16} />最安の目的地を探す</>}
              </button>
            </div>

            {cheapError && !cheapLoading && (
              <div style={{
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10,
                padding: "12px 16px", color: "#DC2626", fontSize: 14, marginBottom: 20,
              }}>{cheapError}</div>
            )}

            {cheapLoading && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 150 }} />
                ))}
              </div>
            )}

            {destinations && !cheapLoading && (
              <div className="fade-up">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    {departure} 発 · {month} · {nights}泊
                  </p>
                  {usedRealData && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px",
                      background: "var(--success-light)", color: "var(--success)", borderRadius: 6,
                    }}>Ignav実価格</span>
                  )}
                  {usedRealHotels && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "2px 8px",
                      background: "#FFF3E0", color: "#E65100", borderRadius: 6,
                    }}>LockTrip実価格</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {destinations.map((d, i) => (
                    <div key={i} style={{
                      background: "var(--surface)",
                      border: i === 0 ? "2px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: 12, padding: "14px 14px 12px", position: "relative",
                    }}>
                      {i === 0 && (
                        <div style={{
                          position: "absolute", top: -10, left: 12,
                          background: "var(--accent)", color: "#fff",
                          fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 6,
                        }}>最安値</div>
                      )}
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{d.emoji}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", marginBottom: 1 }}>{d.city}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{d.country}</div>
                      <div style={{
                        display: "flex", flexDirection: "column", gap: 6,
                        marginBottom: 10, padding: "10px 12px",
                        background: "var(--bg)", borderRadius: 8,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                            <Plane size={12} />航空券（往復）
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)" }}>{fmt(d.flightPrice)}</span>
                        </div>
                        {d.hotelPrice != null && (
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                              <Hotel size={12} />ホテル
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#E65100" }}>{fmt(d.hotelPrice)}</span>
                          </div>
                        )}
                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          paddingTop: 6, borderTop: "1px solid var(--border)",
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>合計目安</span>
                          <span style={{
                            fontSize: 15, fontWeight: 700,
                            color: i === 0 ? "var(--accent)" : "var(--text-primary)",
                          }}>{fmt(d.estimatedTotal ?? d.flightPrice + (d.hotelPrice || 0))}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12 }}>{d.highlight}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                        <a href={d.flightUrl} target="_blank" rel="noopener noreferrer" style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                          padding: "6px", borderRadius: 7, textDecoration: "none",
                          background: "var(--accent-light)", color: "var(--accent)", fontSize: 11, fontWeight: 600,
                        }}>
                          <Plane size={11} />航空券
                        </a>
                        <a href={d.hotelUrl} target="_blank" rel="noopener noreferrer" style={{
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                          padding: "6px", borderRadius: 7, textDecoration: "none",
                          border: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 11, fontWeight: 600,
                        }}>
                          <Hotel size={11} />ホテル
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <style>{`
        :root {
          --bg: #F7F6F3; --surface: #FFFFFF; --border: #E8E6E0;
          --text-primary: #1A1917; --text-secondary: #6B6862; --text-muted: #A09C96;
          --accent: #2D5BE3; --accent-light: #EEF2FD;
          --success: #16A34A; --success-light: #DCFCE7;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg); color: var(--text-primary); font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .fade-up { animation: fadeUp 0.4s ease forwards; }
        .skeleton { background: linear-gradient(90deg, var(--border) 25%, #f0efec 50%, var(--border) 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 10px; }
        a:hover { opacity: 0.88; }
        button:not(:disabled):hover { opacity: 0.9; }
      `}</style>
    </div>
  );
}
