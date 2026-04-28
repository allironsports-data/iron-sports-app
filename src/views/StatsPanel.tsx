import { useState, useMemo } from "react";
import { ArrowLeft, LogOut, BarChart2, FileText, Hash, TrendingUp, Target } from "lucide-react";
import type { ScoutingReport, ScoutingPlayer } from "../types";
import type { Profile } from "../contexts/AuthContext";
import logoImg from '../assets/logo.jpeg';

const PRIMARY = "hsl(220,72%,26%)";

// ── Stop words ────────────────────────────────────────────────
// Includes generic quality words ("buen", "gran", "más") so only
// meaningful football vocabulary and valuations survive.
const STOP_WORDS = new Set([
  // Articles / pronouns / prepositions / conjunctions
  "de","la","el","en","y","a","que","los","las","del","se","es","con","por","un","una",
  "su","para","al","o","lo","me","si","nos","les","le","no","ni","e","u","sino",
  "mis","tus","sus","mi","tu","nuestro","vuestro","ello","ella","ellos","ellas",
  "nosotros","vosotros","aquél","aquella","aquellos","aquellas","quien","cual","cuales",
  "este","esta","estos","estas","ese","esa","esos","esas","esto","eso","dicho","dichos",
  "mismo","misma","mismos","otro","otra","otros","otras","cada","tal","tanto","cuanto",
  "ante","bajo","cabe","según","tras","mediante","sin","sobre","entre","hasta","desde",
  "aunque","porque","donde","así","cuando","luego","pronto","aquí","ahí","allí","acá","allá",
  // Generic verbs (auxiliaries / statives)
  "ser","fue","era","sido","siendo","es","son","era","eran","sea","sean",
  "tener","tiene","tenía","tenían","tener","ha","han","he","había","habría","haber",
  "hace","hizo","hacer","hecho","hacía","hacen","pueden","podría","puede","poder",
  "estar","está","estaba","estaban","estará","estaría","están",
  "ver","visto","vio","ve","ven","ir","fue","van","va","iba","ibán",
  "ser","quería","debería","sería","llevar","lleva","llevaba","poner","ponía",
  "saber","conocer","parecer","parece","parecía","dejar","trata","intenta",
  // Generic adverbs / intensifiers — the ones the user flagged
  "muy","más","mas","menos","tan","bastante","demasiado","tampoco","también",
  "ya","aún","todavía","siempre","nunca","jamás","sólo","solo","casi","antes",
  "después","durante","ahora","hoy","ayer","mañana","pronto","tarde","bien","mal",
  // Generic adjectives — the ones the user flagged
  "buen","buena","buenos","buenas","gran","grande","grandes",
  "mal","mala","malos","malas","mejor","peor","mismo","misma",
  "nuevo","nueva","nuevos","nuevas","último","última","próximo","próxima",
  // Generic quantity / time words
  "todo","todos","toda","todas","nada","algo","poco","mucho","varios","varias",
  "vez","veces","año","años","momento","momentos","vez","tiempo","forma","parte",
  "dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez",
  // Generic context words (too broad for scouting analysis)
  "nivel","tipo","manera","caso","mientras","aunque","partido","partidos",
  "jugador","jugadores","equipo","equipos","jugó","juega","jugaba",
  // Other
  "hay","hay","hay","sino","pero","como","ya","también","además","embargo",
  "través","según","dicho","sido","estado",
]);

// ── Tokeniser ─────────────────────────────────────────────────
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip accents
    .replace(/[^a-z\s]/g, " ")          // letters only
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

function wordFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  tokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return freq;
}

// ── Types ──────────────────────────────────────────────────────
interface Props {
  scoutingReports: ScoutingReport[];
  scoutingPlayers: ScoutingPlayer[];
  profiles: Profile[];
  onBack: () => void;
  onLogout: () => void;
}

