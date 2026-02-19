import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabase";

// Recipe constants (these define the product)
const RECIPE = [
  { name: "Naudan tali", perJar: 41.9, unit: "g", supplier: "Paikallinen farmi", leadDays: 3, minOrder: 5000, color: "#F5B041" },
  { name: "Mehiläisvaha", perJar: 4.5, unit: "g", supplier: "Suomalainen tuottaja", leadDays: 5, minOrder: 1000, color: "#F7DC6F" },
  { name: "Oliiviöljy", perJar: 10.0, unit: "ml", supplier: "S-market", leadDays: 1, minOrder: 1000, color: "#82E0AA" },
  { name: "Tea tree -öljy", perJar: 1.5, unit: "ml", supplier: "Saksalainen toimittaja", leadDays: 14, minOrder: 100, color: "#85C1E9" },
  { name: "Kehäkukka", perJar: 1.05, unit: "g", supplier: "Saksalainen toimittaja", leadDays: 14, minOrder: 200, color: "#D2B4DE" },
  { name: "Salvia", perJar: 1.05, unit: "g", supplier: "Saksalainen toimittaja", leadDays: 14, minOrder: 150, color: "#AED6F1" },
];

const fmt = (n) => Math.round(n).toLocaleString("fi-FI");
const fmtDec = (n) => n.toLocaleString("fi-FI", { maximumFractionDigits: 1 });
const dateStr = (d) => d ? new Date(d).toLocaleDateString("fi-FI") : "–";
const today = () => new Date().toISOString().split("T")[0];

