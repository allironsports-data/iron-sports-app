import { useState, useMemo } from "react";
import { ArrowLeft, LogOut, BarChart2, FileText, Hash, Users } from "lucide-react";
import type { ScoutingReport, ScoutingPlayer } from "../types";
import type { Profile } from "../contexts/AuthContext";
import logoImg from '../assets/logo.jpeg';

const PRIMARY = "hsl(220,72%,26%)";

// Spanish stop words
const STOP_WORDS = new Set([
  "de","la","el","en","y","a","que","los","las","del","se","es","con","por","un","una",
  "su","para","más","al","o","lo","me","si","ser","fue","tiene","son","sus","pero","como",
  "también","muy","ya","cuando","este","esta","estos","estas","nos","les","le","no","era",
  "han","ha","he","sin","hasta","desde","sobre","entre","después","antes","puede","bien",
  "están","hay","todo","todos","toda","todas","así","aunque","porque","donde","esto","eso",
  "ese","esa","esos","esas","quien","poco","mucho","nada","algo","vez","dos","tres","cuatro",
  "cinco","seis","siete","ocho","nueve","diez","mi","tu","mis","tus","nuestro","vuestro",
  "mal","tan","tanto","cuanto","aquí","ahí","allí","acá","allá","luego","pronto","hoy",
  "ayer","mañana","siempre","nunca","jamás","aún","todavía","sólo","solo","cada","otro",
  "otra","otros","otras","mismo","misma","tal","hace","hizo","había","habría","tenía",
  "tener","siendo","sido","estaba","estará","sería","podría","debería","quería","durante",
  "través","más","sino","ni","e","u","sea","sido","sido","todas","quien","cual","cuales",
  "cual","los","las","les","nos","con","sin","por","para","ante","bajo","cabe","según",
  "tras","mediante","ello","ella","ellos","ellas","nosotros","vosotros","aquél","aquella",
  "aquellos","aquellas","dicho","dichos","mismo","mismos",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

interface Props {
  scoutingReports: ScoutingReport[];
  scoutingPlayers: ScoutingPlayer[];
  profiles: Profile[];
  onBack: () => void;
  onLogout: () => void;
}

export function StatsPanel({ scoutingReports, scoutingPlayers, onBack, onLogout }: Props) {
  const [personFilter, setPersonFilter] = useState<string>("all");
  const [topN, setTopN] = useState<number>(25);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  // Unique scouts from reports
  const scouts = useMemo(() => {
    const set = new Set<string>();
    scoutingReports.forEach(r => { if (r.persona) set.add(r.persona); });
    return Array.from(set).sort();
  }, [scoutingReports]);

  // Reports filtered by scout
  const filteredReports = useMemo(() =>
    personFilter === "all"
      ? scoutingReports
      : scoutingReports.filter(r => r.persona === personFilter),
    [scoutingReports, personFilter]
  );

  const reportsWithText = filteredReports.filter(r => r.texto && r.texto.trim().length > 5);

  // Word frequencies
  const { wordFreq, totalWords } = useMemo(() => {
    const allTokens = reportsWithText.flatMap(r => tokenize(r.texto || ""));
    const freq: Record<string, number> = {};
    allTokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    return { wordFreq: freq, totalWords: allTokens.length };
  }, [reportsWithText]);

  const sortedWords = Object.entries(wordFreq)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1]);

  const topWords = sortedWords.slice(0, topN);
  const maxFreq = topWords[0]?.[1] || 1;
  const uniqueWords = sortedWords.length;

  // Reports that contain the clicked word
  const reportsForWord = useMemo(() =>
    selectedWord
      ? reportsWithText.filter(r => tokenize(r.texto || "").includes(selectedWord))
      : [],
    [selectedWord, reportsWithText]
  );

  // Per-scout stats (always from all reports)
  const scoutStats = useMemo(() =>
    scouts.map(persona => {
      const reps = scoutingReports.filter(r => r.persona === persona && r.texto && r.texto.trim().length > 5);
      const tokens = reps.flatMap(r => tokenize(r.texto || ""));
      const freq: Record<string, number> = {};
      tokens.forEach(w => { freq[w] = (freq[w] || 0) + 1; });
      const top5 = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return { persona, count: reps.length, top5, totalWords: tokens.length };
    }).filter(s => s.count > 0),
    [scouts, scoutingReports]
  );

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

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard icon={<FileText className="w-4 h-4" />} value={scoutingReports.length} label="Informes totales" color="blue" />
          <StatCard icon={<BarChart2 className="w-4 h-4" />} value={reportsWithText.length} label="Con texto analizable" color="green" />
          <StatCard icon={<Hash className="w-4 h-4" />} value={totalWords.toLocaleString("es-ES")} label="Palabras analizadas" color="purple" />
          <StatCard icon={<Users className="w-4 h-4" />} value={uniqueWords.toLocaleString("es-ES")} label="Palabras distintas" color="amber" />
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-400 mr-1">Scout:</span>
          <button
            onClick={() => { setPersonFilter("all"); setSelectedWord(null); }}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
              personFilter === "all" ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
            }`}
            style={personFilter === "all" ? { background: PRIMARY } : {}}
          >
            Todos
          </button>
          {scouts.map(s => (
            <button
              key={s}
              onClick={() => { setPersonFilter(personFilter === s ? "all" : s); setSelectedWord(null); }}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
                personFilter === s ? "text-white border-transparent" : "bg-white border-slate-200 text-slate-500 hover:text-slate-700"
              }`}
              style={personFilter === s ? { background: PRIMARY } : {}}
            >
              {s}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">Mostrar top:</span>
            <select
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-200"
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
            {/* Word frequency bar chart */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-800">Palabras más frecuentes</h2>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {uniqueWords} palabras distintas en {reportsWithText.length} informes · haz clic en una para ver en qué informes aparece
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

            {/* Drill-down: reports containing selected word */}
            {selectedWord && reportsForWord.length > 0 && (
              <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-blue-800">
                      Informes con «{selectedWord}»
                    </h2>
                    <p className="text-[10px] text-blue-500 mt-0.5">
                      {reportsForWord.length} informe{reportsForWord.length !== 1 ? "s" : ""} · aparece {wordFreq[selectedWord]} veces en total
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedWord(null)}
                    className="text-blue-400 hover:text-blue-600 text-xs px-2 py-1 transition-colors"
                  >
                    ✕ cerrar
                  </button>
                </div>
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {reportsForWord.map(r => {
                    const player = scoutingPlayers.find(p => p.id === r.playerId);
                    // Find the word in context
                    const texto = r.texto || "";
                    const normalised = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
                    const idx = normalised.indexOf(selectedWord);
                    const snippet = idx === -1
                      ? texto.slice(0, 130)
                      : texto.slice(Math.max(0, idx - 50), Math.min(texto.length, idx + selectedWord.length + 90));
                    const showEllipsisStart = idx > 50;
                    const showEllipsisEnd = idx !== -1 && idx + selectedWord.length + 90 < texto.length;

                    return (
                      <div key={r.id} className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          {player && (
                            <span className="text-xs font-semibold text-slate-800">{player.fullName}</span>
                          )}
                          {r.persona && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">{r.persona}</span>
                          )}
                          {r.fecha && (
                            <span className="text-[10px] text-slate-400">
                              {new Date(r.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" })}
                            </span>
                          )}
                          {r.conclusion && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ml-auto ${
                              r.conclusion === "Firmar"   ? "bg-green-100 text-green-700" :
                              r.conclusion === "Descartar" ? "bg-red-100 text-red-600"   :
                              "bg-amber-100 text-amber-700"
                            }`}>
                              {r.conclusion}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {showEllipsisStart && "…"}{snippet}{showEllipsisEnd && "…"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-scout vocabulary breakdown */}
            {scoutStats.length > 1 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-800">Vocabulario por scout</h2>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Palabras más usadas por cada observador · clic para filtrar
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {scoutStats.map(({ persona, count, top5, totalWords: tw }) => (
                    <div key={persona} className="px-4 py-3.5 flex items-start gap-4">
                      <div
                        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-white mt-0.5"
                        style={{ background: PRIMARY }}
                      >
                        {persona}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700">{persona}</span>
                          <span className="text-[10px] text-slate-400">
                            {count} informe{count !== 1 ? "s" : ""} · {tw.toLocaleString("es-ES")} palabras
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {top5.map(([w, n], i) => (
                            <button
                              key={w}
                              onClick={() => setSelectedWord(selectedWord === w ? null : w)}
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                                selectedWord === w
                                  ? "bg-blue-100 border-blue-300 text-blue-700"
                                  : i === 0
                                  ? "bg-slate-100 border-slate-200 text-slate-700 hover:border-slate-300"
                                  : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                              }`}
                            >
                              {w}
                              <span className="opacity-50 tabular-nums">·{n}</span>
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
      </main>
    </div>
  );
}

function StatCard({
  icon, value, label, color,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
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
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center mb-2 ${palette[color]}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-slate-800 tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</p>
    </div>
  );
}
