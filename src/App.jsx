import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase";

// ─── UTILS ───────────────────────────────────
const fmt = (n) => Math.round(n).toLocaleString("fi-FI");
const fmtDec = (n, d = 1) => Number(n).toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtEur = (n) => Number(n).toLocaleString("fi-FI", { style: "currency", currency: "EUR" });
const dateStr = (d) => d ? new Date(d).toLocaleDateString("fi-FI") : "–";
const today = () => new Date().toISOString().split("T")[0];

// ─── UNIT CONVERSION ─────────────────────────
// Everything stored in base units: g, ml, kpl
// Display auto-converts to best human-readable unit
const UNIT_GROUPS = {
  mass:   { g: 1, kg: 1000 },
  volume: { ml: 1, dl: 100, l: 1000, tl: 5, rkl: 15 },
  count:  { kpl: 1 },
};

const getGroup = (unit) => {
  for (const [, group] of Object.entries(UNIT_GROUPS)) {
    if (unit in group) return group;
  }
  return null;
};

const getBaseUnit = (unit) => {
  const group = getGroup(unit);
  if (!group) return unit;
  return Object.entries(group).find(([, v]) => v === 1)?.[0] || unit;
};

// Convert any unit to its base (g, ml, kpl)
const toBase = (value, unit) => {
  const group = getGroup(unit);
  if (!group) return value;
  return value * (group[unit] || 1);
};

// Convert from base to target unit
const fromBase = (baseValue, targetUnit) => {
  const group = getGroup(targetUnit);
  if (!group) return baseValue;
  return baseValue / (group[targetUnit] || 1);
};

// Auto-pick best display unit: 18000g → "18 kg", 500ml → "5 dl"
const smartDisplay = (baseValue, baseUnit) => {
  const group = getGroup(baseUnit);
  if (!group) return { val: baseValue, unit: baseUnit };
  const sorted = Object.entries(group).sort((a, b) => b[1] - a[1]);
  for (const [u, factor] of sorted) {
    const converted = baseValue / factor;
    if (Math.abs(converted) >= 1) return { val: converted, unit: u };
  }
  return { val: baseValue, unit: baseUnit };
};

// Format stock for display
const displayStock = (baseValue, baseUnit) => {
  const { val, unit } = smartDisplay(baseValue, baseUnit);
  const text = Number.isInteger(Math.round(val * 10) / 10) ? fmt(val) : fmtDec(val);
  return { text, unit, val };
};

// Smart price display: 0.005 €/g → "5,00 €/kg"
const displayPrice = (basePricePerUnit, baseUnit) => {
  const group = getGroup(baseUnit);
  if (!group) return { text: fmtEur(basePricePerUnit), unit: baseUnit };
  const sorted = Object.entries(group).sort((a, b) => b[1] - a[1]);
  for (const [u, factor] of sorted) {
    const p = basePricePerUnit * factor;
    if (p >= 0.01 || u === baseUnit) return { text: fmtEur(p), unit: u };
  }
  return { text: fmtEur(basePricePerUnit), unit: baseUnit };
};

// Get sibling units for dropdown
const getUnitFamily = (unit) => {
  const group = getGroup(unit);
  return group ? Object.keys(group) : [unit];
};

