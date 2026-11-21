/* messaggi.js — i messaggi di conferma dell'open day (anteprima approvata: anteprima/messaggi.html).
   Si costruiscono a pezzi (saluto · conferma · dove · programma · chi viene · chiusura): ogni pezzo ha
   alcune varianti; il giro 0 dà il messaggio classico dell'utente, «Altre 2» rimescola.
   Regole dell'utente (2026-10-30): tono AFFERMATIVO (come se si iscrivesse al 100%), niente «ci vediamo» né
   «ti aspetto» (chi scrive spesso non è all'open day), niente «il ritrovo»; online ci si collega 10 minuti prima
   (di persona 15) con foglio, penna, webcam e microfono accesi. */

const PEZZI = {
  saluto: ["Ciao {nome}, come stai? 😊", "Ciao {nome}! Come stai? 😊", "{buon} {nome}, tutto bene? 😊", "Ehi {nome}, come va? 😊"],
  conferma: ["Piccolo messaggio di conferma per {q}!", "Piccolo promemoria per l'open day di {q}!", "Tutto confermato per {q}!", "Ti scrivo per confermarti l'open day di {q}!"],
  sede: ["L'appuntamento è in {via} alle {arrivo}, per cominciare alle {inizio}.", "L'appuntamento è alle {arrivo} in {via}: si comincia alle {inizio}.",
    "Appuntamento in {via} alle {arrivo}, per iniziare alle {inizio}.", "L'open day è in {via}: arrivo alle {arrivo}, inizio alle {inizio}."],
  zoom: ["La lezione è su Zoom alle {inizio}: collegati 10 minuti prima, alle {arrivo}. {link}", "L'appuntamento è su Zoom alle {inizio}: entra alle {arrivo}, così partiamo puntuali. {link}",
    "Collegati su Zoom alle {arrivo}, per cominciare alle {inizio}. {link}", "La lezione parte alle {inizio} su Zoom: entra 10 minuti prima. {link}"],
  prepara: ["Tieni con te un foglio di carta e una penna, e accertati che webcam e microfono funzionino: tienili accesi, perché sarà una lezione molto interattiva!",
    "Prepara un foglio e una penna, e controlla che webcam e microfono funzionino. Tienili aperti per tutta la lezione: sarà molto interattiva!",
    "Mi raccomando: foglio, penna, webcam e microfono accesi! Sarà una lezione molto interattiva.",
    "Ti serviranno un foglio e una penna; accertati anche che webcam e microfono funzionino e tienili aperti, perché la lezione sarà molto interattiva!"],
  programma: ["Ci sarà una parte teorica, una parte pratica e infine ti verrà spiegato come è strutturato il corso per scegliere di fare questa esperienza e usufruire anche di una promozione decidendo {qs}!",
    "Come ti dicevo, ci sarà una parte teorica, una parte pratica e infine ti verrà spiegato come è strutturato il corso per scegliere di fare questa esperienza e usufruire anche di una promozione decidendo {qs}!",
    "Faremo una parte di teoria e una di pratica, e alla fine ti verrà spiegato come è organizzato il corso, per scegliere di iniziare questa esperienza usufruendo anche della promozione riservata a chi decide {qs}!",
    "Prima teoria, poi pratica, e infine ti verrà spiegato come è strutturato il corso per iniziare questa esperienza, con una promozione dedicata a chi decide {qs}!"],
  famiglia: ["Sei riuscito a parlarne {con}? {conferma} Sarà utile anche {a} vedere da vicino come funziona il corso!",
    "Hai parlato {con}? {conferma} Sarà utile anche {a} vedere da vicino come funziona il corso!"],
  chiusura: ["Vedrai che varrà la pena esserci!\nConfermami di aver letto, così so che hai tutte le info 💪🏻", "Vedrai che varrà la pena esserci!\nConfermami di aver letto, così so che hai tutte le info 💪🏻",
    "Ne varrà davvero la pena, vedrai!\nMandami un ok quando leggi, così so che hai tutto 💪🏻", "Vedrai, ne vale la pena!\nRispondimi anche solo con un ok, così so che hai letto 💪🏻"],
};