const CONCLUSION_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  "Firmar":   { label: "Firmar",   color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200" },
  "Seguir":   { label: "Seguir",   color: "text-blue-700",    bg: "bg-blue-50",     border: "border-blue-200"    },
  "Descartar":{ label: "Descartar",color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200"     },
  "Decidir":  { label: "Decidir",  color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200"   },
};

// ── Main component ────────────────────────────────────────────
export function StatsPanel({ scoutingReports, scoutingPlayers, onBack, onLogout }: Props) {
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [topN, setTopN] = useState<number>(25);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"frecuencia" | "valoracion" | "actividad">("frecuencia");

  // ── Scouts list ──────────────────────────────────────────────
  const scouts = useMemo(() => {
    const set = new Set<string>();
    scoutingReports.forEach(r => { if (r.persona) set.add(r.persona); });
    return Array.from(set).sort();
  }, [scoutingReports]);

  // ── Filtered reports ─────────────────────────────────────────
  const filteredReports = useMemo(() =>
    personFilter === "all"
      ? scoutingReports
      : scoutingReports.filter(r => r.persona === personFilter),
    [scoutingReports, personFilter]
  );

  const reportsWithText = filteredReports.filter(r => r.texto && r.texto.trim().length > 5);

  // ── Global word frequencies ───────────────────────────────────
  const { wordFreq, totalWords } = useMemo(() => {
    const tokens = reportsWithText.flatMap(r => tokenize(r.texto || ""));
    return { wordFreq: wordFrequency(tokens), totalWords: tokens.length };
  }, [reportsWithText]);

  const sortedWords = Object.entries(wordFreq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);
  const topWords   = sortedWords.slice(0, topN);
  const maxFreq    = topWords[0]?.[1] || 1;
  const uniqueWords = sortedWords.length;

  // ── Drill-down: reports for selected word ─────────────────────
  const reportsForWord = useMemo(() =>
    selectedWord
      ? reportsWithText.filter(r => tokenize(r.texto || "").includes(selectedWord))
      : [],
    [selectedWord, reportsWithText]
  );

  // ── Per-scout vocabulary ──────────────────────────────────────
  const scoutStats = useMemo(() =>
    scouts.map(persona => {
      const reps = scoutingReports.filter(r => r.persona === persona && r.texto && r.texto.trim().length > 5);
      const tokens = reps.flatMap(r => tokenize(r.texto || ""));
      const freq   = wordFrequency(tokens);
      const top5   = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return { persona, count: reps.length, top5, totalWords: tokens.length };
    }).filter(s => s.count > 0),
    [scouts, scoutingReports]
  );

  // ── Words by conclusion (valoración) ─────────────────────────
  // For each conclusion bucket, compute which words appear most,
  // weighted by their "exclusivity" vs the overall corpus.
  const conclusionGroups = useMemo(() => {
    const conclusions = Object.keys(CONCLUSION_META);
    return conclusions.map(conclusion => {
      const reps = scoutingReports.filter(
        r => r.conclusion === conclusion && r.texto && r.texto.trim().length > 5
      );
      const tokens = reps.flatMap(r => tokenize(r.texto || ""));
      const freq   = wordFrequency(tokens);
      // Score: raw frequency weighted by how exclusive to this group (vs global)
      const scored = Object.entries(freq)
        .map(([w, n]) => {
          const globalRate = (wordFreq[w] || 0) / Math.max(totalWords, 1);
          const localRate  = n / Math.max(tokens.length, 1);
          const exclusivity = globalRate > 0 ? localRate / globalRate : localRate;
          return { word: w, count: n, score: exclusivity * Math.log(1 + n) };
        })
        .filter(x => x.count >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return { conclusion, reps: reps.length, tokens: tokens.length, words: scored };
    }).filter(g => g.reps > 0);
  }, [scoutingReports, wordFreq, totalWords]);

  // ── Activity by month ─────────────────────────────────────────
  const activityByMonth = useMemo(() => {
    const counts: Record<string, number> = {};
    reportsWithText.forEach(r => {
      const d = r.fecha ? new Date(r.fecha) : null;
      if (!d || isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-18);   // last 18 months
  }, [reportsWithText]);
  const maxMonthCount = Math.max(...activityByMonth.map(([, n]) => n), 1);

  // ── Snippet helper ────────────────────────────────────────────
  function snippet(texto: string, word: string) {
    const norm = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const idx  = norm.indexOf(word);
    if (idx === -1) return texto.slice(0, 130) + "…";
    const s = Math.max(0, idx - 50);
    const e = Math.min(texto.length, idx + word.length + 90);
    return (s > 0 ? "…" : "") + texto.slice(s, e) + (e < texto.length ? "…" : "");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-11 sm:h-14 flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-slate-600 p-1 -ml-1 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
            <img src={logoImg} className="w-full h-full object-contain p-0.5" alt="AIS" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900">Estadísticas de Informes</h1>
            <p className="text-[10px] text-slate-400 hidden sm:block">Análisis de contenido · Solo admins</p>
          </div>
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600 p-1 transition-colors">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-20 sm:pb-10 space-y-5">

        {/* ── Summary cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard icon={<FileText  className="w-4 h-4" />} value={scoutingReports.length}           label="Informes totales"     color="blue"   />
          <StatCard icon={<BarChart2 className="w-4 h-4" />} value={reportsWithText.length}           label="Con texto analizable" color="green"  />
          <StatCard icon={<Hash      className="w-4 h-4" />} value={totalWords.toLocaleString("es-ES")} label="Palabras analizadas"  color="purple" />
          <StatCard icon={<Target    className="w-4 h-4" />} value={uniqueWords.toLocaleString("es-ES")} label="Términos distintos"   color="amber"  />
        </div>

        {/* ── Scout filter + top-N ────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 mr-1">Scout:</span>
          <button
            onClick={() => { setPersonFilter("all"); setSelectedWord(null); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
              personFilter === "all" ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
            style={personFilter === "all" ? { background: PRIMARY } : {}}
          >Todos</button>
          {scouts.map(s => (
            <button
              key={s}
              onClick={() => { setPersonFilter(personFilter === s ? "all" : s); setSelectedWord(null); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
                personFilter === s ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
              style={personFilter === s ? { background: PRIMARY } : {}}
            >{s}</button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">Top:</span>
            <select
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none"
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {reportsWithText.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl text-center py-16 text-slate-400 text-sm">
            No hay informes con contenido de texto para analizar
          </div>
        ) : (
          <>
            {/* ── Analysis tabs ───────────────────────────────── */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1 w-fit">
              {([
                { id: "frecuencia"  as const, label: "Frecuencia",  icon: <BarChart2    className="w-3.5 h-3.5" /> },
                { id: "valoracion"  as const, label: "Por valoración", icon: <Target    className="w-3.5 h-3.5" /> },
                { id: "actividad"   as const, label: "Actividad",   icon: <TrendingUp   className="w-3.5 h-3.5" /> },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? "text-white"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  style={activeTab === tab.id ? { background: PRIMARY } : {}}
                >
                  {tab.icon}
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* ════════════════════════════════════════════════════
                TAB 1 — FRECUENCIA
            ════════════════════════════════════════════════════ */}
            {activeTab === "frecuencia" && (
              <>
                {/* Bar chart */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-800">Palabras más frecuentes</h2>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {uniqueWords} términos distintos en {reportsWithText.length} informes · clic en una para ver contexto
                    </p>
                  </div>
                  <div className="p-4 space-y-1.5">
                    {topWords.map(([word, count]) => {
                      const pct = Math.round((count / maxFreq) * 100);
                      const isSelected = selectedWord === word;
                      return (
                        <button
                          key={word}
                          onClick={() => setSelectedWord(isSelected ? null : word)}
                          className={`w-full flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors ${
                            isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                          }`}
                        >
                          <span className={`text-xs font-semibold w-28 text-left truncate ${isSelected ? "text-blue-700" : "text-slate-700"}`}>
                            {word}
                          </span>
                          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${pct}%`, background: isSelected ? "#3b82f6" : PRIMARY }}
                            />
                          </div>
                          <span className={`text-xs font-bold w-8 text-right flex-shrink-0 tabular-nums ${isSelected ? "text-blue-700" : "text-slate-400"}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Drill-down */}
                {selectedWord && reportsForWord.length > 0 && (
                  <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-blue-800">Informes con «{selectedWord}»</h2>
                        <p className="text-[10px] text-blue-500 mt-0.5">
                          {reportsForWord.length} informe{reportsForWord.length !== 1 ? "s" : ""} · aparece {wordFreq[selectedWord]} veces
                        </p>
                      </div>
                      <button onClick={() => setSelectedWord(null)} className="text-blue-400 hover:text-blue-600 text-xs px-2 py-1 transition-colors">
                        ✕
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {reportsForWord.map(r => {
                        const player = scoutingPlayers.find(p => p.id === r.playerId);
                        return (
                          <div key={r.id} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              {player && <span className="text-xs font-semibold text-slate-800">{player.fullName}</span>}
                              {r.persona && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">{r.persona}</span>}
                              {r.fecha && <span className="text-[10px] text-slate-400">{new Date(r.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" })}</span>}
                              {r.conclusion && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto ${
                                  r.conclusion === "Firmar"    ? "bg-green-100 text-green-700" :
                                  r.conclusion === "Descartar" ? "bg-red-100 text-red-600"     :
                                  "bg-amber-100 text-amber-700"
                                }`}>{r.conclusion}</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">{snippet(r.texto || "", selectedWord)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Per-scout vocabulary (only when showing all) */}
                {personFilter === "all" && scoutStats.length > 1 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                      <h2 className="text-sm font-semibold text-slate-800">Vocabulario por scout</h2>
                      <p className="text-[10px] text-slate-400 mt-0.5">Palabras más usadas por cada observador</p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {scoutStats.map(({ persona, count, top5, totalWords: tw }) => (
                        <div key={persona} className="px-4 py-3.5 flex items-start gap-4">
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5" style={{ background: PRIMARY }}>
                            {persona}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-700">{persona}</span>
                              <span className="text-[10px] text-slate-400">{count} informe{count !== 1 ? "s" : ""} · {tw.toLocaleString("es-ES")} palabras</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {top5.map(([w, n], i) => (
                                <button
                                  key={w}
                                  onClick={() => setSelectedWord(selectedWord === w ? null : w)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                    selectedWord === w ? "bg-blue-100 border-blue-300 text-blue-700"
                                    : i === 0 ? "bg-slate-100 border-slate-200 text-slate-700"
                                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                  }`}
                                >
                                  {w}<span className="opacity-50 tabular-nums">·{n}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ════════════════════════════════════════════════════
                TAB 2 — POR VALORACIÓN
            ════════════════════════════════════════════════════ */}
            {activeTab === "valoracion" && (
              <>
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-1">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Qué vocabulario aparece en cada tipo de conclusión. Las palabras con mayor puntuación son las más
                    <em> características</em> de ese grupo — no sólo las más frecuentes en general, sino las que aparecen
                    de forma desproporcionada en informes con esa valoración.
                  </p>
                </div>

                {conclusionGroups.length === 0 ? (
                  <div className="bg-white border border-slate-200 rounded-xl text-center py-12 text-slate-400 text-sm">
                    No hay informes con conclusión registrada
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {conclusionGroups.map(({ conclusion, reps, words }) => {
                      const meta = CONCLUSION_META[conclusion] ?? { label: conclusion, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200" };
                      const localMax = words[0]?.count || 1;
                      return (
                        <div key={conclusion} className={`bg-white border ${meta.border} rounded-xl overflow-hidden`}>
                          <div className={`px-4 py-3 border-b ${meta.border} ${meta.bg} flex items-center justify-between`}>
                            <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.border} ${meta.color} ${meta.bg}`}>
                              {reps} informe{reps !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="p-3 space-y-1.5">
                            {words.map(({ word, count }) => {
                              const pct = Math.round((count / localMax) * 100);
                              const colorBar =
                                conclusion === "Firmar"    ? "#10b981" :
                                conclusion === "Descartar" ? "#ef4444" :
                                conclusion === "Seguir"    ? "#3b82f6" : "#f59e0b";
                              return (
                                <button
                                  key={word}
                                  onClick={() => { setSelectedWord(selectedWord === word ? null : word); setActiveTab("frecuencia"); }}
                                  className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 transition-colors group"
                                >
                                  <span className="text-xs font-semibold w-24 text-left truncate text-slate-700 group-hover:text-slate-900">{word}</span>
                                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorBar }} />
                                  </div>
                                  <span className="text-[10px] font-bold w-6 text-right text-slate-400 tabular-nums">{count}</span>
                                </button>
                              );
                            })}
                            {words.length === 0 && (
                              <p className="text-[11px] text-slate-400 italic py-2 text-center">Sin suficiente texto para analizar</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ════════════════════════════════════════════════════
                TAB 3 — ACTIVIDAD
            ════════════════════════════════════════════════════ */}
            {activeTab === "actividad" && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Actividad de informes por mes</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">Últimos 18 meses · sólo informes con texto</p>
                </div>
                {activityByMonth.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">Sin datos de fecha en los informes</div>
                ) : (
                  <div className="p-4">
                    {/* Bars */}
                    <div className="flex items-end gap-1.5 h-32">
                      {activityByMonth.map(([month, count]) => {
                        const pct = Math.round((count / maxMonthCount) * 100);
                        const [yr, mo] = month.split("-");
                        const monthName = new Date(Number(yr), Number(mo) - 1).toLocaleDateString("es-ES", { month: "short" });
                        return (
                          <div key={month} className="flex-1 flex flex-col items-center gap-1 group">
                            <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">{count}</span>
                            <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(pct, 4)}%`, background: PRIMARY }} />
                          </div>
                        );
                      })}
                    </div>
                    {/* X-axis labels */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {activityByMonth.map(([month, count]) => {
                        const [yr, mo] = month.split("-");
                        const monthName = new Date(Number(yr), Number(mo) - 1).toLocaleDateString("es-ES", { month: "short" });
                        const isFirst = mo === "01";
                        return (
                          <div key={month} className="flex-1 text-center">
                            <span className={`text-[8px] ${isFirst ? "font-bold text-slate-600" : "text-slate-400"}`}>
                              {isFirst ? yr : monthName.slice(0, 1).toUpperCase()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Summary */}
                    <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-base font-bold text-slate-800">{reportsWithText.length}</p>
                        <p className="text-[10px] text-slate-400">Total informes</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-800">
                          {activityByMonth.length > 0
                            ? (reportsWithText.length / activityByMonth.length).toFixed(1)
                            : "—"}
                        </p>
                        <p className="text-[10px] text-slate-400">Media/mes</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-slate-800">
                          {activityByMonth.reduce((max, [, n]) => Math.max(max, n), 0)}
                        </p>
                        <p className="text-[10px] text-slate-400">Máximo mensual</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  icon, value, label, color,
}: {
  icon: React.ReactNode; value: string | number; label: string;
  color: "blue" | "green" | "purple" | "amber";
}) {
  const palette = {
    blue:   "bg-blue-50 text-blue-600",
    green:  "bg-emerald-50 text-emerald-600",
    purple: "bg-violet-50 text-violet-600",
    amber:  "bg-amber-50 text-amber-600",
  };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${palette[color]}`}>{icon}</div>
      <p className="text-xl font-bold text-slate-800 tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