// ─── DATA HOOK ───────────────────────────────
function useData() {
  const [products, setProducts] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [recipeItems, setRecipeItems] = useState([]);
  const [productions, setProductions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ safety_weeks: 3 });
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const [p, i, r, pr, o, s] = await Promise.all([
      supabase.from("products").select("*").order("id"),
      supabase.from("ingredients").select("*").order("id"),
      supabase.from("recipe_items").select("*"),
      supabase.from("productions").select("*").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("settings").select("*").limit(1).single(),
    ]);
    if (p.data) setProducts(p.data);
    if (i.data) setIngredients(i.data);
    if (r.data) setRecipeItems(r.data);
    if (pr.data) setProductions(pr.data);
    if (o.data) setOrders(o.data);
    if (s.data) setSettings(s.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  useEffect(() => {
    const ch = supabase.channel("rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, fetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "ingredients" }, fetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "recipe_items" }, fetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "productions" }, fetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, fetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetch)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetch]);

  return { products, ingredients, recipeItems, productions, orders, settings, loading, refetch: fetch };
}

// ─── SHARED COMPONENTS ───────────────────────
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-30 animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="mb-3"><label className="text-xs text-stone-500 block mb-1">{label}</label>{children}</div>;
}

function Inp({ type = "text", value, onChange, placeholder, className = "", big, ...props }) {
  return <input type={type} inputMode={type === "number" ? "decimal" : undefined} value={value} onChange={e => onChange(e.target.value)}
    placeholder={placeholder} className={`w-full border border-stone-200 rounded-xl px-3 py-2.5 focus:border-emerald-500 focus:outline-none ${big ? "text-2xl font-bold text-center border-2" : ""} ${className}`} {...props} />;
}

// Input with unit selector
function InpWithUnit({ value, onChange, unit, onUnitChange, baseUnit, placeholder, big }) {
  const family = getUnitFamily(baseUnit || unit);
  return (
    <div className="flex gap-2">
      <input type="number" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "0"}
        className={`flex-1 border border-stone-200 rounded-xl px-3 py-2.5 focus:border-emerald-500 focus:outline-none ${big ? "text-2xl font-bold text-center border-2" : ""}`} />
      {family.length > 1 ? (
        <select value={unit} onChange={e => onUnitChange(e.target.value)}
          className="border border-stone-200 rounded-xl px-3 py-2.5 bg-white font-medium text-stone-700 min-w-[70px]">
          {family.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      ) : (
        <div className="flex items-center px-3 text-stone-500 font-medium">{unit}</div>
      )}
    </div>
  );
}

function Btn({ children, onClick, disabled, color = "emerald", full, className = "" }) {
  const colors = { emerald: "bg-emerald-600 hover:bg-emerald-700", purple: "bg-purple-600 hover:bg-purple-700", red: "bg-red-600 hover:bg-red-700", stone: "bg-stone-700 hover:bg-stone-800", amber: "bg-amber-600 hover:bg-amber-700" };
  return <button onClick={onClick} disabled={disabled}
    className={`${full ? "w-full" : ""} py-3 px-4 rounded-xl text-white font-bold disabled:opacity-30 transition-all active:scale-[0.98] ${colors[color]} ${className}`}>{children}</button>;
}

function BtnOutline({ children, onClick, full }) {
  return <button onClick={onClick} className={`${full ? "w-full" : ""} py-3 px-4 rounded-xl border border-stone-300 text-stone-600 font-medium`}>{children}</button>;
}

function StatusBadge({ color, label }) {
  const c = { red: "bg-red-100 text-red-700 border-red-200", amber: "bg-amber-100 text-amber-700 border-amber-200", emerald: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c[color]}`}>{label}</span>;
}

function Metric({ label, value, sub, alert }) {
  return (
    <div className={`rounded-2xl p-3.5 ${alert === "red" ? "bg-red-50 border-2 border-red-200" : alert === "amber" ? "bg-amber-50 border-2 border-amber-200" : "bg-white border border-stone-200"}`}>
      <div className="text-[11px] text-stone-500 mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${alert === "red" ? "text-red-600" : alert === "amber" ? "text-amber-600" : "text-stone-800"}`}>{value}</div>
      {sub && <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── AUTH ─────────────────────────────────────
function PinScreen({ onAuth }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const correct = import.meta.env.VITE_APP_PIN || "1234";
  const tryLogin = () => {
    if (pin === correct) { sessionStorage.setItem("meadow-auth", "1"); onAuth(); }
    else { setShake(true); setPin(""); setTimeout(() => setShake(false), 500); }
  };
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className={`bg-white rounded-3xl shadow-lg p-8 w-full max-w-xs text-center ${shake ? "animate-[shake_0.5s]" : ""}`}>
        <div className="text-5xl mb-3">🌿</div>
        <h1 className="text-2xl font-bold text-stone-800 mb-1">Meadow</h1>
        <p className="text-sm text-stone-400 mb-6">Tuotannon hallinta</p>
        <Inp type="password" value={pin} onChange={setPin} placeholder="PIN" big
          onKeyDown={e => e.key === "Enter" && tryLogin()} autoFocus />
        <Btn onClick={tryLogin} full color="emerald" className="mt-4 text-lg">Kirjaudu</Btn>
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────
export default function App() {
  const [authed, setAuthed] = useState(sessionStorage.getItem("meadow-auth") === "1");
  if (!authed) return <PinScreen onAuth={() => setAuthed(true)} />;
  return <Main />;
}

function Main() {
  const data = useData();
  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);

  const show = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  if (data.loading) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-4xl animate-pulse">🌿</div>
    </div>
  );

  const { products, ingredients, recipeItems, productions, orders, settings, refetch } = data;
  const activeProducts = products.filter(p => p.active);
  const safetyDays = settings.safety_weeks * 7;

  // ─── CALCULATIONS ────────────────────────
  const ingDailyUse = (ingId) => {
    let total = 0;
    for (const p of activeProducts) {
      const ri = recipeItems.find(r => r.product_id === p.id && r.ingredient_id === ingId);
      if (ri && p.weekly_rate > 0) total += (p.weekly_rate / 7) * ri.amount_per_jar;
    }
    return total;
  };

  const getIngStatus = (ing) => {
    const daily = ingDailyUse(ing.id);
    if (daily === 0) return { label: "OK", color: "emerald", daysLeft: 999 };
    const daysLeft = ing.stock / daily;
    const threshold = ing.lead_days + safetyDays;
    if (daysLeft <= threshold) return { label: "TILAA NYT", color: "red", daysLeft };
    if (daysLeft <= threshold + 7) return { label: "TILAA PIAN", color: "amber", daysLeft };
    return { label: "OK", color: "emerald", daysLeft };
  };

  const suggestOrder = (ing) => {
    const weeklyBase = ingDailyUse(ing.id) * 7;
    return Math.max(ing.min_order, Math.ceil(weeklyBase * 4 / 10) * 10);
  };

  const unitCost = (productId) => {
    const items = recipeItems.filter(r => r.product_id === productId);
    return items.reduce((sum, ri) => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      return sum + (ri.amount_per_jar * (ing?.price_per_unit || 0));
    }, 0);
  };

  const jarsFromStock = (productId) => {
    const items = recipeItems.filter(r => r.product_id === productId);
    if (items.length === 0) return 0;
    return Math.min(...items.map(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      if (!ing || ri.amount_per_jar === 0) return 999999;
      return Math.floor(ing.stock / ri.amount_per_jar);
    }));
  };

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const prodThisWeek = (productId) => productions
    .filter(p => p.product_id === productId && p.production_date >= weekStartStr)
    .reduce((s, p) => s + p.jars, 0);

  const urgentIngs = ingredients.filter(i => getIngStatus(i).color === "red");
  const soonIngs = ingredients.filter(i => getIngStatus(i).color === "amber");
  const openOrders = orders.filter(o => !o.delivered_at);
  const totalProduced = productions.reduce((s, p) => s + p.jars, 0);

  // ─── ACTIONS ─────────────────────────────
  const logProduction = async (productId, jars, maker, notes) => {
    const items = recipeItems.filter(r => r.product_id === productId);
    const consumed = items.map(ri => {
      const ing = ingredients.find(i => i.id === ri.ingredient_id);
      return { ingredient_id: ri.ingredient_id, name: ing?.name, amount: jars * ri.amount_per_jar, unit: ing?.unit };
    });
    await supabase.from("productions").insert({
      product_id: productId, production_date: today(), jars, maker, notes, consumed: JSON.stringify(consumed)
    });
    for (const c of consumed) {
      const ing = ingredients.find(i => i.id === c.ingredient_id);
      if (ing) await supabase.from("ingredients").update({ stock: Math.max(0, ing.stock - c.amount) }).eq("id", ing.id);
    }
    show(`✅ ${jars} purkkia kirjattu!`);
    refetch();
  };

  const placeOrder = async (ingredientId, amountBase, price, notes) => {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing) return;
    await supabase.from("orders").insert({
      ingredient_id: ing.id, ingredient_name: ing.name, supplier: ing.supplier,
      amount: amountBase, unit: ing.unit, price, order_date: today(), notes,
      estimated_delivery: new Date(Date.now() + ing.lead_days * 86400000).toISOString().split("T")[0],
    });
    const d = displayStock(amountBase, ing.unit);
    show(`📦 Tilaus: ${d.text} ${d.unit} ${ing.name}`);
    refetch();
  };

  const receiveOrder = async (orderId) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    await supabase.from("orders").update({ delivered_at: today() }).eq("id", orderId);
    const ing = ingredients.find(i => i.id === order.ingredient_id);
    if (ing) await supabase.from("ingredients").update({ stock: ing.stock + order.amount }).eq("id", ing.id);
    show(`✅ ${order.ingredient_name} vastaanotettu!`);
    refetch();
  };

  // ─── MODALS ──────────────────────────────
  const ProductionModal = () => {
    const [pid, setPid] = useState(activeProducts[0]?.id || 0);
    const [jars, setJars] = useState("");
    const [maker, setMaker] = useState("");
    const [notes, setNotes] = useState("");
    const j = parseInt(jars) || 0;
    const items = recipeItems.filter(r => r.product_id === pid);
    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-4">🏭 Kirjaa tuotanto</h3>
        {activeProducts.length > 1 && (
          <Field label="Tuote">
            <select value={pid} onChange={e => setPid(Number(e.target.value))} className="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-white">
              {activeProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Montako purkkia valmistettiin?">
          <Inp type="number" value={jars} onChange={setJars} placeholder="0" big autoFocus />
        </Field>
        <Field label="Valmistaja"><Inp value={maker} onChange={setMaker} placeholder="Nimi" /></Field>
        <Field label="Muistiinpanot (vapaaehtoinen)"><Inp value={notes} onChange={setNotes} placeholder="Esim. erän laatu, huomiot..." /></Field>
        {j > 0 && (
          <div className="bg-stone-50 rounded-xl p-3 text-xs mb-3 space-y-1">
            <div className="font-medium text-stone-700">Kuluttaa raaka-aineita:</div>
            {items.map(ri => {
              const ing = ingredients.find(i => i.id === ri.ingredient_id);
              const needBase = j * ri.amount_per_jar;
              const ok = ing && ing.stock >= needBase;
              const disp = displayStock(needBase, ing?.unit || "g");
              return <div key={ri.id} className={`flex justify-between ${!ok ? "text-red-600 font-bold" : "text-stone-500"}`}>
                <span>{ing?.name}</span><span>{disp.text} {disp.unit} {!ok ? "⚠️" : ""}</span>
              </div>;
            })}
            <div className="border-t border-stone-200 pt-1 mt-1 flex justify-between font-bold text-stone-700">
              <span>Raaka-ainekustannus</span><span>{fmtEur(j * unitCost(pid))}</span>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline>
          <Btn onClick={() => { logProduction(pid, j, maker, notes); setModal(null); }} disabled={j <= 0} full>Kirjaa {j} purkkia ✓</Btn>
        </div>
      </Modal>
    );
  };

  const OrderModal = ({ prefillIngId }) => {
    const initIng = ingredients.find(i => i.id === prefillIngId) || ingredients[0];
    const [ingId, setIngId] = useState(initIng?.id);
    const initSuggest = prefillIngId ? suggestOrder(initIng) : 0;
    const initDisplay = prefillIngId ? smartDisplay(initSuggest, initIng.unit) : { val: "", unit: initIng?.unit || "g" };
    const [amount, setAmount] = useState(initDisplay.val ? String(Math.round(initDisplay.val)) : "");
    const [inputUnit, setInputUnit] = useState(initDisplay.unit);
    const [price, setPrice] = useState("");
    const [notes, setNotes] = useState("");
    const ing = ingredients.find(i => i.id === ingId);

    const onIngChange = (id) => {
      const newIng = ingredients.find(i => i.id === Number(id));
      setIngId(Number(id));
      if (newIng) {
        const s = suggestOrder(newIng);
        const d = smartDisplay(s, newIng.unit);
        setAmount(String(Math.round(d.val)));
        setInputUnit(d.unit);
      }
    };

    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-4">📦 Uusi tilaus</h3>
        <Field label="Raaka-aine">
          <select value={ingId} onChange={e => onIngChange(e.target.value)}
            className="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-white">
            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} – {i.supplier}</option>)}
          </select>
        </Field>
        <Field label="Määrä">
          <InpWithUnit value={amount} onChange={setAmount} unit={inputUnit} onUnitChange={setInputUnit} baseUnit={ing?.unit} big />
        </Field>
        <div className="text-xs text-stone-400 -mt-2 mb-3">
          Min. tilaus: {displayStock(ing?.min_order || 0, ing?.unit || "g").text} {displayStock(ing?.min_order || 0, ing?.unit || "g").unit} · Toimitusaika: ~{ing?.lead_days} pv
        </div>
        <Field label="Hinta € (vapaaehtoinen)"><Inp type="number" value={price} onChange={setPrice} placeholder="0.00" /></Field>
        <Field label="Muistiinpanot"><Inp value={notes} onChange={setNotes} placeholder="Esim. tilausnumero, huomiot..." /></Field>
        <div className="flex gap-2">
          <BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline>
          <Btn onClick={() => {
            const baseAmount = toBase(parseFloat(amount) || 0, inputUnit);
            placeOrder(ingId, baseAmount, parseFloat(price) || 0, notes);
            setModal(null);
          }} disabled={!amount || parseFloat(amount) <= 0} full color="purple">Kirjaa tilaus ✓</Btn>
        </div>
      </Modal>
    );
  };

  const EditIngredientModal = ({ ingredient }) => {
    const isNew = !ingredient;
    const [name, setName] = useState(ingredient?.name || "");
    const [unit, setUnit] = useState(ingredient?.unit || "g");
    const [supplier, setSupplier] = useState(ingredient?.supplier || "");
    const [leadDays, setLeadDays] = useState(String(ingredient?.lead_days ?? 7));
    const [minOrder, setMinOrder] = useState("");
    const [minOrderUnit, setMinOrderUnit] = useState(ingredient?.unit || "g");
    const [pricePerUnit, setPricePerUnit] = useState(String(ingredient?.price_per_unit ?? 0));
    const [priceUnit, setPriceUnit] = useState(ingredient?.unit || "g");
    const [stockVal, setStockVal] = useState("");
    const [stockUnit, setStockUnit] = useState(ingredient?.unit || "g");
    const [color, setColor] = useState(ingredient?.color || "#82E0AA");
    const [confirm, setConfirm] = useState(false);

    useEffect(() => {
      if (ingredient) {
        const sd = smartDisplay(ingredient.stock, ingredient.unit);
        setStockVal(String(Math.round(sd.val * 10) / 10));
        setStockUnit(sd.unit);
        const md = smartDisplay(ingredient.min_order, ingredient.unit);
        setMinOrderUnit(md.unit);
        setMinOrder(String(Math.round(md.val)));
        // Convert €/g → €/kg for display (multiply price by unit factor)
        const group = getGroup(ingredient.unit);
        if (group) {
          const sorted = Object.entries(group).sort((a, b) => b[1] - a[1]);
          for (const [u, factor] of sorted) {
            const displayPrice = ingredient.price_per_unit * factor;
            if (displayPrice >= 0.01 || u === ingredient.unit) {
              setPricePerUnit(String(Math.round(displayPrice * 1000) / 1000));
              setPriceUnit(u);
              break;
            }
          }
        }
      }
    }, []);

    const save = async () => {
      const baseUnit = isNew ? getBaseUnit(unit) : ingredient.unit;
      const stockBase = toBase(parseFloat(stockVal) || 0, stockUnit);
      const minOrderBase = toBase(parseFloat(minOrder) || 0, minOrderUnit);
      // Convert displayed price (€/kg) → base price (€/g): divide by unit factor
      const priceGroup = getGroup(priceUnit);
      const priceFactor = priceGroup?.[priceUnit] || 1;
      const basePricePerUnit = (parseFloat(pricePerUnit) || 0) / priceFactor;
      const d = { name, unit: baseUnit, supplier, lead_days: parseInt(leadDays) || 7, min_order: minOrderBase,
        price_per_unit: basePricePerUnit, stock: stockBase, color };
      if (isNew) await supabase.from("ingredients").insert(d);
      else await supabase.from("ingredients").update(d).eq("id", ingredient.id);
      show(isNew ? "✅ Raaka-aine lisätty!" : "✅ Päivitetty!");
      refetch(); setModal(null);
    };

    const remove = async () => {
      await supabase.from("recipe_items").delete().eq("ingredient_id", ingredient.id);
      await supabase.from("ingredients").delete().eq("id", ingredient.id);
      show("Poistettu"); refetch(); setModal(null);
    };

    const currentBase = isNew ? getBaseUnit(unit) : ingredient.unit;

    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-4">{isNew ? "➕ Uusi raaka-aine" : `✏️ ${ingredient.name}`}</h3>
        <Field label="Nimi"><Inp value={name} onChange={setName} placeholder="Esim. Tarra, Purkki..." /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Perusyksikkö">
            {isNew ? (
              <select value={unit} onChange={e => { setUnit(e.target.value); setStockUnit(e.target.value); setMinOrderUnit(e.target.value); setPriceUnit(e.target.value); }}
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 bg-white">
                {["g","ml","kpl"].map(u => <option key={u} value={u}>{u} ({u === "g" ? "paino" : u === "ml" ? "tilavuus" : "lukumäärä"})</option>)}
              </select>
            ) : (
              <div className="border border-stone-200 rounded-xl px-3 py-2.5 bg-stone-50 text-stone-500">{ingredient.unit}</div>
            )}
          </Field>
          <Field label="Väri"><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 rounded-xl border border-stone-200 cursor-pointer" /></Field>
        </div>
        <Field label="Toimittaja"><Inp value={supplier} onChange={setSupplier} placeholder="Toimittajan nimi" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Toimitusaika (pv)"><Inp type="number" value={leadDays} onChange={setLeadDays} /></Field>
        </div>
        <Field label="Hinta €">
          <div className="flex gap-2 items-center">
            <input type="number" inputMode="decimal" value={pricePerUnit} onChange={e => setPricePerUnit(e.target.value)}
              placeholder="0.00" className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 focus:border-emerald-500 focus:outline-none" />
            <span className="text-stone-500">€ /</span>
            <select value={priceUnit} onChange={e => {
              const newU = e.target.value;
              const oldFactor = getGroup(priceUnit)?.[priceUnit] || 1;
              const newFactor = getGroup(newU)?.[newU] || 1;
              const converted = (parseFloat(pricePerUnit) || 0) * (newFactor / oldFactor);
              setPricePerUnit(String(Math.round(converted * 1000) / 1000));
              setPriceUnit(newU);
            }} className="border border-stone-200 rounded-xl px-3 py-2.5 bg-white font-medium text-stone-700 min-w-[70px]">
              {getUnitFamily(currentBase).map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </Field>
        <Field label="Minimitilaus">
          <InpWithUnit value={minOrder} onChange={setMinOrder} unit={minOrderUnit} onUnitChange={setMinOrderUnit} baseUnit={currentBase} />
        </Field>
        <Field label="Nykyinen saldo">
          <InpWithUnit value={stockVal} onChange={setStockVal} unit={stockUnit} onUnitChange={setStockUnit} baseUnit={currentBase} big />
        </Field>
        <div className="flex gap-2 mt-2">
          <BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline>
          <Btn onClick={save} disabled={!name} full>{isNew ? "Lisää" : "Tallenna"} ✓</Btn>
        </div>
        {!isNew && (
          <div className="mt-4 pt-3 border-t border-stone-200">
            {!confirm ? (
              <button onClick={() => setConfirm(true)} className="text-sm text-red-500 w-full text-center">Poista raaka-aine...</button>
            ) : (
              <div className="flex gap-2"><BtnOutline onClick={() => setConfirm(false)} full>Peruuta</BtnOutline><Btn onClick={remove} full color="red">Poista pysyvästi</Btn></div>
            )}
          </div>
        )}
      </Modal>
    );
  };

  const EditProductModal = ({ product }) => {
    const isNew = !product;
    const [name, setName] = useState(product?.name || "");
    const [jarSize, setJarSize] = useState(String(product?.jar_size ?? 60));
    const [weeklyRate, setWeeklyRate] = useState(String(product?.weekly_rate ?? 0));
    const [jarsWh, setJarsWh] = useState(String(product?.jars_in_warehouse ?? 0));
    const [color, setColor] = useState(product?.color || "#059669");
    const [confirm, setConfirm] = useState(false);

    const save = async () => {
      const d = { name, jar_size: parseFloat(jarSize) || 60, weekly_rate: parseInt(weeklyRate) || 0,
        jars_in_warehouse: parseInt(jarsWh) || 0, color, active: true };
      if (isNew) await supabase.from("products").insert(d);
      else await supabase.from("products").update(d).eq("id", product.id);
      show(isNew ? "✅ Tuote lisätty!" : "✅ Päivitetty!");
      refetch(); setModal(null);
    };

    const remove = async () => {
      await supabase.from("recipe_items").delete().eq("product_id", product.id);
      await supabase.from("products").update({ active: false }).eq("id", product.id);
      show("Tuote arkistoitu"); refetch(); setModal(null);
    };

    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-4">{isNew ? "➕ Uusi tuote" : `✏️ ${product.name}`}</h3>
        <Field label="Tuotteen nimi"><Inp value={name} onChange={setName} placeholder="Esim. Silky Sage" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Purkin koko (g)"><Inp type="number" value={jarSize} onChange={setJarSize} /></Field>
          <Field label="Väri"><input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 rounded-xl border border-stone-200 cursor-pointer" /></Field>
        </div>
        <Field label="Myyntivauhti (purkkia/viikko)"><Inp type="number" value={weeklyRate} onChange={setWeeklyRate} big /></Field>
        <Field label="3PL-varastosaldo (purkit)"><Inp type="number" value={jarsWh} onChange={setJarsWh} /></Field>
        <div className="flex gap-2 mt-2">
          <BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline>
          <Btn onClick={save} disabled={!name} full>{isNew ? "Lisää" : "Tallenna"} ✓</Btn>
        </div>
        {!isNew && (
          <div className="mt-4 pt-3 border-t border-stone-200">
            {!confirm ? (
              <button onClick={() => setConfirm(true)} className="text-sm text-red-500 w-full text-center">Arkistoi tuote...</button>
            ) : (
              <div className="flex gap-2"><BtnOutline onClick={() => setConfirm(false)} full>Peruuta</BtnOutline><Btn onClick={remove} full color="red">Arkistoi</Btn></div>
            )}
          </div>
        )}
      </Modal>
    );
  };

  const RecipeModal = ({ product }) => {
    const items = recipeItems.filter(r => r.product_id === product.id);
    const [adding, setAdding] = useState(false);
    const [newIngId, setNewIngId] = useState(null);
    const [newAmount, setNewAmount] = useState("");
    const [newAmountUnit, setNewAmountUnit] = useState("g");

    const addItem = async () => {
      const baseAmount = toBase(parseFloat(newAmount) || 0, newAmountUnit);
      await supabase.from("recipe_items").insert({ product_id: product.id, ingredient_id: newIngId, amount_per_jar: baseAmount });
      setAdding(false); setNewAmount(""); refetch();
    };

    const updateItem = async (id, displayValue, displayUnit) => {
      const baseAmount = toBase(parseFloat(displayValue) || 0, displayUnit);
      await supabase.from("recipe_items").update({ amount_per_jar: baseAmount }).eq("id", id);
      refetch();
    };

    const removeItem = async (id) => {
      await supabase.from("recipe_items").delete().eq("id", id);
      refetch();
    };

    const usedIngIds = items.map(i => i.ingredient_id);
    const availableIngs = ingredients.filter(i => !usedIngIds.includes(i.id));

    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-1">📋 Resepti: {product.name}</h3>
        <p className="text-xs text-stone-400 mb-4">Raaka-ainemäärät per purkki</p>
        <div className="space-y-2 mb-3">
          {items.map(ri => {
            const ing = ingredients.find(i => i.id === ri.ingredient_id);
            const baseU = getBaseUnit(ing?.unit || "g"); // Always g, ml, or kpl in recipe
            const displayVal = fromBase(ri.amount_per_jar, ing?.unit || "g"); // Convert if stored unit differs
            return (
              <div key={ri.id} className="flex items-center gap-2 bg-stone-50 rounded-xl p-2.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ing?.color }}></div>
                <span className="flex-1 text-sm font-medium">{ing?.name}</span>
                <input type="number" inputMode="decimal" defaultValue={Math.round(ri.amount_per_jar * 100) / 100}
                  onBlur={e => updateItem(ri.id, e.target.value, baseU)}
                  className="w-20 text-right border border-stone-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:border-emerald-500 focus:outline-none" />
                <span className="text-xs text-stone-400 w-6">{baseU}</span>
                <button onClick={() => removeItem(ri.id)} className="text-red-400 hover:text-red-600 text-lg px-1">×</button>
              </div>
            );
          })}
        </div>

        {items.length > 0 && (
          <div className="bg-emerald-50 rounded-xl p-3 mb-3 text-sm">
            <div className="flex justify-between"><span className="text-stone-600">Raaka-ainekustannus / purkki</span><span className="font-bold">{fmtEur(unitCost(product.id))}</span></div>
            <div className="flex justify-between mt-1"><span className="text-stone-600">Valmistettavissa varastosta</span><span className="font-bold">{fmt(jarsFromStock(product.id))} purkkia</span></div>
          </div>
        )}

        {adding ? (
          <div className="border border-dashed border-stone-300 rounded-xl p-3 space-y-2">
            <select value={newIngId || ""} onChange={e => {
              const id = Number(e.target.value);
              setNewIngId(id);
              const i = ingredients.find(x => x.id === id);
              setNewAmountUnit(i?.unit || "g");
            }} className="w-full border border-stone-200 rounded-xl px-3 py-2 bg-white text-sm">
              <option value="">Valitse raaka-aine...</option>
              {availableIngs.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
            {newIngId && (
              <InpWithUnit value={newAmount} onChange={setNewAmount} unit={newAmountUnit} onUnitChange={setNewAmountUnit}
                baseUnit={ingredients.find(i => i.id === newIngId)?.unit} placeholder="Määrä per purkki" />
            )}
            <div className="flex gap-2">
              <BtnOutline onClick={() => setAdding(false)} full>Peruuta</BtnOutline>
              <Btn onClick={addItem} disabled={!newAmount || !newIngId} full>Lisää ✓</Btn>
            </div>
          </div>
        ) : (
          availableIngs.length > 0 && <button onClick={() => setAdding(true)}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-400 font-medium text-sm hover:border-emerald-400 hover:text-emerald-600 transition-colors">
            + Lisää raaka-aine reseptiin
          </button>
        )}
        <Btn onClick={() => setModal(null)} full className="mt-3" color="stone">Valmis</Btn>
      </Modal>
    );
  };

  const EditOrderModal = ({ order }) => {
    const ing = ingredients.find(i => i.id === order.ingredient_id);
    const initDisp = smartDisplay(order.amount, order.unit);
    const [amount, setAmount] = useState(String(Math.round(initDisp.val * 10) / 10));
    const [amountUnit, setAmountUnit] = useState(initDisp.unit);
    const [price, setPrice] = useState(String(order.price || ""));
    const [notes, setNotes] = useState(order.notes || "");
    const [estDel, setEstDel] = useState(order.estimated_delivery || "");
    const [deliveredAt, setDeliveredAt] = useState(order.delivered_at || "");
    const [confirm, setConfirm] = useState(false);

    const save = async () => {
      const wasDelivered = !!order.delivered_at;
      const nowDelivered = !!deliveredAt;
      const newAmountBase = toBase(parseFloat(amount) || 0, amountUnit);
      const amountDiff = newAmountBase - order.amount;

      await supabase.from("orders").update({
        amount: newAmountBase, price: parseFloat(price) || 0, notes,
        estimated_delivery: estDel || null, delivered_at: deliveredAt || null,
      }).eq("id", order.id);

      if (ing) {
        if (!wasDelivered && nowDelivered) {
          await supabase.from("ingredients").update({ stock: ing.stock + newAmountBase }).eq("id", ing.id);
        } else if (wasDelivered && !nowDelivered) {
          await supabase.from("ingredients").update({ stock: Math.max(0, ing.stock - order.amount) }).eq("id", ing.id);
        } else if (wasDelivered && nowDelivered && amountDiff !== 0) {
          await supabase.from("ingredients").update({ stock: Math.max(0, ing.stock + amountDiff) }).eq("id", ing.id);
        }
      }
      show("✅ Tilaus päivitetty!"); refetch(); setModal(null);
    };

    const remove = async () => {
      if (order.delivered_at && ing) {
        await supabase.from("ingredients").update({ stock: Math.max(0, ing.stock - order.amount) }).eq("id", ing.id);
      }
      await supabase.from("orders").delete().eq("id", order.id);
      show("Tilaus poistettu"); refetch(); setModal(null);
    };

    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-1">✏️ {order.ingredient_name}</h3>
        <p className="text-xs text-stone-400 mb-4">Tilattu {dateStr(order.order_date)} · {order.supplier}</p>
        <Field label="Määrä">
          <InpWithUnit value={amount} onChange={setAmount} unit={amountUnit} onUnitChange={setAmountUnit} baseUnit={order.unit} big />
        </Field>
        <Field label="Hinta €"><Inp type="number" value={price} onChange={setPrice} placeholder="0.00" /></Field>
        <Field label="Arvioitu toimitus"><Inp type="date" value={estDel} onChange={setEstDel} /></Field>
        <Field label="Toteutunut toimitus"><Inp type="date" value={deliveredAt} onChange={setDeliveredAt} /></Field>
        <Field label="Muistiinpanot"><Inp value={notes} onChange={setNotes} placeholder="Huomiot, tilausnumero..." /></Field>
        <div className="flex gap-2">
          <BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline>
          <Btn onClick={save} full>Tallenna ✓</Btn>
        </div>
        <div className="mt-4 pt-3 border-t border-stone-200">
          {!confirm ? (
            <button onClick={() => setConfirm(true)} className="text-sm text-red-500 w-full text-center">Poista tilaus...</button>
          ) : (
            <div className="flex gap-2"><BtnOutline onClick={() => setConfirm(false)} full>Peruuta</BtnOutline><Btn onClick={remove} full color="red">Poista pysyvästi</Btn></div>
          )}
        </div>
      </Modal>
    );
  };

  const SettingsModal = () => {
    const [sw, setSw] = useState(String(settings.safety_weeks));
    const save = async () => {
      await supabase.from("settings").update({ safety_weeks: parseInt(sw) || 3 }).eq("id", settings.id);
      refetch(); setModal(null);
    };
    return (
      <Modal onClose={() => setModal(null)}>
        <h3 className="text-xl font-bold mb-4">⚙️ Yleiset asetukset</h3>
        <Field label="Turvavarasto (viikkoja)">
          <Inp type="number" value={sw} onChange={setSw} big />
          <p className="text-xs text-stone-400 mt-1">Montako viikkoa puskuria haluat raaka-aineisiin</p>
        </Field>
        <div className="flex gap-2"><BtnOutline onClick={() => setModal(null)} full>Peruuta</BtnOutline><Btn onClick={save} full>Tallenna ✓</Btn></div>
      </Modal>
    );
  };

  // ─── NAV ─────────────────────────────────
  const Nav = () => (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-1 py-1 z-20 safe-b">
      <div className="max-w-lg mx-auto flex justify-around">
        {[
          { id: "dashboard", icon: "🏠", label: "Etusivu", badge: urgentIngs.length },
          { id: "ingredients", icon: "📦", label: "Aineet", badge: urgentIngs.length + soonIngs.length },
          { id: "products", icon: "🧴", label: "Tuotteet" },
          { id: "orders", icon: "🚚", label: "Tilaukset", badge: openOrders.length },
          { id: "history", icon: "📋", label: "Historia" },
        ].map(t => (
          <button key={t.id} onClick={() => setView(t.id)}
            className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-medium relative transition-all
              ${view === t.id ? "bg-emerald-100 text-emerald-800" : "text-stone-500"}`}>
            <span className="text-base">{t.icon}</span><span>{t.label}</span>
            {t.badge > 0 && <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>
    </div>
  );

  // ─── VIEWS ───────────────────────────────
  const DashboardView = () => (
    <div className="space-y-4 animate-fade-in">
      {urgentIngs.length > 0 ? (
        <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer active:scale-[0.98]" onClick={() => setView("ingredients")}>
          <span className="text-3xl">🚨</span>
          <div><div className="font-bold text-red-700">{urgentIngs.length} raaka-ainetta tilattava</div>
          <div className="text-sm text-red-600">{urgentIngs.map(i => i.name).join(", ")}</div></div>
        </div>
      ) : soonIngs.length > 0 ? (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 flex items-center gap-3 cursor-pointer" onClick={() => setView("ingredients")}>
          <span className="text-3xl">⚠️</span>
          <div><div className="font-bold text-amber-700">{soonIngs.length} raaka-ainetta loppumassa</div></div>
        </div>
      ) : (
        <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="text-3xl">✅</span><div className="font-bold text-emerald-700">Kaikki kunnossa!</div>
        </div>
      )}

      {activeProducts.map(p => {
        const done = prodThisWeek(p.id);
        const target = p.weekly_rate;
        const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
        const whWeeks = p.weekly_rate > 0 ? p.jars_in_warehouse / p.weekly_rate : 999;
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }}></div>
                <span className="font-bold">{p.name}</span>
              </div>
              <span className="text-xs text-stone-400">{fmtEur(unitCost(p.id))} / purkki</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center"><div className="text-lg font-bold">{fmt(p.jars_in_warehouse)}</div><div className="text-[10px] text-stone-400">3PL varasto</div></div>
              <div className="text-center"><div className="text-lg font-bold">{fmt(jarsFromStock(p.id))}</div><div className="text-[10px] text-stone-400">valmistettavissa</div></div>
              <div className="text-center"><div className={`text-lg font-bold ${whWeeks < 2 ? "text-red-600" : whWeeks < 4 ? "text-amber-600" : ""}`}>{whWeeks < 999 ? fmtDec(whWeeks) : "–"}</div><div className="text-[10px] text-stone-400">viikkoa jäljellä</div></div>
            </div>
            {target > 0 && (
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-stone-500">Viikkotavoite</span>
                  <span className={`font-bold ${done >= target ? "text-emerald-600" : "text-stone-700"}`}>{done} / {target}</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2.5">
                  <div className={`h-2.5 rounded-full transition-all ${done >= target ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }}></div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Btn onClick={() => setModal({ type: "production" })} full className="py-5 text-lg shadow-lg shadow-emerald-200">🏭 Kirjaa tuotanto</Btn>

      {productions.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-200 p-4">
          <h3 className="font-bold text-stone-700 text-sm mb-2">Viimeisimmät erät</h3>
          {productions.slice(0, 5).map(p => {
            const prod = products.find(pr => pr.id === p.product_id);
            return (
              <div key={p.id} className="flex justify-between py-2 border-b border-stone-100 last:border-0">
                <div>
                  <span className="font-bold">{p.jars}</span>
                  <span className="text-stone-400 text-sm"> {prod?.name || "?"} · {p.maker}</span>
                  {p.notes && <div className="text-xs text-stone-400 italic">"{p.notes}"</div>}
                </div>
                <span className="text-xs text-stone-400">{dateStr(p.production_date)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const IngredientsView = () => (
    <div className="space-y-3 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">📦 Raaka-aineet</h2>
        <button onClick={() => setModal({ type: "editIngredient" })} className="text-sm text-emerald-600 font-bold">+ Lisää</button>
      </div>
      {ingredients.map(ing => {
        const status = getIngStatus(ing);
        const maxD = ing.lead_days + safetyDays + 14;
        const pct = Math.min(100, (status.daysLeft / maxD) * 100);
        const disp = displayStock(ing.stock, ing.unit);
        const weeklyUse = ingDailyUse(ing.id) * 7;
        const weeklyDisp = displayStock(weeklyUse, ing.unit);
        const suggest = suggestOrder(ing);
        const suggestDisp = displayStock(suggest, ing.unit);
        return (
          <div key={ing.id} onClick={() => setModal({ type: "editIngredient", ingredient: ing })}
            className={`bg-white rounded-2xl border p-4 cursor-pointer active:scale-[0.98] transition-all
              ${status.color === "red" ? "border-red-300 shadow-md shadow-red-100" : status.color === "amber" ? "border-amber-300" : "border-stone-200"}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: ing.color }}></div>
                <div>
                  <div className="font-bold text-stone-800">{ing.name}</div>
                  <div className="text-[11px] text-stone-400">{ing.supplier || "–"} · {ing.lead_days} pv · {displayPrice(ing.price_per_unit, ing.unit).text}/{displayPrice(ing.price_per_unit, ing.unit).unit}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-lg">{disp.text}<span className="text-sm text-stone-400 font-normal ml-1">{disp.unit}</span></div>
                <StatusBadge color={status.color} label={status.label} />
              </div>
            </div>
            <div className="mt-2.5">
              <div className="flex justify-between text-[11px] text-stone-400 mb-1">
                <span>~{Math.round(status.daysLeft)} pv jäljellä</span>
                <span>{weeklyUse > 0 ? `kulutus ${weeklyDisp.text} ${weeklyDisp.unit}/vko` : "ei kulutusta"}</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${status.color === "red" ? "bg-red-500" : status.color === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }}></div>
              </div>
            </div>
            {status.color !== "emerald" && (
              <button onClick={e => { e.stopPropagation(); setModal({ type: "order", prefillIngId: ing.id }); }}
                className="mt-2.5 w-full py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold active:bg-red-100">
                Tilaa {suggestDisp.text} {suggestDisp.unit} →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  const ProductsView = () => (
    <div className="space-y-3 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">🧴 Tuotteet</h2>
        <button onClick={() => setModal({ type: "editProduct" })} className="text-sm text-emerald-600 font-bold">+ Lisää</button>
      </div>
      <button onClick={() => setModal({ type: "settings" })} className="w-full bg-white rounded-2xl border border-stone-200 p-3 text-left text-sm text-stone-500 flex items-center justify-between">
        <span>⚙️ Yleiset asetukset · Turvavarasto: {settings.safety_weeks} vko</span><span className="text-stone-300">→</span>
      </button>
      {activeProducts.map(p => {
        const items = recipeItems.filter(r => r.product_id === p.id);
        const cost = unitCost(p.id);
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
            <div className="p-4 cursor-pointer" onClick={() => setModal({ type: "editProduct", product: p })}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }}></div>
                  <div>
                    <div className="font-bold text-lg">{p.name}</div>
                    <div className="text-xs text-stone-400">{p.jar_size}g · {p.weekly_rate} purkkia/vko · 3PL: {fmt(p.jars_in_warehouse)}</div>
                  </div>
                </div>
                <span className="text-stone-300 text-lg">✏️</span>
              </div>
            </div>
            <div className="border-t border-stone-100 px-4 py-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-stone-500">RESEPTI ({items.length} ainesosaa)</span>
                <span className="text-sm font-bold text-emerald-700">{fmtEur(cost)} / purkki</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {items.map(ri => {
                  const ing = ingredients.find(i => i.id === ri.ingredient_id);
                  const baseU = getBaseUnit(ing?.unit || "g");
                  return <span key={ri.id} className="text-[10px] bg-stone-100 px-2 py-1 rounded-lg">
                    {ing?.name}: {fmtDec(ri.amount_per_jar)} {baseU}
                  </span>;
                })}
              </div>
              <button onClick={() => setModal({ type: "recipe", product: p })}
                className="w-full py-2 rounded-xl border border-dashed border-stone-300 text-stone-500 text-sm font-medium hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                Muokkaa reseptiä →
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const OrdersView = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold">🚚 Tilaukset</h2>
        <Btn onClick={() => setModal({ type: "order" })} color="purple" className="text-sm py-2">+ Uusi tilaus</Btn>
      </div>
      {openOrders.length > 0 && (
        <div>
          <h3 className="font-bold text-stone-500 text-sm mb-2">⏳ Avoimet ({openOrders.length})</h3>
          {openOrders.map(o => {
            const d = displayStock(o.amount, o.unit);
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-stone-200 p-4 mb-2">
                <div className="flex justify-between items-start">
                  <div className="flex-1 cursor-pointer" onClick={() => setModal({ type: "editOrder", order: o })}>
                    <div className="font-bold">{o.ingredient_name} <span className="text-stone-300 text-sm">✏️</span></div>
                    <div className="text-sm text-stone-500">{d.text} {d.unit} · {o.supplier}</div>
                    <div className="text-xs text-stone-400">Tilattu {dateStr(o.order_date)} · Arvio {dateStr(o.estimated_delivery)}</div>
                    {o.notes && <div className="text-xs text-stone-400 italic mt-1">"{o.notes}"</div>}
                  </div>
                  <Btn onClick={() => receiveOrder(o.id)} className="text-sm py-2 ml-2 whitespace-nowrap">Saapunut ✓</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {orders.filter(o => o.delivered_at).length > 0 && (
        <div>
          <h3 className="font-bold text-stone-500 text-sm mb-2">✅ Toimitetut</h3>
          {orders.filter(o => o.delivered_at).slice(0, 15).map(o => {
            const d = displayStock(o.amount, o.unit);
            return (
              <div key={o.id} className="bg-stone-50 rounded-xl p-3 mb-1.5 text-sm cursor-pointer active:bg-stone-100" onClick={() => setModal({ type: "editOrder", order: o })}>
                <div className="flex justify-between">
                  <span><span className="font-medium">{o.ingredient_name}</span><span className="text-stone-400"> · {d.text} {d.unit}</span> <span className="text-stone-300">✏️</span></span>
                  <span className="text-stone-400 text-xs">{dateStr(o.delivered_at)}</span>
                </div>
                {o.notes && <div className="text-xs text-stone-400 italic">"{o.notes}"</div>}
              </div>
            );
          })}
        </div>
      )}
      {orders.length === 0 && <div className="text-center text-stone-400 py-12">Ei tilauksia vielä</div>}
    </div>
  );

  const HistoryView = () => (
    <div className="space-y-3 animate-fade-in">
      <h2 className="text-lg font-bold">📋 Tuotantohistoria</h2>
      {totalProduced > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <div className="text-3xl font-bold text-emerald-700">{fmt(totalProduced)}</div>
          <div className="text-sm text-emerald-600">purkkia yhteensä · {productions.length} erää</div>
        </div>
      )}
      {productions.map(p => {
        const prod = products.find(pr => pr.id === p.product_id);
        let consumed = []; try { consumed = JSON.parse(p.consumed || "[]"); } catch {}
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-stone-200 p-4">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                {prod && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: prod.color }}></div>}
                <span className="text-lg font-bold">{p.jars} purkkia</span>
                <span className="text-sm text-stone-400">{prod?.name}</span>
              </div>
              <span className="text-xs text-stone-400">{dateStr(p.production_date)}</span>
            </div>
            <div className="text-sm text-stone-500">Valmistaja: {p.maker}</div>
            {p.notes && <div className="text-sm text-stone-400 italic mt-0.5">"{p.notes}"</div>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {consumed.map((c, i) => {
                const d = displayStock(c.amount, c.unit);
                return <span key={i} className="text-[10px] bg-stone-100 px-2 py-0.5 rounded-lg text-stone-500">{c.name}: {d.text} {d.unit}</span>;
              })}
            </div>
          </div>
        );
      })}
      {productions.length === 0 && <div className="text-center text-stone-400 py-12">Ei tuotantoja vielä</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50">
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-lg z-40 animate-slide-up bg-emerald-600 text-white font-bold">{toast}</div>}

      {modal?.type === "production" && <ProductionModal />}
      {modal?.type === "order" && <OrderModal prefillIngId={modal.prefillIngId} />}
      {modal?.type === "editIngredient" && <EditIngredientModal ingredient={modal.ingredient} />}
      {modal?.type === "editProduct" && <EditProductModal product={modal.product} />}
      {modal?.type === "recipe" && <RecipeModal product={modal.product} />}
      {modal?.type === "settings" && <SettingsModal />}
      {modal?.type === "editOrder" && <EditOrderModal order={modal.order} />}

      <div className="bg-white border-b border-stone-200 px-4 py-3 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-stone-800">🌿 Meadow</h1>
            <p className="text-[11px] text-stone-400">{activeProducts.map(p => p.name).join(" · ")}</p>
          </div>
          <button onClick={() => setModal({ type: "settings" })} className="text-stone-400 hover:text-stone-600 p-2 rounded-lg hover:bg-stone-100">⚙️</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto pb-20 px-4 mt-4">
        {view === "dashboard" && <DashboardView />}
        {view === "ingredients" && <IngredientsView />}
        {view === "products" && <ProductsView />}
        {view === "orders" && <OrdersView />}
        {view === "history" && <HistoryView />}
      </div>

      <Nav />
    </div>
  );
}