/** chi può venire con la persona: [nome sul pulsante, come si dice dopo «con», genere: m · f · p (plurale)] */
export const COMP = {
  mamma: ["Mamma", "la mamma", "f"], papa: ["Papà", "il papà", "m"],
  figlio: ["Figlio", "tuo figlio", "m"], figlia: ["Figlia", "tua figlia", "f"],
  marito: ["Marito", "tuo marito", "m"], moglie: ["Moglie", "tua moglie", "f"],
  compagno: ["Compagno", "il tuo compagno", "m"], compagna: ["Compagna", "la tua compagna", "f"],
  fidanzato: ["Fidanzato", "il tuo fidanzato", "m"], fidanzata: ["Fidanzata", "la tua fidanzata", "f"],
  fratello: ["Fratello", "tuo fratello", "m"], sorella: ["Sorella", "tua sorella", "f"],
  nonno: ["Nonno", "tuo nonno", "m"], nonna: ["Nonna", "tua nonna", "f"],
  amico: ["Amico", "il tuo amico", "m"], amica: ["Amica", "la tua amica", "f"],
  amici: ["Amici", "i tuoi amici", "p"], collega: ["Collega", "il tuo collega", "m"],
};
const elenco = v => v.length < 2 ? v.join("") : v.slice(0, -1).join(", ") + " e " + v[v.length - 1];

/** dai pulsanti scelti + il testo «Altro…» a come si scrive la domanda; nessuno scelto = nessuna domanda */
function compagnia(sel, altro) {
  const scelti = sel.filter(k => COMP[k]).map(k => COMP[k]), testo = (altro || "").trim();
  if (!scelti.length && !testo) return null;
  const con = "con " + elenco([...scelti.map(c => c[1]), ...(testo ? [testo] : [])]);
  if (testo) return { con, conferma: "Mi confermi chi viene con te?", a: "a chi ti accompagna" };      // testo libero: niente genere da indovinare
  if (scelti.length > 1 || scelti[0][2] === "p") return { con, conferma: "Mi confermi che vengono anche loro?", a: "a loro" };
  const f = scelti[0][2] === "f";
  return { con, conferma: `Mi confermi che viene anche ${f ? "lei" : "lui"}?`, a: f ? "a lei" : "a lui" };
}

const giorno = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const ora = d => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

/** il giorno detto bene rispetto a quando scrivi: oggi · domani · sabato (entro 6 giorni) · sabato 7 novembre */
export function quandoDetto(inizio, adesso) {
  const diff = Math.round((giorno(inizio) - giorno(adesso)) / 864e5), gs = inizio.toLocaleDateString("it-IT", { weekday: "long" });
  if (diff <= 0) return { q: "oggi", qs: "oggi stesso" };
  if (diff === 1) return { q: "domani", qs: "domani stesso" };
  if (diff < 7) return { q: gs, qs: gs + " stesso" };
  return { q: inizio.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }), qs: "quel giorno stesso" };
}

const caso = s => () => (s = (s * 9301 + 49297) % 233280) / 233280;
function ordine(n, giro, k) {
  const ix = [...Array(n).keys()];
  if (giro === 0) return ix;                       // primo giro: il messaggio 1 è il classico
  const r = caso(giro * 31 + k * 7);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ix[i], ix[j]] = [ix[j], ix[i]]; }
  return ix;
}

/** i 2 messaggi. od = { tipo, quando (ISO), via, zoom }; sel = chiavi di COMP; altro = testo libero */
export function messaggi({ nome, od, adesso = new Date(), giro = 0, sel = [], altro = "" }) {
  const inizio = new Date(od.quando), online = od.tipo === "zoom" || od.tipo === "nazionale";
  const arrivo = new Date(inizio - (online ? 10 : 15) * 6e4);
  const val = { ...(compagnia(sel, altro) || {}), nome: (nome || "").split(" ")[0] || "", buon: adesso.getHours() < 14 ? "Buongiorno" : "Buonasera",
    ...quandoDetto(inizio, adesso), via: od.via || "sede", arrivo: ora(arrivo), inizio: ora(inizio),
    link: od.zoom ? "Ecco il link: " + od.zoom : "Il link te lo mando poco prima." };
  const parti = ["saluto", "conferma", online ? "zoom" : "sede", ...(online ? ["prepara"] : []), "programma", ...(compagnia(sel, altro) ? ["famiglia"] : []), "chiusura"];
  const sc = parti.map((p, k) => ordine(PEZZI[p].length, giro, k));
  return [0, 1].map(i => parti.map((p, k) => PEZZI[p][sc[k][i]]).join("\n").replace(/\{(\w+)\}/g, (_, c) => val[c] ?? "").replace(/ +\n/g, "\n"));
}