// ─── HOOKS ───────────────────────────────────────
function useSupabaseData() {
  const [ingredients, setIngredients] = useState([]);
  const [productions, setProductions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ weekly_rate: 70, safety_weeks: 3, jars_in_warehouse: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const [ingRes, prodRes, ordRes, setRes] = await Promise.all([
        supabase.from("ingredients").select("*").order("id"),
        supabase.from("productions").select("*").order("created_at", { ascending: false }),
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("settings").select("*").limit(1).single(),
      ]);

      if (ingRes.data) setIngredients(ingRes.data);
      if (prodRes.data) setProductions(prodRes.data);
      if (ordRes.data) setOrders(ordRes.data);
      if (setRes.data) setSettings(setRes.data);
      
      // If no ingredients exist, seed them
      if (!ingRes.data || ingRes.data.length === 0) {
        const seedData = RECIPE.map(r => ({
          name: r.name, per_jar: r.perJar, unit: r.unit, supplier: r.supplier,
          lead_days: r.leadDays, min_order: r.minOrder, color: r.color, stock: 0
        }));
        const { data } = await supabase.from("ingredients").insert(seedData).select();
        if (data) setIngredients(data);
      }
      
      // If no settings exist, seed them
      if (!setRes.data) {
        const { data } = await supabase.from("settings").insert({ weekly_rate: 70, safety_weeks: 3, jars_in_warehouse: 0 }).select().single();
        if (data) setSettings(data);
      }

      setError(null);
    } catch (e) {
      setError("Yhteysvirhe – tarkista nettiyhteys");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime subscriptions
  useEffect(() => {
    const channel = supabase.channel("meadow-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ingredients" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "productions" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  return { ingredients, productions, orders, settings, loading, error, refetch: fetchAll };
}

// ─── MAIN APP ────────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const correctPin = import.meta.env.VITE_APP_PIN || "1234";

  // Check stored auth
  useEffect(() => {
    if (sessionStorage.getItem("meadow-auth") === "true") setAuthed(true);
  }, []);

  const handleLogin = () => {
    if (pin === correctPin) {
      setAuthed(true);
      sessionStorage.setItem("meadow-auth", "true");
    } else {
      setPin("");
    }
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-xs text-center">
          <div className="text-5xl mb-3">🌿</div>
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Meadow</h1>
          <p className="text-sm text-stone-400 mb-6">Tuotannon hallinta</p>
          <input
            type="password"
            inputMode="numeric"
            placeholder="PIN-koodi"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            className="w-full border-2 border-stone-200 rounded-2xl px-4 py-4 text-center text-2xl tracking-widest font-bold focus:border-emerald-500 focus:outline-none"
            autoFocus
          />
          <button onClick={handleLogin}
            className="w-full mt-4 py-4 rounded-2xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-700 transition-colors">
            Kirjaudu
          </button>
        </div>
      </div>
    );
  }

  return <MainApp />;
}

function MainApp() {
  const { ingredients, productions, orders, settings, loading, error, refetch } = useSupabaseData();
  const [view, setView] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">🌿</div>
          <div className="text-stone-400">Ladataan...</div>
        </div>
      </div>
    );
  }

  // Calculations
  const dailyRate = settings.weekly_rate / 7;
  const weeksLeft = settings.weekly_rate > 0 ? settings.jars_in_warehouse / settings.weekly_rate : 999;
  const totalProduced = productions.reduce((s, p) => s + p.jars, 0);
  const minJars = ingredients.length > 0
    ? Math.min(...ingredients.map(i => i.per_jar > 0 ? Math.floor(i.stock / i.per_jar) : 999))
    : 0;

  const getStatus = (ing) => {
    if (dailyRate === 0) return { label: "OK", color: "emerald", daysLeft: 999 };
    const daysLeft = ing.stock / (dailyRate * ing.per_jar);
    const threshold = ing.lead_days + settings.safety_weeks * 7;
    if (daysLeft <= threshold) return { label: "TILAA NYT", color: "red", daysLeft };
    if (daysLeft <= threshold + 7) return { label: "TILAA PIAN", color: "amber", daysLeft };
    return { label: "OK", color: "emerald", daysLeft };
  };

  const suggestOrder = (ing) => Math.max(ing.min_order, Math.ceil(settings.weekly_rate * ing.per_jar * 4 / 10) * 10);

  const urgentCount = ingredients.filter(i => getStatus(i).color === "red").length;
  const soonCount = ingredients.filter(i => getStatus(i).color === "amber").length;
  const openOrders = orders.filter(o => !o.delivered_at).length;

  // ─── ACTIONS ─────────────────────────────
  const logProduction = async (jars, maker) => {
    if (!jars || jars <= 0) return;

    // Insert production record
    const consumed = RECIPE.map(r => jars * r.perJar);
    await supabase.from("productions").insert({
      production_date: today(), jars, maker: maker || "–",
      consumed: JSON.stringify(consumed)
    });

    // Update ingredient stocks
    for (let i = 0; i < ingredients.length; i++) {
      const newStock = Math.max(0, ingredients[i].stock - consumed[i]);
      await supabase.from("ingredients").update({ stock: newStock }).eq("id", ingredients[i].id);
    }

    showToast(`✅ ${jars} purkkia kirjattu!`);
    refetch();
  };

  const placeOrder = async (ingredientId, amount, price) => {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing || !amount) return;

    await supabase.from("orders").insert({
      order_date: today(), ingredient_name: ing.name, ingredient_id: ing.id,
      supplier: ing.supplier, amount, unit: ing.unit, price: price || 0,
      estimated_delivery: new Date(Date.now() + ing.lead_days * 86400000).toISOString().split("T")[0],
    });

    showToast(`📦 Tilaus kirjattu: ${fmt(amount)} ${ing.unit} ${ing.name}`);
    refetch();
  };

  const receiveOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    await supabase.from("orders").update({ delivered_at: today() }).eq("id", orderId);

    // Add stock
    const ing = ingredients.find(i => i.id === order.ingredient_id);
    if (ing) {
      await supabase.from("ingredients").update({ stock: ing.stock + order.amount }).eq("id", ing.id);
    }

    showToast(`✅ ${order.ingredient_name} vastaanotettu!`);
    refetch();
  };

  const updateStock = async (ingredientId, newStock) => {
    await supabase.from("ingredients").update({ stock: parseFloat(newStock) || 0 }).eq("id", ingredientId);
    showToast("Saldo päivitetty");
    refetch();
  };

  const updateSettings = async (updates) => {
    await supabase.from("settings").update(updates).eq("id", settings.id);
    refetch();
  };

  // ─── COMPONENTS ──────────────────────────
  const NavBtn = ({ id, icon, label, badge }) => (
    <button onClick={() => setView(id)}
      className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-xs font-medium transition-all relative
        ${view === id ? "bg-emerald-100 text-emerald-800" : "text-stone-500 hover:bg-stone-100"}`}>
      <span className="text-lg">{icon}</span>
      <span className="text-[10px]">{label}</span>
      {badge > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{badge}</span>}
    </button>
  );

  const StatusBadge = ({ status }) => {
    const c = { red: "bg-red-100 text-red-700 border-red-200", amber: "bg-amber-100 text-amber-700 border-amber-200", emerald: "bg-emerald-100 text-emerald-700 border-emerald-200" };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c[status.color]}`}>{status.label}</span>;
  };

  const Metric = ({ label, value, sub, alert }) => (
    <div className={`rounded-2xl p-4 ${alert === "red" ? "bg-red-50 border-2 border-red-200" : alert === "amber" ? "bg-amber-50 border-2 border-amber-200" : "bg-white border border-stone-200"}`}>
      <div className="text-[11px] text-stone-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${alert === "red" ? "text-red-600" : alert === "amber" ? "text-amber-600" : "text-stone-800"}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );

  // ─── MODALS ──────────────────────────────
  const ProductionModal = () => {
    const [jars, setJars] = useState("");
    const [maker, setMaker] = useState("");
    const j = parseInt(jars) || 0;
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 animate-fade-in" onClick={() => setModal(null)}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold mb-4">🏭 Kirjaa tuotanto</h3>
          <label className="text-sm text-stone-500">Montako purkkia valmistettiin?</label>
          <input type="number" inputMode="numeric" value={jars} onChange={e => setJars(e.target.value)} autoFocus
            className="w-full border-2 border-stone-200 rounded-2xl px-4 py-4 text-3xl font-bold text-center mt-1 focus:border-emerald-500 focus:outline-none" placeholder="0" />
          <label className="text-sm text-stone-500 mt-3 block">Valmistaja</label>
          <input type="text" value={maker} onChange={e => setMaker(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1" placeholder="Nimi" />
          {j > 0 && (
            <div className="mt-3 bg-stone-50 rounded-xl p-3 text-xs text-stone-500 space-y-1">
              <div className="font-medium text-stone-700 mb-1">Kuluttaa raaka-aineita:</div>
              {RECIPE.map((r, i) => {
                const need = j * r.perJar;
                const ing = ingredients[i];
                const enough = ing && ing.stock >= need;
                return (
                  <div key={i} className={`flex justify-between ${!enough ? "text-red-600 font-bold" : ""}`}>
                    <span>{r.name}</span>
                    <span>{fmtDec(need)} {r.unit} {!enough ? "⚠️ EI RIITÄ" : ""}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-600 font-medium">Peruuta</button>
            <button onClick={() => { logProduction(j, maker); setModal(null); }} disabled={j <= 0}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-30">
              Kirjaa {j} purkkia ✓
            </button>
          </div>
        </div>
      </div>
    );
  };

  const OrderModal = ({ prefillIngredient }) => {
    const [ingIdx, setIngIdx] = useState(prefillIngredient ?? 0);
    const [amount, setAmount] = useState(prefillIngredient != null ? String(suggestOrder(ingredients[prefillIngredient])) : "");
    const [price, setPrice] = useState("");
    const ing = ingredients[ingIdx];
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 animate-fade-in" onClick={() => setModal(null)}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold mb-4">📦 Uusi tilaus</h3>
          <label className="text-sm text-stone-500">Raaka-aine</label>
          <select value={ingIdx} onChange={e => { setIngIdx(parseInt(e.target.value)); setAmount(String(suggestOrder(ingredients[parseInt(e.target.value)]))); }}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1 mb-3 bg-white">
            {ingredients.map((ing, i) => <option key={i} value={i}>{ing.name} – {ing.supplier}</option>)}
          </select>
          <label className="text-sm text-stone-500">Määrä ({ing?.unit})</label>
          <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full border-2 border-stone-200 rounded-2xl px-4 py-3 text-xl font-bold text-center mt-1 focus:border-purple-500 focus:outline-none" />
          <div className="text-xs text-stone-400 mt-1 mb-3">Min. tilaus: {fmt(ing?.min_order || 0)} · Toimitusaika: ~{ing?.lead_days} pv</div>
          <label className="text-sm text-stone-500">Hinta € (vapaaehtoinen)</label>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1 mb-4" placeholder="0.00" />
          <div className="flex gap-2">
            <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-600 font-medium">Peruuta</button>
            <button onClick={() => { placeOrder(ing.id, parseFloat(amount), parseFloat(price)); setModal(null); }} disabled={!amount || parseFloat(amount) <= 0}
              className="flex-1 py-3 rounded-xl bg-purple-600 text-white font-bold disabled:opacity-30">
              Kirjaa tilaus ✓
            </button>
          </div>
        </div>
      </div>
    );
  };

  const SettingsModal = () => {
    const [wr, setWr] = useState(String(settings.weekly_rate));
    const [sw, setSw] = useState(String(settings.safety_weeks));
    const [jw, setJw] = useState(String(settings.jars_in_warehouse));
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 animate-fade-in" onClick={() => setModal(null)}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold mb-4">⚙️ Asetukset</h3>
          <label className="text-sm text-stone-500">Myyntivauhti (purkkia/viikko)</label>
          <input type="number" inputMode="numeric" value={wr} onChange={e => setWr(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1 mb-3 text-lg font-bold" />
          <label className="text-sm text-stone-500">Turvavarasto (viikkoja)</label>
          <input type="number" inputMode="numeric" value={sw} onChange={e => setSw(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1 mb-3 text-lg font-bold" />
          <label className="text-sm text-stone-500">Purkkeja 3PL-varastossa</label>
          <input type="number" inputMode="numeric" value={jw} onChange={e => setJw(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-4 py-3 mt-1 mb-4 text-lg font-bold" />
          <div className="flex gap-2">
            <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-600 font-medium">Peruuta</button>
            <button onClick={() => { updateSettings({ weekly_rate: parseInt(wr) || 70, safety_weeks: parseInt(sw) || 3, jars_in_warehouse: parseInt(jw) || 0 }); setModal(null); }}
              className="flex-1 py-3 rounded-xl bg-stone-800 text-white font-bold">Tallenna ✓</button>
          </div>
        </div>
      </div>
    );
  };

  const StockEditModal = ({ ingredient, index }) => {
    const [val, setVal] = useState(String(Math.round(ingredient.stock)));
    return (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 animate-fade-in" onClick={() => setModal(null)}>
        <div className="bg-white rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md animate-slide-up" onClick={e => e.stopPropagation()}>
          <h3 className="text-xl font-bold mb-2">{ingredient.name}</h3>
          <p className="text-sm text-stone-400 mb-4">Korjaa saldo manuaalisesti</p>
          <label className="text-sm text-stone-500">Uusi saldo ({ingredient.unit})</label>
          <input type="number" inputMode="numeric" value={val} onChange={e => setVal(e.target.value)} autoFocus
            className="w-full border-2 border-stone-200 rounded-2xl px-4 py-4 text-2xl font-bold text-center mt-1 focus:border-emerald-500 focus:outline-none" />
          <div className="flex gap-2 mt-4">
            <button onClick={() => setModal(null)} className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-600 font-medium">Peruuta</button>
            <button onClick={() => { updateStock(ingredient.id, val); setModal(null); }}
              className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold">Tallenna ✓</button>
          </div>
          {getStatus(ingredient).color !== "emerald" && (
            <button onClick={() => { setModal({ type: "order", prefill: index }); }}
              className="w-full mt-3 py-3 rounded-xl bg-red-600 text-white font-bold">
              Tilaa {fmt(suggestOrder(ingredient))} {ingredient.unit} →
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-lg z-40 animate-slide-up font-bold
          ${toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.msg}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-center text-sm text-red-600">{error}</div>
      )}

      {/* Modals */}
      {modal?.type === "production" && <ProductionModal />}
      {modal?.type === "order" && <OrderModal prefillIngredient={modal.prefill} />}
      {modal?.type === "settings" && <SettingsModal />}
      {modal?.type === "editStock" && <StockEditModal ingredient={modal.ingredient} index={modal.index} />}

      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">🌿 Meadow</h1>
            <p className="text-[11px] text-stone-400">Tuotannon hallinta{settings.weekly_rate ? ` · ${settings.weekly_rate} purkkia/vko` : ""}</p>
          </div>
          <button onClick={() => setModal({ type: "settings" })}
            className="text-stone-400 hover:text-stone-600 p-2 rounded-lg hover:bg-stone-100 transition-colors">⚙️</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-24 px-4">

        {/* ═══════ DASHBOARD ═══════ */}
        {view === "dashboard" && (
          <div className="mt-4 space-y-4 animate-fade-in">
            {/* Alert */}
            {urgentCount > 0 ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-transform" onClick={() => setView("ingredients")}>
                <span className="text-3xl">🚨</span>
                <div>
                  <div className="font-bold text-red-700">{urgentCount} raaka-ainetta tilattava</div>
                  <div className="text-sm text-red-600">Napauta nähdäksesi →</div>
                </div>
              </div>
            ) : soonCount > 0 ? (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer" onClick={() => setView("ingredients")}>
                <span className="text-3xl">⚠️</span>
                <div>
                  <div className="font-bold text-amber-700">{soonCount} raaka-ainetta loppumassa</div>
                  <div className="text-sm text-amber-600">Napauta →</div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
                <span className="text-3xl">✅</span>
                <div className="font-bold text-emerald-700">Kaikki kunnossa!</div>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <Metric label="3PL varasto" value={`${fmt(settings.jars_in_warehouse)}`}
                sub={weeksLeft < 999 ? `~${fmtDec(weeksLeft)} viikkoa` : "Aseta menekki"} alert={weeksLeft < 2 ? "red" : weeksLeft < 4 ? "amber" : null} />
              <Metric label="Raaka-aineista riittää" value={`${fmt(minJars)} purkkia`}
                alert={minJars < settings.weekly_rate ? "amber" : null} />
              <Metric label="Viikkomenekki" value={`${fmt(settings.weekly_rate)}/vko`}
                sub={`~${fmt(Math.round(settings.weekly_rate * 4.33))}/kk`} />
              <Metric label="Tuotettu yhteensä" value={fmt(totalProduced)} sub={`${productions.length} erää`} />
            </div>

            {/* Quick produce button */}
            <button onClick={() => setModal({ type: "production" })}
              className="w-full py-5 rounded-2xl bg-emerald-600 text-white font-bold text-lg hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg shadow-emerald-200">
              🏭 Kirjaa tuotanto
            </button>

            {/* Recent */}
            {productions.length > 0 && (
              <div className="bg-white rounded-2xl border border-stone-200 p-4">
                <h3 className="font-bold text-stone-700 text-sm mb-2">Viimeisimmät erät</h3>
                {productions.slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between py-2 border-b border-stone-100 last:border-0">
                    <span><span className="font-bold">{p.jars}</span> <span className="text-stone-400 text-sm">purkkia · {p.maker}</span></span>
                    <span className="text-sm text-stone-400">{dateStr(p.production_date)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ INGREDIENTS ═══════ */}
        {view === "ingredients" && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-stone-800">📦 Raaka-aineet</h2>
              <button onClick={() => setModal({ type: "order" })} className="text-sm text-purple-600 font-bold">+ Tilaus</button>
            </div>

            {ingredients.map((ing, idx) => {
              const status = getStatus(ing);
              const maxDays = ing.lead_days + settings.safety_weeks * 7 + 14;
              const pct = Math.min(100, (status.daysLeft / maxDays) * 100);
              return (
                <div key={ing.id}
                  onClick={() => setModal({ type: "editStock", ingredient: ing, index: idx })}
                  className={`bg-white rounded-2xl border p-4 cursor-pointer active:scale-[0.98] transition-all
                    ${status.color === "red" ? "border-red-300 shadow-md shadow-red-100" : status.color === "amber" ? "border-amber-300" : "border-stone-200"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ing.color }}></div>
                      <div>
                        <div className="font-bold text-stone-800">{ing.name}</div>
                        <div className="text-[11px] text-stone-400">{ing.supplier} · {ing.lead_days} pv</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{fmt(Math.round(ing.stock))}<span className="text-sm text-stone-400 font-normal ml-1">{ing.unit}</span></div>
                      <StatusBadge status={status} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                      <span>~{Math.round(status.daysLeft)} pv · ~{fmt(Math.floor(ing.stock / ing.per_jar))} purkkia</span>
                      <span>{fmtDec(ing.per_jar)} {ing.unit}/purkki</span>
                    </div>
                    <div className="w-full bg-stone-100 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${status.color === "red" ? "bg-red-500" : status.color === "amber" ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════ ORDERS ═══════ */}
        {view === "orders" && (
          <div className="mt-4 space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-stone-800">🚚 Tilaukset</h2>
              <button onClick={() => setModal({ type: "order" })}
                className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold">+ Uusi tilaus</button>
            </div>

            {/* Open orders */}
            {orders.filter(o => !o.delivered_at).length > 0 && (
              <div>
                <h3 className="font-bold text-stone-500 text-sm mb-2">⏳ Avoimet ({orders.filter(o => !o.delivered_at).length})</h3>
                {orders.filter(o => !o.delivered_at).map(o => (
                  <div key={o.id} className="bg-white rounded-2xl border border-stone-200 p-4 mb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold">{o.ingredient_name}</div>
                        <div className="text-sm text-stone-500">{fmt(o.amount)} {o.unit} · {o.supplier}</div>
                        <div className="text-xs text-stone-400">Tilattu {dateStr(o.order_date)} · Arvio {dateStr(o.estimated_delivery)}</div>
                      </div>
                      <button onClick={() => receiveOrder(o.id)}
                        className="px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold whitespace-nowrap active:scale-95 transition-transform">
                        Saapunut ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Delivered */}
            {orders.filter(o => o.delivered_at).length > 0 && (
              <div>
                <h3 className="font-bold text-stone-500 text-sm mb-2">✅ Toimitetut</h3>
                {orders.filter(o => o.delivered_at).slice(0, 10).map(o => (
                  <div key={o.id} className="bg-stone-50 rounded-xl p-3 mb-2 text-sm">
                    <span className="font-medium">{o.ingredient_name}</span>
                    <span className="text-stone-400"> · {fmt(o.amount)} {o.unit} · {dateStr(o.delivered_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {orders.length === 0 && (
              <div className="text-center text-stone-400 py-12">Ei tilauksia vielä</div>
            )}
          </div>
        )}

        {/* ═══════ HISTORY ═══════ */}
        {view === "history" && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <h2 className="text-lg font-bold text-stone-800">📋 Tuotantohistoria</h2>
            {totalProduced > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                <div className="text-3xl font-bold text-emerald-700">{fmt(totalProduced)}</div>
                <div className="text-sm text-emerald-600">purkkia yhteensä · {productions.length} erää</div>
              </div>
            )}
            {productions.map(p => {
              let consumed = [];
              try { consumed = JSON.parse(p.consumed || "[]"); } catch {}
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-stone-200 p-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xl font-bold">{p.jars} purkkia</span>
                    <span className="text-sm text-stone-400">{dateStr(p.production_date)}</span>
                  </div>
                  <div className="text-sm text-stone-500 mb-2">Valmistaja: {p.maker}</div>
                  <div className="flex flex-wrap gap-2">
                    {RECIPE.map((r, i) => (
                      <span key={i} className="text-[10px] bg-stone-100 px-2 py-1 rounded-lg text-stone-500">
                        {r.name}: {fmtDec(consumed[i] || 0)} {r.unit}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {productions.length === 0 && (
              <div className="text-center text-stone-400 py-12">Ei tuotantoja vielä</div>
            )}
          </div>
        )}

        {/* ═══════ RECIPE ═══════ */}
        {view === "recipe" && (
          <div className="mt-4 space-y-4 animate-fade-in">
            <h2 className="text-lg font-bold text-stone-800">🧪 Resepti – Silky Sage 60g</h2>
            <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
              {RECIPE.map((r, i) => (
                <div key={i} className="flex items-center justify-between p-4 border-b border-stone-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }}></div>
                    <span className="font-medium">{r.name}</span>
                  </div>
                  <span className="font-bold">{fmtDec(r.perJar)} {r.unit}</span>
                </div>
              ))}
              <div className="flex justify-between p-4 bg-stone-50 font-bold">
                <span>Yhteensä</span>
                <span>{fmtDec(RECIPE.reduce((s, r) => s + r.perJar, 0))} g</span>
              </div>
            </div>

            <RecipeCalculator />
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-2 py-1 z-20 safe-area-bottom">
        <div className="max-w-lg mx-auto flex justify-around">
          <NavBtn id="dashboard" icon="🏠" label="Etusivu" badge={urgentCount} />
          <NavBtn id="ingredients" icon="📦" label="Aineet" badge={urgentCount + soonCount} />
          <NavBtn id="orders" icon="🚚" label="Tilaukset" badge={openOrders} />
          <NavBtn id="history" icon="📋" label="Historia" />
          <NavBtn id="recipe" icon="🧪" label="Resepti" />
        </div>
      </div>
    </div>
  );
}

function RecipeCalculator() {
  const [jars, setJars] = useState("");
  const j = parseInt(jars) || 0;
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4">
      <h3 className="font-bold mb-3">🔢 Raaka-ainelaskuri</h3>
      <input type="number" inputMode="numeric" placeholder="Montako purkkia?" value={jars} onChange={e => setJars(e.target.value)}
        className="w-full border-2 border-stone-200 rounded-xl px-4 py-3 text-xl font-bold text-center focus:border-emerald-500 focus:outline-none" />
      {j > 0 && (
        <div className="mt-3 space-y-2">
          {RECIPE.map((r, i) => (
            <div key={i} className="flex justify-between py-1 text-sm">
              <span className="text-stone-600">{r.name}</span>
              <span className="font-bold">{fmtDec(j * r.perJar)} {r.unit}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 border-t border-stone-200 font-bold">
            <span>Kokonaispaino</span>
            <span>{fmtDec(j * RECIPE.reduce((s, r) => s + r.perJar, 0))} g</span>
          </div>
        </div>
      )}
    </div>
  );
}
