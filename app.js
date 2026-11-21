/* app.js — il regista: disegna le schermate dentro <main> e risponde ai tocchi.
   Indirizzi (dopo il #):
     /                     le mie classi            /entra/LM-1234        entra con il codice
     /c/<id>               i miei contatti (lista o orto)
     /c/<id>/openday       gli open day della squadra
     /c/<id>/squadra       riquadri della squadra o statistiche di una persona, e i contatti
     /c/<id>/diario        diario di bordo (privato) /c/<id>/classe        invito, membri, impostazioni
     /c/<id>/nuovo         nuovo contatto, passo 1 (davanti alla persona)
     /c/<id>/qr            il QR: la persona compila il modulo dal suo telefono (modulo.html)
     /c/<id>/appunti/<k>   passo 2: i miei appunti (dopo, da solo)
     /c/<id>/k/<k>         scheda del contatto       /c/<id>/perche/<n>    il mio perché, domanda n
   Lo schermo è fisso: barra in alto e schede in basso stanno ferme, scorre solo .corpo
   (così su iPhone il "rimbalzo" non si porta dietro la barra delle schede). */
import * as D from "./dati.js";
import { svgPianta, stadio, STADI } from "./piantina.js";
import { ic, UMORI, DA_EMOJI } from "./icone.js";
import { caricaComuni, campoComune, attivaComuni, trova, km, normalizzaCitta } from "./comuni.js";
import { statoNotifiche, attivaNotifiche, registraDispositivo } from "./push.js";
import { IMPOSTAZIONI_INIZIALI } from "./prova.js";
import { messaggi, quandoDetto, COMP } from "./messaggi.js";

const $app = document.getElementById("app");
const $avviso = document.getElementById("avviso");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => crypto.randomUUID();
const ricorda = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* niente */ } };
const ricordato = k => { try { return localStorage.getItem(k); } catch { return null; } };

/** le categorie degli appunti (in quest'ordine anche nella scheda e nel testo da condividere) */
const CATEGORIE = [
  ["chi", "Chi è", "Cosa fa, cosa studia, come ci ha conosciuti…"],
  // bisogno, utilità e il suo perché = UNA voce sola (scelta dell'utente, 2026-11-19): si salva in `bisogno`;
  // i vecchi `utilita` e `motivazione` si mostrano uniti lì (`valoreApp`) e si svuotano alla prima modifica
  ["bisogno", "Bisogno, utilità e il suo perché", "Di cosa ha bisogno nello studio? A cosa gli servirebbe il corso? Perché vuole venire?"],
  ["obiezioni", "Preoccupazioni e obiezioni", "Dubbi, paure, pippe mentali, cosa potrebbe obiettare all'open day (tempo, soldi…)"],
];
const FASCE = ["Superiori", "Università", "Lavoro", "Genitore", "Altro"];
const valoreApp = (d, k) => k === "bisogno" ? [d.bisogno, d.utilita, d.motivazione].filter(x => x?.trim()).join("\n") : d[k];
const INTERESSE = ["", "Poco", "Medio", "Molto"];
const SPUNTI = ["Cosa è andato bene oggi?", "Cosa ho allenato del mio perché?", "Quale incontro mi è rimasto dentro?",
  "Cosa farei diversamente la prossima volta?", "Cosa ho imparato dalle persone che ho fermato?", "Come mi sento adesso?"];
const TRAGUARDI = [
  { k: "risposto", testo: "Ha risposto", stadio: 1 },
  { k: "confermato", testo: "Ha confermato", stadio: 2 },
  { k: "iscritto", testo: "Iscritto", stadio: 3 },
];
const mini = st => `<span class="pianta-icona">${svgPianta(st)}</span>`;   // la piantina piccola, al posto delle emoji 🌱🌿🌸
const umore = k => UMORI.find(u => u.k === (DA_EMOJI[k] || k)) || null;

// stato della schermata (non salvato)
const U = {
  pannello: null,        // classi: "crea" | "entra"
  nuovoAccount: false,
  vista: ricordato("volantini.vista") || (ricordato("volantini.orto") === "1" ? "orto" : "lista"),   // I miei: lista | dafare | orto
  cerca: "", filtro: "tutti", chi: "tutti",
  bozza: null,           // il contatto in scrittura (passo 1)
  perche: 0,             // quale risposta del perché mostrare
  conferma: null,        // pulsante "tocca di nuovo per confermare"
  notaAperta: null, tappaBozza: null, odDettaglio: null, odModifica: null, odPassati: false,
  appenaPiantato: null, cresciuta: null,
  squadraLista: false,   // Squadra: la lista di tutti i contatti, aperta a parte
  daRidisegnare: false,
  calInizio: null,       // calendario dell'open day: il lunedì della prima settimana mostrata (ISO)
  msg: null, msgMemo: {},   // foglio dei messaggi di conferma: {kid, giro, sel[], altro}; e cosa avevo scelto per ogni persona
};

// ---------- tempo ----------
const oggi0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const fineOggi = () => { const d = oggi0(); d.setDate(d.getDate() + 1); return d; };
const ora = iso => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
function quandoBreve(iso) {
  if (!iso) return "";
  const d = new Date(iso), g = Math.round((new Date(d).setHours(0, 0, 0, 0) - oggi0()) / 86400000);
  const parola = { "-1": "ieri", 0: "oggi", 1: "domani" }[g];
  if (parola) return `${parola} ${ora(iso)}`;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) + " " + ora(iso);
}
const giornoLungo = iso => new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const dataOd = od => new Date(od.quando).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }) + " · " + ora(od.quando);
/** per <input type="datetime-local"> */
const perInput = iso => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const daInput = v => v ? new Date(v).toISOString() : null;
function alle(giorniDaOggi, h = 18) { const d = oggi0(); d.setDate(d.getDate() + giorniDaOggi); d.setHours(h, 0, 0, 0); return d.toISOString(); }

// ---------- giorno e ora con DUE RUOTE (scelta dell'utente «B2», 2026-10-28): giorno · orario ogni 15 minuti ----------
const chiaveData = g => new Date(g).toLocaleDateString("sv");   // 2026-10-28, con l'ora italiana
const RIGA_RUOTA = 40;   // altezza di una voce della ruota (px), uguale al CSS
const ORARI = [];
for (let h = 7; h <= 22; h++) for (const m of [0, 15, 30, 45]) ORARI.push(h * 60 + m);
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const testoQuando = iso => iso ? `${giornoLungo(iso)} · ${ora(iso)}` : "Senza data";
/** le due ruote; dove = "od" | "tappa". Partono dal valore iso (o domani alle 18:00) */
function ruoteQuando(iso, dove) {
  const d = iso ? new Date(iso) : null;
  const inizio = oggi0();
  if (d && d < inizio) inizio.setTime(new Date(d).setHours(0, 0, 0, 0));   // una data passata resta sceglibile
  const giorni = Array.from({ length: 150 }, (_, i) => { const g = new Date(inizio); g.setDate(g.getDate() + i); return g; });
  const minuti = d ? d.getHours() * 60 + d.getMinutes() : 18 * 60;
  const orari = ORARI.includes(minuti) ? ORARI : [...ORARI, minuti].sort((a, b) => a - b);   // un orario «strano» già salvato resta
  const iG = d ? giorni.findIndex(g => chiaveData(g) === chiaveData(d)) : giorni.findIndex(g => chiaveData(g) === chiaveData(alle(1)));
  const nome = g => { const diff = Math.round((g - oggi0()) / 86400000); return diff === 0 ? "Oggi" : diff === 1 ? "Domani" : g.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }); };
  return `<div class="titoli-ruote"><span class="g">Giorno</span><span>Ora</span></div>
    <div class="ruote" data-dove="${dove}">
      <div class="ruota g" data-ruota="giorno" data-i="${iG}">${giorni.map((g, i) => `<div class="${i === iG ? "on" : ""}" data-v="${chiaveData(g)}">${nome(g)}</div>`).join("")}</div>
      <div class="ruota" data-ruota="orario" data-i="${orari.indexOf(minuti)}">${orari.map(m => `<div class="${m === minuti ? "on" : ""}" data-v="${m}">${hhmm(m)}</div>`).join("")}</div>
    </div>`;
}
/** il valore scelto dalle ruote (ISO); senza ruota del giorno (open day: c'è il calendario) il giorno resta quello della bozza */
function leggiRuote(box) {
  const voce = r => r.children[Math.max(0, Math.min(r.children.length - 1, Math.round(r.scrollTop / RIGA_RUOTA)))];
  const min = +voce(box.querySelector('[data-ruota="orario"]')).dataset.v;
  const g = box.querySelector('[data-ruota="giorno"]');
  const [a, m, gg] = g ? voce(g).dataset.v.split("-").map(Number)
    : (d => [d.getFullYear(), d.getMonth() + 1, d.getDate()])(new Date((box.dataset.dove === "od" ? U.odBozza : U.tappaBozza).quando));
  return new Date(a, m - 1, gg, Math.floor(min / 60), min % 60).toISOString();
}

// ---------- aiutanti sui dati ----------
const imp = cid => ({ ...IMPOSTAZIONI_INIZIALI, ...(D.classe(cid)?.impostazioni || {}) });
const openDay = cid => [...(imp(cid).openDay || [])].sort((a, b) => a.quando.localeCompare(b.quando));
const openDayFuturi = cid => openDay(cid).filter(o => new Date(o.quando) > Date.now() - 6 * 3600000);
const odDi = (cid, id) => openDay(cid).find(o => o.id === id) || null;
const mio = r => r.user_id === D.io()?.id;
const modificabile = r => mio(r) || D.sonoCapo(r.classe_id);
const miei = cid => D.contatti(cid).filter(mio);
const nonInteressato = r => !!r.dati.nonInteressato;
// 1xN (scelta dell'utente, 2026-11-19): N = quanti CONTATTI ho preso da quel gruppo, calcolato dai contatti che hanno
// lo stesso `dati.gruppo` (chi non ha dato il numero non conta). Il vecchio `dati.persone` resta nei dati ma non si usa più.
const compagni = r => r.dati.gruppo ? D.contatti(r.classe_id).filter(x => x.id !== r.id && !x.eliminato && x.dati.gruppo === r.dati.gruppo) : [];
const persone = r => 1 + compagni(r).length;
const etichettaGruppo = r => persone(r) > 1 ? `1x${persone(r)}` : "";

// ---------- DEMO: candidati e confermati (scelta dell'utente, 2026-11-20, anteprima/demo-dafare.html) ----------
// openDay assegnato = CANDIDATO; `traguardi.confermato` = CONFERMATO in quella demo. `dati.demo = { con: [chiavi COMP], altro, insieme }`:
// chi viene con lui (persone = 1 + con + i nomi scritti in «altro», separati da virgola) e `insieme` = id di un altro confermato
// della stessa demo con cui viene (un solo gruppo familiare). NxM della demo: N gruppi familiari x M persone che vengono.
const confermato = r => !nonInteressato(r) && stadio(r.dati) >= 2;
const altriScritti = a => (a || "").split(/,| e /).map(x => x.trim()).filter(Boolean).length;
const vengono = r => 1 + (r.dati.demo?.con?.length || 0) + altriScritti(r.dati.demo?.altro);
const conChi = r => [...(r.dati.demo?.con || []).map(k => COMP[k]?.[0].toLowerCase()).filter(Boolean), (r.dati.demo?.altro || "").trim()].filter(Boolean).join(", ");
/** i gruppi familiari dei confermati: [[r, …], …] (chi viene «insieme a» un altro confermato sta nel suo gruppo) */
function gruppiDemo(lista) {
  const conf = lista.filter(confermato), ids = new Set(conf.map(r => r.id));
  const capo = r => { let x = r, giri = 0; while (x.dati.demo?.insieme && ids.has(x.dati.demo.insieme) && giri++ < 9) x = conf.find(y => y.id === x.dati.demo.insieme); return x.id; };
  const g = new Map();
  for (const r of conf) { const c = capo(r); g.set(c, [...(g.get(c) || []), r]); }
  return [...g.values()];
}
const nxmDemo = lista => { const g = gruppiDemo(lista); return `${g.length}x${g.flat().reduce((s, r) => s + vengono(r), 0)}`; };

// ---------- DA FARE: messaggio e richiamo (2026-11-20) ----------
// ogni promemoria ha un `tipo`: "messaggio" (WhatsApp) o "richiamo" (chiamata); i vecchi senza tipo contano come chiamate.
// Nuovo contatto = messaggio stasera alle 20:30 + richiamo per la demo (domani 18:00, si sceglie negli appunti).
// `dati.daFareOk` = le due azioni sono già state messe (i contatti dal QR le ricevono qui, appena arrivano).
const tipoTappa = t => t.tipo || (/messagg|whats|scriv/i.test(t.titolo || "") ? "messaggio" : "richiamo");
const RILASCIO_DAFARE = "2026-11-20T15:00:00Z";   // i contatti più vecchi non vengono toccati dall'app
function stasera() {
  const d = new Date(); d.setHours(20, 30, 0, 0);
  if (d - Date.now() < 15 * 60000) { d.setTime(Date.now() + 15 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); }
  return d.toISOString();
}
const tappeIniziali = () => [
  { id: uid(), tipo: "messaggio", titolo: "Messaggio dopo il volantinaggio", quando: stasera(), fatta: null },
  { id: uid(), tipo: "richiamo", titolo: "Richiamo per la demo", quando: alle(1), fatta: null }];
/** il giorno prima della demo alle 18:00 (null se la demo è domani o già passata) */
function primaDellaDemo(cid, r) {
  const o = odDi(cid, r.dati.openDay); if (!o) return null;
  const d = new Date(o.quando); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0);
  return d > Date.now() ? d.toISOString() : null;
}
/** le cose da fare oggi o in ritardo (per il numero rosso sulla scheda) */
const urgentiDi = cid => miei(cid).filter(r => !nonInteressato(r)).flatMap(r => tappeDaFare(r)).filter(t => t.quando && new Date(t.quando) < fineOggi());
/** di dov'è la persona (testo libero; i contatti del primo giorno avevano anche una zona Roma/Lazio o fuori) */
const daDove = d => d.citta || { lazio: "Roma o Lazio", fuori: "Fuori dal Lazio" }[d.zona] || "";
/** gli open day per una persona: i più vicini alla sua città prima (poi per data), con i km se li conosco */
function openDayPerContatto(cid, d) {
  const qui = trova(d.citta);
  return openDay(cid).filter(o => new Date(o.quando) > Date.now() - 6 * 3600000 || o.id === d.openDay)
    .map(o => ({ o, km: km(qui, trova(o.citta)) }))
    .sort((a, b) => ((a.km ?? 1e9) - (b.km ?? 1e9)) || a.o.quando.localeCompare(b.o.quando));
}
// Tre tipi di open day (2026-10-28, anteprima/openday-tipi2.html, versione A): `tipo` assente/"sede" = in presenza in una
// città; "zoom" = online su Zoom organizzato dalla sede di una città; "nazionale" = Zoom per tutta Italia (senza città).
// `zoom` = link facoltativo. Nelle liste lo Zoom nazionale fa da «città» a parte (NAZ).
const NAZ = "Zoom nazionale";
const online = o => o.tipo === "zoom" || o.tipo === "nazionale";
const cittaOd = o => o.tipo === "nazionale" ? NAZ : normalizzaCitta(o.citta) || "Città da decidere";   // «Roma» e «Roma (RM)» sono la stessa città
const corta = c => c === NAZ ? "Nazionale" : c.replace(/\s*\([A-Za-z]{2}\)$/, "");                 // nei pulsanti basta «Roma»
const doveOd = o => o.tipo === "nazionale" ? "Online su Zoom (nazionale)"
  : o.tipo === "zoom" ? "Online su Zoom" + (o.citta ? " · sede di " + corta(o.citta) : "")
  : [o.luogo, o.indirizzo, o.citta].filter(Boolean).join(", ");
/** la riga grigia sotto la data: «Latina · Piazza del Popolo 1», «Latina · ▢ Zoom», «▢ Zoom nazionale» (HTML) */
const sottoOd = (o, conCitta = true) => o.tipo === "nazionale" ? `<span class="zoom-od">${ic("video")}Zoom nazionale</span>`
  : [conCitta && o.citta && esc(corta(normalizzaCitta(o.citta))), o.tipo === "zoom" ? `<span class="zoom-od">${ic("video")}Zoom</span>` : esc(o.indirizzo || o.luogo || "")].filter(Boolean).join(" · ");
/** il link di Google Maps (solo in presenza): quello incollato, oppure una ricerca con indirizzo e città */
const mapsOd = o => online(o) ? "" : o.maps || (doveOd(o) ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(doveOd(o)) : "");
const testoOd = o => `Open day LEARNIS Mind\n${giornoLungo(o.quando)} · ore ${ora(o.quando)}${doveOd(o) ? "\n" + doveOd(o) : ""}${online(o) && o.zoom ? "\n" + o.zoom : ""}${mapsOd(o) ? "\n" + mapsOd(o) : ""}`;
const senzaAppunti = r => !r.dati.appuntiFatti && !["chi", "bisogno", "utilita", "motivazione", "obiezioni", "appunti", "fascia"].some(k => r.dati[k]);
/** i promemoria in ordine: prima quelli con data (dal più vicino), poi senza data, in fondo quelli fatti */
const ordinaTappe = l => [...l].sort((a, b) =>
  (!!a.fatta - !!b.fatta) || (!a.quando - !b.quando) || (a.quando || "").localeCompare(b.quando || "") || (a.fatta || "").localeCompare(b.fatta || ""));
const tappeDaFare = r => (r.dati.tappe || []).filter(t => !t.fatta);
const scaduta = t => t.quando && !t.fatta && new Date(t.quando) < fineOggi();
/** «1 contatto», «3 contatti» */
const num = (n, uno, tanti) => `${n} ${n === 1 ? uno : tanti}`;

function salvaDati(r, cambi, opz) {
  D.salvaContatto({ ...r, dati: { ...r.dati, ...cambi } }, opz);
}

/** conta i contatti come li conta la squadra: un gruppo (1xN) = 1 contatto e N persone */
function conteggi(lista) {
  const gruppi = new Map();
  for (const r of lista) {
    const g = r.dati.gruppo || r.id;
    gruppi.set(g, Math.max(gruppi.get(g) || 0, persone(r)));
  }
  const st = [0, 0, 0, 0];
  let ni = 0;
  for (const r of lista) { if (nonInteressato(r)) ni++; else st[stadio(r.dati)]++; }
  const almeno = n => lista.filter(r => !nonInteressato(r) && stadio(r.dati) >= n).length;
  return { contatti: gruppi.size, persone: [...gruppi.values()].reduce((a, b) => a + b, 0), numeri: lista.length,
    risposto: almeno(1), openday: almeno(2), iscritti: almeno(3), ni, st };
}

// ---------- avvisi in basso ----------
let timerAvviso = null, annullaSuMisura = null;
/** annulla = true (registro di dati.js) oppure una funzione che rimette le cose a posto */
function avviso(testo, { annulla = false, icona = null } = {}) {
  annullaSuMisura = typeof annulla === "function" ? annulla : null;
  $avviso.innerHTML = `${icona ? ic(icona) : ""}<span>${esc(testo)}</span>${annulla ? '<button data-azione="annulla">Annulla</button>' : ""}`;
  $avviso.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => { $avviso.hidden = true; }, annulla ? 5000 : 3000);
}
function errore(e) { avviso(e?.message || String(e), { icona: "chiudi" }); }

// ---------- pezzi comuni ----------
function rotta() {
  const p = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (p[0] === "entra") return { vista: "entra", codice: p[1] || "" };
  if (p[0] === "c" && p[1]) return { vista: p[2] || "miei", cid: p[1], param: p[3] };
  return { vista: "classi" };
}
const vai = h => { if (location.hash !== h) location.hash = h; else disegna(); };
const corpo = () => $app.querySelector(".corpo");

function statoRete() {
  const s = D.statoSync();
  if (D.PROVA) return `<span class="rete prova" title="Modalità prova">prova</span>`;
  if (s === "offline") return `<span class="rete off" title="Senza rete: tutto è salvato sul telefono">${ic("nuvola")}offline</span>`;
  if (s === "invio") return `<span class="rete" title="Invio in corso">${ic("aggiorna", "gira")}</span>`;
  return "";
}
function barra({ titolo, sopra = "", indietro = null, destra = "", modificaNome = null }) {
  // modificaNome = attributo del campo (es. 'data-appunto="nome"'): il titolo si tocca e si riscrive lì
  const h1 = !modificaNome ? `<h1><span class="piccolo">${esc(sopra)}</span>${esc(titolo)}</h1>`
    : U.nomeInModifica ? `<h1><span class="piccolo">${esc(sopra)}</span><input class="nome-campo" ${modificaNome} value="${esc(titolo)}" autocapitalize="words" enterkeyhint="done" aria-label="Nome"></h1>`
    : `<h1><span class="piccolo">${esc(sopra)}</span><button class="nome-tocca" data-azione="modifica-nome"><span>${esc(titolo)}</span>${ic("matita", "matitina")}</button></h1>`;
  return `<header class="barra">
    ${indietro ? `<button class="icona" data-vai="${esc(indietro)}" aria-label="Indietro">${ic("indietro")}</button>` : ""}
    ${h1}
    ${statoRete()}
    ${destra}
    <button class="icona" data-azione="annulla" aria-label="Annulla" ${D.puoiAnnullare() ? "" : "disabled"}>${ic("annulla")}</button>
  </header>`;
}
function schede(cid, attiva) {
  // il Diario è stato tolto dalle schede il 2026-11-20 (scelta dell'utente: troppe schede); i dati restano e #/c/<id>/diario funziona ancora
  const s = [["miei", "persona", "I miei", ""], ["dafare", "spunta", "Da fare", "/dafare"], ["openday", "calendario", "Open day", "/openday"],
    ["squadra", "squadra", "Squadra", "/squadra"], ["classe", "impostazioni", "Classe", "/classe"]];
  const n = urgentiDi(cid).length;
  return `<nav class="schede">${s.map(([k, i, t, h]) =>
    `<button class="${k === attiva ? "on" : ""}" data-scheda="${k}" data-vai="#/c/${cid}${h}">${ic(i)}${t}${k === "dafare" && n ? `<span class="badge">${n}</span>` : ""}</button>`).join("")}</nav>`;
}
const pocoMoto = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** tocco sulla scheda in cui sei già: torni all'inizio (dentro una persona → la Squadra; già all'inizio → su in cima) */
function toccaSchedaAttiva(btn) {
  if (!pocoMoto()) btn.querySelector(".ic").animate([{ transform: "none" }, { transform: "translateY(-6px)" }, { transform: "none" },
    { transform: "translateY(-2px)" }, { transform: "none" }], { duration: 420, easing: "ease-out" });
  const k = btn.dataset.scheda;
  if (k === "squadra" && (U.chi !== "tutti" || U.squadraLista))
    return indietroDiLato(() => { U.chi = "tutti"; U.squadraLista = false; U.cerca = ""; U.filtro = "tutti"; });
  if (k === "diario" && U.notaAperta) { U.notaAperta = null; disegna(); }
  corpo()?.scrollTo({ top: 0, behavior: pocoMoto() ? "auto" : "smooth" });
}
/** come il tasto ‹ dell'iPhone: la pagina di adesso scivola via a destra e quella nuova rientra da sinistra */
function indietroDiLato(cambia) {
  const nav = $app.querySelector(".schede"), c = corpo(), su = c?.scrollTop || 0;
  cambia();
  if (pocoMoto() || !nav) { disegna(); if (corpo()) corpo().scrollTop = 0; return; }
  // la pagina vecchia (tutto tranne le schede) si sposta in un velo sopra, mentre sotto si disegna quella nuova
  const via = document.createElement("div");
  via.className = "pagina-via";
  via.style.bottom = (innerHeight - nav.getBoundingClientRect().top) + "px";
  [...$app.children].filter(x => x !== nav).forEach(x => via.appendChild(x));
  document.body.appendChild(via);
  if (c) c.scrollTop = su;
  disegna();
  if (corpo()) corpo().scrollTop = 0;
  const curva = { duration: 340, easing: "cubic-bezier(.3,.7,.2,1)" };
  const anim = [via.animate([{ transform: "none" }, { transform: `translateX(${innerWidth}px)` }], curva),
    ...[...$app.children].filter(x => !x.classList.contains("schede")).map(x =>
      x.animate([{ transform: "translateX(-30%)", filter: "brightness(.9)" }, { transform: "none", filter: "none" }], curva))];
  anim[0].finished.finally(() => via.remove());
  // se il telefono mette in pausa l'animazione, dopo un secondo tutto va comunque al suo posto
  setTimeout(() => { anim.forEach(a => { try { a.finish(); } catch {} }); via.remove(); }, 1000);
}
const pianta = (r, cls = "") => `<span class="pianta ${cls}">${svgPianta(stadio(r.dati), { grigia: nonInteressato(r) })}</span>`;
const vuoto = (testo, st = 0) => `<div class="vuoto">${svgPianta(st)}<p>${testo}</p></div>`;

function cardContatto(r, { conChi = false, conTappa = null } = {}) {
  const sotto = [];
  if (conChi) sotto.push("di " + D.nomeDi(r.classe_id, r.user_id));
  if (conTappa) sotto.push(conTappa.titolo);
  else if (nonInteressato(r)) sotto.push("non interessato");
  else sotto.push(STADI[stadio(r.dati)].spiega);
  if (r.dati.fascia && !conTappa) sotto.push(r.dati.fascia);
  const od = odDi(r.classe_id, r.dati.openDay);
  let destra = "";
  if (conTappa?.quando) destra = `<span class="quando ${new Date(conTappa.quando) < Date.now() ? "scade" : "oggi"}">${ic("campanella")}${esc(quandoBreve(conTappa.quando).replace(/^oggi /, ""))}</span>`;
  else if (etichettaGruppo(r)) destra = `<span class="chip">${ic("gruppo")}${etichettaGruppo(r)}</span>`;
  return `<button class="card" data-vai="#/c/${r.classe_id}/k/${r.id}">
    <span class="tondo">${pianta(r, "mini")}</span>
    <span class="testo"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span>
      <span class="sotto">${esc(sotto.join(" · "))}${od && !conTappa ? ` <span class="chip acc">${ic("calendario")}${esc(dataOd(od).split(" · ")[0])}</span>` : ""}${mio(r) && senzaAppunti(r) && !conTappa ? ` <span class="chip avv">${ic("matita")}appunti</span>` : ""}${r.dati.daQR && !conTappa ? ` <span class="chip">${ic("qr")}QR</span>` : ""}</span></span>
    ${destra}
  </button>`;
}

/** il foglio che sale dal basso: Annulla a sinistra, Salva a destra, il resto sotto (scelta dell'utente) */
function foglio({ titolo, annulla, salva, corpo, form = "" }) {
  const testa = `<div class="maniglia"></div><div class="testa-foglio">
      <button type="button" class="ann" data-azione="${annulla}">Annulla</button><span class="tit">${esc(titolo)}</span>
      <button ${form ? "" : `type="button" data-azione="${salva}"`} class="salva">Salva</button></div>`;
  return `<div class="foglio-velo" data-azione="${annulla}"></div>
    ${form ? `<form class="foglio modulo" id="${form}">${testa}${corpo}</form>` : `<div class="foglio modulo">${testa}${corpo}</div>`}`;
}

/** il riquadro dell'open day della persona: toccandolo sale il foglio per sceglierlo */
function riquadroOd(cid, r, puoi) {
  const od = odDi(cid, r.dati.openDay), ci = openDayFuturi(cid).length || od;
  const attr = puoi && ci ? `data-azione="scegli-od-apri"` : "disabled";
  if (od) {
    const d = new Date(od.quando);
    // a destra della demo il tasto «Viene?» (scelta dell'utente, 2026-11-20): candidato → tocco = foglio della conferma
    const on = confermato(r);
    const viene = nonInteressato(r) ? "" : `<button class="viene-btn ${on ? "on" : ""}" ${puoi ? `data-azione="conferma-apri" data-id="${r.id}"` : "disabled"} aria-label="${on ? "Confermato" : "Confermato?"}">
      <span class="cerchio">${on ? ic("spunta") : ""}</span><span>${on ? "1x" + vengono(r) : "Viene?"}</span></button>`;
    return `<div class="od-riga"><button class="od-box" ${attr}><span class="od-data"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT", { month: "short" })}</span>
      <span class="testo"><span class="nome">${esc(d.toLocaleDateString("it-IT", { weekday: "long" }))} · ${ora(od.quando)}</span>
      <span class="sotto">${sottoOd(od)}</span></span></button>${viene}</div>`;
  }
  return `<button class="od-box vuoto-od" ${attr}>${ic("calendario")}<span class="testo"><span class="nome">${ci ? "Nessun open day" : "Nessun open day in calendario"}</span>
    <span class="sotto">${ci && puoi ? "Tocca per sceglierne uno" : ""}</span></span></button>`;
}
/** il foglio «B · prima la città, poi la data» (scelta dell'utente il 2026-10-28, anteprima/scelta-od.html) */
function foglioSceltaOd(cid, r) {
  const qui = trova(r.dati.citta);
  const lista = openDay(cid).filter(o => new Date(o.quando) > Date.now() - 6 * 3600000 || o.id === r.dati.openDay);
  const citta = [...new Set(lista.map(cittaOd))].filter(c => c !== NAZ).map(c => ({ c, km: km(qui, trova(c)) }))
    .sort((a, b) => ((a.km ?? 1e9) - (b.km ?? 1e9)) || a.c.localeCompare(b.c, "it"));
  // lo Zoom nazionale va bene per chiunque: sempre presente, subito dopo la città più vicina
  citta.splice(citta.length ? 1 : 0, 0, { c: NAZ, km: null });
  if (!U.sceltaOdCitta || !citta.some(x => x.c === U.sceltaOdCitta)) {
    const attuale = odDi(cid, r.dati.openDay);
    U.sceltaOdCitta = attuale ? cittaOd(attuale) : citta[0]?.c;   // si parte dalla città del suo open day, o dalla più vicina
  }
  const date = lista.filter(o => cittaOd(o) === U.sceltaOdCitta);
  const prenotati = o => D.contatti(cid).filter(x => x.dati.openDay === o.id).length;
  return `<div class="foglio-velo" data-azione="scegli-od-chiudi"></div>
    <div class="foglio modulo">
      <div class="maniglia"></div>
      <div class="testa-foglio"><button type="button" class="ann" data-azione="scegli-od-chiudi">Chiudi</button><span class="tit">Open day di ${esc((r.dati.nome || "").split(" ")[0])}</span><span class="spazio-testa"><button type="button" class="piu-testa" data-azione="od-nuovo-per" data-citta="" aria-label="Nuovo open day" title="Nuovo open day (qualsiasi città o Zoom nazionale)">${ic("piu")}</button></span></div>
      ${citta.length > 1 ? `<div class="segm scorre">${citta.map(x => `<button class="${x.c === U.sceltaOdCitta ? "on" : ""}" data-azione="scegli-od-citta" data-c="${esc(x.c)}">${x.c === NAZ ? ic("mondo", "mini") : ""}${esc(corta(x.c))}${x.km != null ? `<small> ${x.km} km</small>` : ""}</button>`).join("")}</div>` : ""}
      ${date.map(o => { const d = new Date(o.quando), on = o.id === r.dati.openDay, n = prenotati(o);
        return `<button class="od-scelta ${on ? "on" : ""}" data-azione="scegli-od" data-id="${o.id}"><span class="od-data"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT", { month: "short" })}</span>
          <span class="testo"><span class="nome">${esc(testoQuando(o.quando))}</span><span class="sotto">${[o.tipo === "nazionale" ? "" : sottoOd(o, false), esc(n ? `${n} prenotat${n === 1 ? "o" : "i"}` : "nessun prenotato")].filter(Boolean).join(" · ")}</span></span>
          <span class="spunta-od">${on ? ic("spunta") : ""}</span></button>`; }).join("")}
      <button class="link con-ic nuovo-od" data-azione="od-nuovo-per" data-citta="${esc(U.sceltaOdCitta || normalizzaCitta(r.dati.citta) || "")}">${ic("piu")}${U.sceltaOdCitta === NAZ ? "Nuovo Zoom nazionale" : "Nuovo open day" + (U.sceltaOdCitta ? " a " + esc(corta(U.sceltaOdCitta)) : "")}</button>
      <button class="secondario largo" data-azione="scegli-od" data-id="">Nessun open day per ora</button>
    </div>`;
}

/** una riga sottile della Lista (scelta dell'utente: più contatti per schermata, niente riquadri) */
function rigaContatto(r, { conChi = false, perGiorni = false } = {}) {
  const od = odDi(r.classe_id, r.dati.openDay);
  const sotto = [conChi && "di " + D.nomeDi(r.classe_id, r.user_id), nonInteressato(r) ? "non interessato" : STADI[stadio(r.dati)].spiega, r.dati.fascia].filter(Boolean).join(" · ");
  const destra = [od && `<span class="chip">${esc(new Date(od.quando).toLocaleDateString("it-IT", { day: "numeric", month: "short" }))}</span>`,
    !perGiorni && etichettaGruppo(r) && `<span class="chip">${etichettaGruppo(r)}</span>`, mio(r) && senzaAppunti(r) && `<span class="chip avv">${ic("matita")}</span>`,
    perGiorni && r.dati.quando && `<span class="ora-presa">${ora(r.dati.quando)}</span>`].filter(Boolean).join("");
  return `<button class="riga-contatto ${perGiorni ? "lunga " + statoSel(r) : ""}" ${perGiorni ? tocco(r) : `data-vai="#/c/${r.classe_id}/k/${r.id}"`}>
    ${perGiorni && U.selGruppo ? `<span class="spunta-sel">${ic("spunta")}</span>` : ""}${pianta(r, "riga-pianta")}
    <span class="testo"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span><span class="sotto">${esc(sotto)}</span></span>
    ${destra ? `<span class="destra">${destra}</span>` : ""}
  </button>`;
}

// =========================================================
// SCHERMATE
// =========================================================
function disegnaAccesso() {
  const codice = ricordato("volantini.codice");
  $app.innerHTML = `<div class="corpo accesso">
    <div class="logo">${svgPianta(3)}</div>
    <h1>Volantinaggio</h1>
    <p class="marchio">LEARNIS Mind · <i>Find your method</i></p>
    ${codice ? `<p class="nota-invito">Dopo l'accesso entrerai nella classe <b>${esc(codice)}</b>.</p>` : ""}
    <form id="form-accesso" class="modulo">
      <label>Email<input name="email" type="email" autocomplete="email" required></label>
      <label>Password<input name="password" type="password" autocomplete="${U.nuovoAccount ? "new-password" : "current-password"}" minlength="6" required></label>
      <button class="primario" type="submit">${U.nuovoAccount ? "Crea account" : "Accedi"}</button>
      <p class="errore" id="errore-accesso"></p>
    </form>
    <button class="link" data-azione="cambia-accesso">${U.nuovoAccount ? "Hai già un account? Accedi" : "Prima volta? Crea un account"}</button>
    <p class="tenue piccolo-testo"><a href="?prova">Prova l'app con dati finti</a></p>
  </div>`;
}

function disegnaClassi() {
  const lista = D.classi();
  const mioNome = ricordato("volantini.nome") || "";
  const pannello = U.pannello === "crea" ? `<form class="riquadro modulo" id="form-crea">
      <h3>Nuova classe di volantinaggio</h3>
      <label>Nome della classe<input name="nome" placeholder="es. Volantinaggio novembre" required maxlength="80"></label>
      <label>Il tuo nome (lo vede la squadra)<input name="mioNome" value="${esc(mioNome)}" required maxlength="40"></label>
      <div class="riga-pulsanti"><button type="button" class="secondario" data-azione="chiudi-pannello">Annulla</button><button class="primario">Crea</button></div>
    </form>`
    : U.pannello === "entra" ? formEntra("", mioNome) : "";
  $app.innerHTML = `${barra({ titolo: "Le mie classi", sopra: "Volantinaggio · LEARNIS Mind" })}
    <div class="corpo">
      ${lista.length ? lista.map(c => {
        const n = conteggi(D.contatti(c.id).filter(mio));
        return `<button class="card classe" data-vai="#/c/${c.id}">
          <span class="testo"><span class="nome">${esc(c.nome)}</span>
          <span class="sotto">${D.membri(c.id).length} volantinatori · i tuoi contatti: ${n.contatti}${D.sonoCapo(c.id) ? " · l'hai creata tu" : ""}</span></span>${ic("avanti", "freccia")}</button>`;
      }).join("") : vuoto("Nessuna classe per ora.<br>Creane una oppure entra con il codice che ti hanno mandato.")}
      ${pannello}
      ${U.pannello ? "" : `<div class="riga-pulsanti">
        <button class="secondario" data-azione="pannello" data-p="entra">Entra con codice</button>
        <button class="primario con-ic" data-azione="pannello" data-p="crea">${ic("piu")}Crea classe</button></div>`}
      <p class="tenue piccolo-testo account">${D.PROVA ? 'Modalità prova: i dati restano su questo telefono. <a href="./">Esci dalla prova</a>' : `Account: ${esc(D.io()?.email)} · <button class="link" data-azione="logout">Esci</button>`}</p>
    </div>`;
}
function formEntra(codice, mioNome) {
  return `<form class="riquadro modulo" id="form-entra">
    <h3>Entra in una classe</h3>
    <label>Codice invito<input name="codice" value="${esc(codice)}" placeholder="LM-1234" autocapitalize="characters" required></label>
    <label>Il tuo nome (lo vede la squadra)<input name="mioNome" value="${esc(mioNome)}" required maxlength="40"></label>
    <div class="riga-pulsanti"><button type="button" class="secondario" data-azione="chiudi-pannello">Annulla</button><button class="primario">Entra</button></div>
  </form>`;
}
function disegnaEntra(codice) {
  ricorda("volantini.codice", null);
  $app.innerHTML = `${barra({ titolo: "Entra nella classe", sopra: "Ti hanno invitato", indietro: "#/" })}
    <div class="corpo">${formEntra(codice, ricordato("volantini.nome") || "")}</div>`;
}

// ---------- il mio perché ----------
function perche(cid) { return D.leggiP("perche:" + cid)?.risposte || []; }
function bannerPerche(cid) {
  const r = perche(cid).map((t, i) => ({ t, i })).filter(x => x.t?.trim());
  if (!r.length) return `<button class="perche vuoto-perche" data-vai="#/c/${cid}/perche/0"><b>Il mio perché</b>Scrivi il tuo perché: te lo ricorderò ogni volta che apri l'app ›</button>`;
  const x = r[U.perche % r.length];
  const domanda = imp(cid).domande[x.i] || "";
  return `<button class="perche" data-azione="prossimo-perche" title="${esc(domanda)}"><b>Il mio perché${r.length > 1 ? ` · ${U.perche % r.length + 1}/${r.length}` : ""}</b>«${esc(x.t)}»</button>`;
}
function disegnaPerche(cid, n) {
  const dom = imp(cid).domande;
  n = Math.min(Math.max(0, +n || 0), dom.length - 1);
  const risposte = perche(cid);
  $app.innerHTML = `${barra({ titolo: "Il mio perché", sopra: `Domanda ${n + 1} di ${dom.length}`, indietro: `#/c/${cid}` })}
    <div class="corpo perche-passo">
      <div class="passi">${dom.map((_, i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</div>
      <div class="pianta-centro">${svgPianta(Math.min(3, Math.floor(n * 4 / dom.length)))}</div>
      <h2 class="domanda">${esc(dom[n])}</h2>
      <textarea class="campo" data-perche="${n}" rows="4" placeholder="Scrivi con parole tue…">${esc(risposte[n] || "")}</textarea>
      <p class="tenue con-ic">${ic("lucchetto")}Lo vedi solo tu. Lo rileggerai ogni volta che apri l'app.</p>
      <div class="riga-pulsanti">
        ${n > 0 ? `<button class="secondario" data-vai="#/c/${cid}/perche/${n - 1}">Indietro</button>` : `<button class="secondario" data-vai="#/c/${cid}">Più tardi</button>`}
        ${n < dom.length - 1 ? `<button class="primario" data-vai="#/c/${cid}/perche/${n + 1}">Avanti</button>`
          : `<button class="primario" data-azione="fine-perche" data-cid="${cid}">Fatto</button>`}
      </div>
    </div>`;
}

// ---------- i miei contatti ----------
function contaStadi(n) {
  return `<div class="conta-stadi">${STADI.map((s, i) => `<span title="${esc(s.nome)}: ${esc(s.spiega)}">${mini(i)}<b>${n.st[i]}</b></span>`).join("")}<span title="Non interessati">${ic("noMeno")}<b>${n.ni}</b></span></div>`;
}
/** «Da fare»: tutti i miei promemoria non fatti, divisi per giorno (in ritardo, oggi, domani…), poi quelli senza data */
function agenda(cid, lista, filtro = null) {
  const voci = lista.filter(r => !nonInteressato(r)).flatMap(r => tappeDaFare(r).map(t => ({ r, t }))).filter(x => !filtro || tipoTappa(x.t) === filtro);
  if (!voci.length) return vuoto(filtro ? "Niente da fare qui." : "Niente da fare: sei in pari!", 1);
  const conData = voci.filter(x => x.t.quando).sort((a, b) => a.t.quando.localeCompare(b.t.quando));
  const gruppi = new Map();
  for (const x of conData) {
    const g = Math.round((new Date(x.t.quando).setHours(0, 0, 0, 0) - oggi0()) / 86400000);
    const titolo = g < 0 ? "In ritardo" : g === 0 ? "Oggi" : g === 1 ? "Domani" : giornoLungo(x.t.quando);
    gruppi.set(titolo, [...(gruppi.get(titolo) || []), x]);
  }
  const riga = ({ r, t }) => `<div class="scorri-fondo">${ic("cestino")}<span>Cancella</span><div class="voce-agenda scorribile" data-scorri="tappa" data-k="${r.id}" data-t="${t.id}">
      <button class="cerchio" data-azione="tappa-fatta" data-k="${r.id}" data-t="${t.id}" aria-label="Fatta"></button>
      ${pianta(r, "riga-pianta")}
      <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span><span class="sotto">${ic(tipoTappa(t) === "messaggio" ? "messaggio" : "telefono", "tipo-tappa")}${esc(t.titolo)}${tentativi(t)}</span></button>
      ${t.quando && !t.chiamata ? `<span class="quando ${new Date(t.quando) < Date.now() ? "scade" : "oggi"}">${esc(new Date(t.quando) < oggi0() ? quandoBreve(t.quando) : ora(t.quando))}</span>` : ""}
      ${t.chiamata && !t.fatta ? `<button class="com-e" data-azione="esito-apri" data-k="${r.id}" data-t="${t.id}">Com'è andata?</button>` : azioneTappa(r, t)}
    </div></div>`;
  const senza = voci.filter(x => !x.t.quando);   // chiusa: si apre con un tocco (scelta dell'utente, 2026-11-20)
  return [...gruppi].map(([titolo, l]) => `<h3 class="sez ${titolo === "In ritardo" ? "scade" : ""}">${esc(titolo)} · ${l.length}</h3>${l.map(riga).join("")}`).join("")
    + (senza.length ? `<button class="sez-apri" data-azione="senza-data">Senza data · ${senza.length}${ic(U.senzaAperta ? "indietro" : "avanti", U.senzaAperta ? "su" : "")}</button>${U.senzaAperta ? senza.map(riga).join("") : ""}` : "");
}
/** il tasto tondo a destra: WhatsApp per i messaggi, chiamata per i richiami (spento se manca il numero) */
function azioneTappa(r, t) {
  const tel = (r.dati.telefono || "").replace(/[^\d+]/g, "");
  if (!tel) return `<span class="azione-tappa spento">${ic(tipoTappa(t) === "messaggio" ? "messaggio" : "telefono")}</span>`;
  return tipoTappa(t) === "messaggio"
    ? `<a class="azione-tappa" href="https://wa.me/${esc(numeroWa(r.dati.telefono))}" target="_blank" rel="noopener" aria-label="WhatsApp">${ic("messaggio")}</a>`
    : `<a class="azione-tappa" href="tel:${esc(tel)}" data-chiama="${r.id}" aria-label="Chiama">${ic("telefono")}</a>`;
}
/** «2° tentativo» dopo un «Non ha risposto» */
const tentativi = t => t.tentativi ? ` · <span class="tent">${t.tentativi + 1}° tentativo</span>` : "";
/** la scheda «Da fare» (in basso): quanti messaggi e quante chiamate oggi, poi tutto diviso per giorno */
function disegnaDaFare(cid) {
  const lista = miei(cid);
  const urg = urgentiDi(cid), n = tipo => urg.filter(t => tipoTappa(t) === tipo).length;
  const notifiche = statoNotifiche();
  const invito = !D.PROVA && notifiche === "da-attivare" && lista.some(r => tappeDaFare(r).some(t => t.quando))
    ? `<button class="striscia" data-azione="notifiche">${ic("campanella")}Attiva i promemoria sul telefono</button>` : "";
  const conta = (tipo, icona, testo) => `<button class="${U.filtroDaFare === tipo ? "on" : ""}" data-azione="filtro-dafare" data-f="${tipo}">${ic(icona)}<span><b>${n(tipo)}</b>${testo}</span></button>`;
  $app.innerHTML = `${barra({ titolo: "Da fare", sopra: D.classe(cid).nome, indietro: "#/" })}
    <div class="corpo">
      ${invito}
      <div class="conta-dafare">${conta("messaggio", "messaggio", "messaggi oggi")}${conta("richiamo", "telefono", "chiamate oggi")}</div>
      ${agenda(cid, lista, U.filtroDaFare)}
    </div>
    ${schede(cid, "dafare")}`;
}
// ---------- contatti divisi per GIORNO e gruppi 1xN (scelta dell'utente, 2026-11-19, anteprima/gruppi-giorni.html) ----------
const giornoDi = r => { const d = new Date(r.dati.quando || r.creato_il || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const presoIl = r => r.dati.quando || r.creato_il || "";
/** [{ titolo, pezzi }] dal giorno più recente; un pezzo = i contatti di un gruppo (in ordine di presa) o uno da solo.
 *  Un gruppo sta tutto nel giorno del suo PRIMO contatto. */
function perGiorno(lista) {
  const gruppi = new Map();
  for (const r of lista) { const g = r.dati.gruppo || r.id; gruppi.set(g, [...(gruppi.get(g) || []), r]); }
  const giorni = new Map();
  for (const p of gruppi.values()) {
    p.sort((a, b) => presoIl(a).localeCompare(presoIl(b)));
    const g = giornoDi(p[0]);
    giorni.set(g, [...(giorni.get(g) || []), p]);
  }
  const ultimo = p => p.map(presoIl).sort().pop();
  return [...giorni].sort((a, b) => b[0].localeCompare(a[0])).map(([g, pezzi]) => {
    const diff = Math.round((oggi0() - new Date(g + "T00:00")) / 86400000);
    const lungo = giornoLungo(g + "T12:00");
    return { titolo: diff === 0 ? "Oggi · " + lungo : diff === 1 ? "Ieri · " + lungo : lungo,
      pezzi: pezzi.sort((a, b) => ultimo(b).localeCompare(ultimo(a))) };
  });
}
/** il titolo del giorno con «NxM» = N gruppi, M contatti (la nomenclatura da dettare) */
const testaGiorno = (titolo, pezzi) => `<div class="testa-giorno"><h3>${esc(titolo)}</h3><span class="nxm">${pezzi.length}x${pezzi.reduce((a, p) => a + p.length, 0)}</span></div>`;
const statoSel = r => !U.selGruppo ? "" : r.id === U.selGruppo.base ? "sel-base" : U.selGruppo.scelti.has(r.id) ? "sel-on" : "";
const tocco = r => U.selGruppo ? `data-azione="sel-tocca" data-k="${r.id}"` : `data-vai="#/c/${r.classe_id}/k/${r.id}" data-lungo="${r.id}"`;
/** il menu che sale col tocco lungo su una persona: Raggruppa · Togli dal gruppo · Sciogli il gruppo · Apri */
function menuGruppo() {
  const r = U.menuGruppo && D.contatto(U.menuGruppo);
  if (!r) return "";
  const comp = compagni(r), nomi = comp.map(x => esc((x.dati.nome || "?").split(" ")[0])).join(", ");
  return `<div class="foglio-velo" data-azione="gr-chiudi"></div><div class="foglio menu-gruppo">
    <div class="maniglia"></div>
    <div class="chi-menu">${pianta(r, "riga-pianta")}<span class="testo"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span>
      <span class="sotto">${comp.length ? `Gruppo 1x${comp.length + 1} con ${nomi}` : "Da solo/a · 1x1"}</span></span></div>
    <button data-azione="gr-raggruppa">${ic("gruppo")}${comp.length ? "Aggiungi altri al gruppo" : "Raggruppa"}</button>
    ${comp.length ? `<button data-azione="gr-togli">${ic("noMeno")}Togli dal gruppo</button>
      <button data-azione="gr-sciogli" class="rosso">${ic("chiudi")}Sciogli il gruppo</button>` : ""}
    <button data-azione="gr-apri">${ic("persona")}Apri la scheda</button>
    <button class="chiudi-menu" data-azione="gr-chiudi">Chiudi</button></div>`;
}
/** «Per demo» (scelta dell'utente, 2026-11-20, anteprima/per-demo.html): solo i miei DA CONFERMARE, divisi per demo dalla più
 *  vicina, con «Chiama entro …» (il giorno prima della demo) e in fondo «Senza demo» (anche chi ha una demo già passata).
 *  A destra il tasto per CHIAMARE (niente «Viene?»: conferma, data e non interessato si cambiano nella scheda). */
function perDemo(cid, lista) {
  const cand = lista.filter(r => !nonInteressato(r) && !confermato(r));
  const vivo = o => o && new Date(o.quando) > Date.now() - 6 * 3600000;
  const per = new Map(), senza = [];
  for (const r of cand) { const o = odDi(cid, r.dati.openDay); if (vivo(o)) per.set(o.id, [...(per.get(o.id) || []), r]); else senza.push(r); }
  const giorni = iso => Math.round((new Date(iso).setHours(0, 0, 0, 0) - oggi0()) / 86400000);
  const entro = o => { const g = giorni(o.quando) - 1;   // l'ultimo giorno per chiamare = il giorno prima (se la demo è oggi: oggi)
    if (g <= 0) return [`Chiama entro oggi!`, "oggi"];
    if (g === 1) return ["Chiama entro domani", ""];
    const d = new Date(o.quando); d.setDate(d.getDate() - 1);
    return [`Chiama entro ${d.toLocaleDateString("it-IT", { weekday: "long" })}${g > 6 ? " " + d.getDate() : ""}`, ""]; };
  const prossima = r => ordinaTappe(tappeDaFare(r))[0];
  const riga = r => { const t = prossima(r), tel = (r.dati.telefono || "").replace(/[^\d+]/g, "");
    return `<div class="riga-pd">${pianta(r, "riga-pianta")}
      <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span>
        <span class="sotto">${t ? `${ic(tipoTappa(t) === "messaggio" ? "messaggio" : "telefono", "tipo-tappa")}${tipoTappa(t) === "messaggio" ? "messaggio" : "richiamo"} ${t.quando ? esc(quandoBreve(t.quando)) : "senza data"}` : esc(STADI[stadio(r.dati)].spiega)}</span></button>
      ${tel ? `<a class="azione-tappa" href="tel:${esc(tel)}" data-chiama="${r.id}" aria-label="Chiama">${ic("telefono")}</a>` : `<span class="azione-tappa spento">${ic("telefono")}</span>`}</div>`; };
  const sez = [...per].map(([id, l]) => ({ o: odDi(cid, id), l })).sort((a, b) => a.o.quando.localeCompare(b.o.quando)).map(({ o, l }) => {
    const d = new Date(o.quando), [testo, cls] = entro(o);
    const gia = lista.filter(r => r.dati.openDay === o.id && confermato(r));
    return `<div class="testa-demo"><span class="od-data"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT", { month: "short" })}</span>
      <span class="t"><h3>${esc(d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric" }))} · ${esc(corta(cittaOd(o)))}</h3><span class="entro ${cls}">${ic("telefono")}${testo}</span></span>
      <span class="conta-pd"><b>${l.length}</b><small>da confermare</small>${gia.length ? `<span class="gia">${nxmDemo(gia)} già</span>` : ""}</span></div>${l.map(riga).join("")}`;
  }).join("");
  const fondo = senza.length ? `<div class="testa-demo"><span class="od-data senza">${ic("calendario")}</span>
      <span class="t"><h3>Senza demo</h3><span class="entro fissa">${ic("telefono")}Fissa la demo nella chiamata</span></span>
      <span class="conta-pd"><b>${senza.length}</b><small>da fissare</small></span></div>${senza.map(riga).join("")}` : "";
  return sez + fondo || vuoto("Nessuno da confermare: tutti sistemati!", 2);
}
/** la ricerca: nome, fascia, telefono (anche senza spazi), email, città; senza badare a maiuscole e accenti */
const piano = t => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function corrisponde(r, q) {
  const d = r.dati, testo = piano([d.nome, d.fascia, d.telefono, (d.telefono || "").replace(/\D/g, ""), d.email, d.citta].filter(Boolean).join(" "));
  return piano(q).trim().split(/\s+/).every(p => testo.includes(p.replace(/^\+39/, "")));
}
function disegnaMiei(cid) {
  const c = D.classe(cid);
  const tuttiMiei = miei(cid);
  const n = conteggi(tuttiMiei);
  const faseDi = r => nonInteressato(r) ? "ni" : String(stadio(r.dati));
  const FASI = [["0", "Presi"], ["1", "Hanno risposto"], ["2", "Confermati"], ["3", "Iscritti"], ["ni", "Non interessati"]];
  if (U.faseMiei && !tuttiMiei.some(r => faseDi(r) === U.faseMiei)) U.faseMiei = null;
  const cerco = (U.cercaMiei || "").trim();
  const trovati = cerco ? tuttiMiei.filter(r => corrisponde(r, cerco)) : tuttiMiei;
  const lista = U.faseMiei && !U.selGruppo ? trovati.filter(r => faseDi(r) === U.faseMiei) : trovati;
  const barraCerca = tuttiMiei.length ? `<input class="campo cerca cerca-miei" type="search" placeholder="Cerca nome, telefono, città…" value="${esc(U.cercaMiei || "")}" data-cerca="cercaMiei" autocomplete="off">` : "";
  const filtriFase = U.selGruppo || !tuttiMiei.length ? "" : `<div class="segm scorre filtri-fase"><button class="${U.faseMiei ? "" : "on"}" data-azione="fase-miei" data-f="">Tutti <b>${tuttiMiei.length}</b></button>${FASI.map(([k, t]) => {
      const q = tuttiMiei.filter(r => faseDi(r) === k).length;
      return q ? `<button class="${U.faseMiei === k ? "on" : ""}" data-azione="fase-miei" data-f="${k}">${k === "ni" ? ic("noMeno", "mini") : mini(+k)}${t} <b>${q}</b></button>` : "";
    }).join("")}</div>`;
  const notifiche = statoNotifiche();
  const invitoNotifiche = !D.PROVA && notifiche === "da-attivare" && lista.some(r => tappeDaFare(r).some(t => t.quando))
    ? `<button class="striscia" data-azione="notifiche">${ic("campanella")}Attiva i promemoria sul telefono</button>` : "";
  if (!["orto", "demo"].includes(U.vista)) U.vista = "lista";   // «Da fare» non sta più qui: è una scheda in basso (2026-11-20)
  if (U.vista === "demo") U.selGruppo = null;

  let contenuto;
  if (cerco && !trovati.length) contenuto = vuoto(`Nessun contatto trovato per «${esc(cerco)}».`);
  else if (U.vista === "demo") contenuto = perDemo(cid, trovati);
  else if (U.vista === "orto") {
    const piantina = r => `<button ${tocco(r)} class="lunga ${statoSel(r)} ${U.appenaPiantato === r.id ? "nuova" : ""}">${U.selGruppo ? `<span class="spunta-sel">${ic("spunta")}</span>` : ""}${pianta(r)}<span>${esc((r.dati.nome || "?").split(" ")[0])}</span></button>`;
    contenuto = `${U.selGruppo || U.faseMiei || cerco ? "" : contaStadi(n)}
      ${lista.length ? perGiorno(lista).map(({ titolo, pezzi }) => testaGiorno(titolo, pezzi) + `<div class="orto">${pezzi.map(p => p.length > 1
          ? `<div class="vaso-gruppo" style="--n:${Math.min(3, p.length)}"><span class="etich">1x${p.length}</span>${p.map(piantina).join("")}</div>`
          : piantina(p[0])).join("")}</div>`).join("")
        : vuoto("Il tuo orto è vuoto: ogni contatto che prendi è un seme.")}
      <p class="tenue piccolo-testo legenda-stadi">${STADI.map((s, i) => `${mini(i)}${s.spiega}`).join(" → ")}</p>`;
  } else {
    const riga = r => rigaContatto(r, { perGiorni: true });
    contenuto = lista.length ? perGiorno(lista).map(({ titolo, pezzi }) => testaGiorno(titolo, pezzi) + pezzi.map(p => p.length > 1
        ? `<div class="blocco-gruppo"><p class="etich">1x${p.length}</p>${p.map(riga).join("")}</div>` : riga(p[0])).join("")).join("")
      : vuoto("Ancora nessun contatto.<br>Tocca il bottone azzurro in alto quando fermi qualcuno.");
  }
  const sel = U.selGruppo && D.contatto(U.selGruppo.base);
  if (U.selGruppo && !sel) U.selGruppo = null;
  const testa = U.selGruppo
    ? `<header class="barra barra-sel"><button class="testo-btn" data-azione="sel-annulla">Annulla</button>
        <h1><span class="piccolo">Raggruppa con ${esc((sel.dati.nome || "?").split(" ")[0])}</span>1x${U.selGruppo.scelti.size + 1}</h1>
        <button class="testo-btn fatto" data-azione="sel-fatto" ${U.selGruppo.scelti.size ? "" : "disabled"}>Fatto</button></header>`
    : barra({ titolo: "I miei contatti", sopra: c.nome, indietro: "#/",
      destra: `<button class="tondo-nuovo" data-azione="nuovo" data-cid="${cid}" aria-label="Nuovo contatto" title="Nuovo contatto">${ic("personaPiu")}</button>` });
  $app.innerHTML = `${testa}
    <div class="corpo">
      ${U.selGruppo ? `<p class="aiuto-sel">Tocca le altre persone del gruppo di ${esc((sel.dati.nome || "?").split(" ")[0])}.</p>` : `${bannerPerche(cid)}
      ${invitoNotifiche}`}
      <div class="interruttore">${[["lista", "lista", "Lista"], ["orto", "orto", "Orto"], ["demo", "calendario", "Per demo"]].map(([k, i, t]) => `<button class="${U.vista === k ? "on" : ""}" data-azione="vista" data-v="${k}">${ic(i)}${t}</button>`).join("")}</div>
      ${barraCerca}
      ${U.vista === "demo" ? "" : filtriFase}
      ${contenuto}
    </div>
    ${schede(cid, "miei")}
    ${menuGruppo()}`;
  U.appenaPiantato = null;
}

// ---------- nuovo contatto: passo 1, davanti alla persona ----------
function bozzaNuova(cid, base = null) {
  return { cid, nome: "", telefono: "", email: "", consenso: false, gruppoDi: base?.id || null,
    citta: base?.dati.citta || "" };
}
function disegnaNuovo(cid) {
  if (!U.bozza || U.bozza.cid !== cid) U.bozza = bozzaNuova(cid);
  const b = U.bozza;
  const testoPrivacy = imp(cid).privacy;
  $app.innerHTML = `<header class="barra">
      <button class="icona" data-azione="annulla-nuovo" aria-label="Chiudi">${ic("chiudi")}</button>
      <h1><span class="piccolo">LEARNIS Mind</span>Restiamo in contatto</h1>
      <button class="chip-btn primario" data-azione="salva-nuovo">Salva</button>
    </header>
    <div class="corpo modulo nuovo">
      ${b.gruppoDi ? `<p class="nota-gruppo">Stesso gruppo di <b>${esc(D.contatto(b.gruppoDi)?.dati.nome)}</b></p>`
        : `<button class="striscia" data-vai="#/c/${cid}/qr">${ic("qr")}Lo compila dal suo telefono? Mostra il QR</button>`}
      <label>Nome e cognome<input data-bozza="nome" value="${esc(b.nome)}" autocomplete="off" autocapitalize="words" enterkeyhint="next"></label>
      <label>Telefono<input data-bozza="telefono" value="${esc(b.telefono)}" type="tel" inputmode="tel" autocomplete="off" enterkeyhint="next"></label>
      <label>Email <span class="facolt">(facoltativa)</span><input data-bozza="email" value="${esc(b.email)}" type="email" inputmode="email" autocomplete="off" autocapitalize="off"></label>
      <label>Di dove sei?${campoComune('data-bozza="citta"', b.citta, "Scrivi il comune, es. Latina")}</label>
      <button class="consenso ${b.consenso ? "on" : ""}" data-azione="consenso" role="checkbox" aria-checked="${b.consenso}">
        <span class="spunta">${b.consenso ? ic("spunta") : ""}</span>
        <span>${esc(testoPrivacy)}</span>
      </button>
      <p class="errore" id="errore-nuovo"></p>
    </div>`;
}
function salvaNuovo() {
  const b = U.bozza, cid = b.cid;
  const err = t => { document.getElementById("errore-nuovo").textContent = t; };
  if (!b.nome.trim()) return err("Scrivi il nome.");
  if (!b.telefono.trim() && !b.email.trim()) return err("Serve almeno il telefono o l'email.");
  if ((b.citta || "").trim().length < 2) return err("Scrivi di dove sei.");   // obbligatoria (scelta dell'utente, 2026-11-19)
  if (!b.consenso) return err("Serve la spunta del consenso privacy.");
  const base = b.gruppoDi ? D.contatto(b.gruppoDi) : null;
  const id = uid();
  const dati = {
    nome: b.nome.trim(), telefono: b.telefono.trim(), email: b.email.trim(),
    openDay: null, quando: new Date().toISOString(), citta: normalizzaCitta(b.citta),
    consenso: { quando: new Date().toISOString(), testo: imp(cid).privacy },
    traguardi: {}, tappe: tappeIniziali(), daFareOk: true,   // messaggio stasera + richiamo (scelta dell'utente, 2026-11-20)
  };
  if (base) {
    dati.gruppo = base.dati.gruppo || base.id;
    dati.altri = base.dati.altri || "";
    dati.fascia = base.dati.fascia || "";
    if (!base.dati.gruppo) salvaDati(base, { gruppo: base.id });
  }
  D.salvaContatto({ id, classe_id: cid, user_id: D.io().id, eliminato: false, dati });
  U.bozza = null;
  U.appenaPiantato = id;
  avviso("Un seme piantato nel tuo orto!", { annulla: true, icona: "orto" });
  vai(`#/c/${cid}/k/${id}`);   // si apre la SCHEDA (non gli appunti: la persona col telefono in mano non deve vederli), 2026-11-20
}

// ---------- il QR: la persona compila dal suo telefono ----------
let qrPronto = null;
function caricaQR() {
  qrPronto ??= new Promise((ok, no) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
    s.onload = () => ok(window.qrcode);
    s.onerror = () => { qrPronto = null; no(new Error("Serve la rete per disegnare il QR.")); };
    document.head.append(s);
  });
  return qrPronto;
}
let qrAperto = null;
function disegnaQR(cid) {
  const chiave = D.miaChiaveQR(cid);
  const link = new URL("modulo.html?k=" + encodeURIComponent(chiave || ""), location.href).href;
  if (!qrAperto || qrAperto.cid !== cid) qrAperto = { cid, prima: new Set(miei(cid).map(r => r.id)) };
  const arrivati = miei(cid).filter(r => !qrAperto.prima.has(r.id) && r.dati.daQR);
  $app.innerHTML = `${barra({ titolo: "Mostra il QR", sopra: "Lo compila dal suo telefono", indietro: `#/c/${cid}/nuovo` })}
    <div class="corpo qr-pagina">
      <p class="tenue">La persona inquadra il codice con la fotocamera, compila nome, telefono, open day e consenso dal suo telefono. Il contatto arriva qui, a nome tuo.</p>
      <div class="qr-box" id="qr">${chiave ? '<p class="tenue">Disegno il QR…</p>' : '<p class="tenue">Serve la rete per preparare il tuo QR.</p>'}</div>
      ${D.PROVA ? `<p class="errore">Modalità prova: il QR non funziona (nessun account).</p>` : ""}
      <div class="riga-pulsanti"><button class="secondario con-ic" data-azione="copia" data-t="${esc(link)}">${ic("copia")}Copia il link</button></div>
      ${arrivati.length ? `<h3 class="sez">Arrivati dal QR</h3>${arrivati.map(r => cardContatto(r) + tastoSquillo(r)).join("")}` : `<p class="tenue piccolo-testo attesa">${ic("aggiorna", "gira")}In attesa: appena compila, il contatto compare qui.</p>`}
    </div>`;
  if (!chiave) return;
  caricaQR().then(qrcode => {
    const q = qrcode(0, "M");
    q.addData(link);
    q.make();
    const box = document.getElementById("qr");
    if (box) box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }).catch(e => { const box = document.getElementById("qr"); if (box) box.innerHTML = `<p class="errore">${esc(e.message)}</p>`; });
}

// ---------- passo 2: i miei appunti (dopo, da solo) ----------
function disegnaAppunti(cid, kid) {
  const r = D.contatto(kid);
  if (!r || r.eliminato) return vai(`#/c/${cid}`);
  const d = r.dati;
  const campo = (k, etichetta, segnaposto) =>
    `<label>${etichetta}<textarea data-appunto="${k}" rows="2" placeholder="${esc(segnaposto)}">${esc(valoreApp(d, k) || "")}</textarea></label>`;
  $app.innerHTML = `${barra({ titolo: "I miei appunti", sopra: d.nome, indietro: `#/c/${cid}/k/${kid}` })}
    <div class="corpo modulo">
      ${U.appenaPiantato === kid ? `<div class="piantato">${pianta(r, "nuova")}<p><b>Seme piantato!</b><br>Ora che ${esc(d.nome.split(" ")[0])} se n'è andato/a, segnati cosa ti ha raccontato.</p></div>` : ""}
      <p class="tenue con-ic">${ic("lucchetto")}Solo per la squadra: la persona non li vede.</p>
      <span class="etichetta">Chi è</span>
      <div class="segm">${FASCE.map(f => `<button class="${d.fascia === f ? "on" : ""}" data-azione="appunto-scelta" data-k="fascia" data-v="${f}">${f}</button>`).join("")}</div>
      <div class="due">
        <label>Età<input data-appunto="eta" value="${esc(d.eta || "")}" inputmode="numeric" placeholder="—"></label>
        <div><span class="etichetta">Gruppo</span>
          <div class="contatore"><b>1x${persone(r)}</b></div></div>
      </div>
      ${campo("altri", "Chi altro c'era", "es. moglie Anna, figlio Luca 15 anni (liceo)")}
      ${CATEGORIE.map(([k, t, segnaposto]) => campo(k, t, segnaposto)).join("")}
      <span class="etichetta">Interesse</span>
      <div class="segm">${[1, 2, 3].map(i => `<button class="${+d.interesse === i ? "on" : ""}" data-azione="appunto-scelta" data-k="interesse" data-v="${i}">${INTERESSE[i]}</button>`).join("")}</div>
      ${campo("appunti", "Altri appunti", "Tutto il resto…")}
      <span class="etichetta">Demo</span>
      ${riquadroOd(cid, r, true)}
      <span class="etichetta">Cose da fare</span>
      ${coseDaFare(cid, r)}
      <div class="riga-pulsanti">
        <button class="secondario con-ic" data-azione="stesso-gruppo" data-id="${kid}">${ic("piu")}Altro dello stesso gruppo</button>
        <button class="primario" data-azione="fine-appunti" data-id="${kid}">Fatto</button>
      </div>
    </div>
    ${U.tappaBozza ? foglioTappa() : U.odModifica ? formOpenDay() : U.sceltaOd ? foglioSceltaOd(cid, r) : ""}`;
}
/** negli appunti: le cose da fare di questa persona; per il richiamo si sceglie subito quando (scelta dell'utente) */
function coseDaFare(cid, r) {
  const prima = primaDellaDemo(cid, r);
  const scelte = t => [["Domani 18:00", alle(1)], ["Dopodomani 18:00", alle(2)], prima && ["Giorno prima della demo", prima]].filter(Boolean);
  const riga = t => {
    const sc = tipoTappa(t) === "richiamo" && !t.fatta ? scelte(t) : [];
    const giusta = sc.find(([, q]) => q === t.quando);
    return `<div class="tappa-app ${t.fatta ? "fatta" : ""}">
      <button class="cerchio" data-azione="tappa-fatta" data-k="${r.id}" data-t="${t.id}" aria-label="Fatta">${t.fatta ? ic("spunta") : ""}</button>
      <button class="testo" data-azione="tappa-apri" data-t="${t.id}"><span class="nome">${ic(tipoTappa(t) === "messaggio" ? "messaggio" : "telefono", "tipo-tappa")}${esc(t.titolo)}</span>
        <span class="sotto">${t.fatta ? "fatta" : t.quando ? esc(quandoBreve(t.quando)) : "Quando?"}${t.fatta ? "" : tentativi(t)}</span></button></div>
      ${sc.length ? `<div class="scegli-quando">${sc.map(([testo, q]) => `<button class="${q === t.quando ? "on" : ""}" data-azione="tappa-quando" data-t="${t.id}" data-q="${q}">${testo}</button>`).join("")}
        <button class="${t.quando && !giusta ? "on" : ""}" data-azione="tappa-apri" data-t="${t.id}">${t.quando && !giusta ? esc(quandoBreve(t.quando)) : "Scegli giorno e ora"}</button></div>` : ""}`;
  };
  return `<div class="box-dafare">${ordinaTappe(r.dati.tappe || []).map(riga).join("")}
    <button class="link con-ic" data-azione="tappa-nuova">${ic("piu")}Aggiungi una cosa da fare</button></div>`;
}

/** sotto la demo: «Confermato in demo?» (candidato) oppure «Confermato · 1x3 con mamma, papà» */
function rigaConferma(r, puoi) {
  if (!odDi(r.classe_id, r.dati.openDay) || nonInteressato(r)) return "";
  const on = confermato(r);
  return `<button class="conferma-demo ${on ? "on" : ""}" ${puoi ? `data-azione="conferma-apri" data-id="${r.id}"` : "disabled"}>
    <span class="cerchio">${on ? ic("spunta") : ""}</span>
    <span class="testo"><span class="nome">${on ? "Confermato in demo" : "Candidato: confermato?"}</span>${on ? `<span class="sotto">${conChi(r) ? "con " + esc(conChi(r)) : "da solo/a"}</span>` : ""}</span>
    ${on ? `<span class="nxm">1x${vengono(r)}</span>` : ""}</button>`;
}
/** il foglio della conferma: spunta, «viene con» (scelta multipla + Altro…), «viene insieme a», e il suo 1xN */
function foglioConferma(cid, r) {
  const b = U.confermaDemo; if (!b) return "";
  const x = D.contatto(b.kid); if (!x) return "";
  const n = 1 + b.con.length + altriScritti(b.altro);
  const altri = D.contatti(cid).filter(y => y.id !== x.id && !y.eliminato && y.user_id === x.user_id && y.dati.openDay === x.dati.openDay && confermato(y) && !y.dati.demo?.insieme);
  return `<div class="foglio-velo" data-azione="conf-chiudi"></div>
    <div class="foglio modulo foglio-conferma">
      <div class="maniglia"></div>
      <div class="testa-foglio"><button type="button" class="ann" data-azione="conf-chiudi">Annulla</button><span class="tit">${esc(x.dati.nome || "")}</span>
        <button type="button" class="salva" data-azione="conf-salva">Salva</button></div>
      <button type="button" class="spunta-grande ${b.conf ? "on" : ""}" data-azione="conf-toggle"><span class="cerchio">${b.conf ? ic("spunta") : ""}</span>Confermato in demo</button>
      ${b.conf ? `<div class="etichetta">Viene con</div>
        <div class="chi-msg">${Object.entries(COMP).map(([k, c]) => `<button type="button" class="${b.con.includes(k) ? "on" : ""}" data-azione="conf-comp" data-k="${k}">${c[0]}</button>`).join("")}</div>
        <input class="altro-msg" data-conf-altro value="${esc(b.altro)}" placeholder="Altro… (es. zia, cugino)" maxlength="80" autocomplete="off">
        ${altri.length ? `<div class="etichetta">Viene insieme a</div><div class="chi-msg">${altri.map(y => `<button type="button" class="${b.insieme === y.id ? "on" : ""}" data-azione="conf-insieme" data-id="${y.id}">${esc((y.dati.nome || "?").split(" ")[0])}</button>`).join("")}</div>` : ""}
        <div class="grande-nxm"><b id="conf-n">1x${n}</b></div>` : ""}
    </div>`;
}
/** la pagina di una demo: in grande il NxM dei confermati, chi li porta, i confermati; i candidati in piccolo (tocco = elenco) */
const perNome = (a, b) => (a.dati.nome || "").localeCompare(b.dati.nome || "", "it");
/** i gruppi in ordine di nome (e dentro ogni gruppo, le persone in ordine di nome) */
const gruppiPerNome = gr => gr.map(p => [...p].sort(perNome)).sort((a, b) => perNome(a[0], b[0]));
/** il testo per WhatsApp con i MIEI confermati di una demo: chi viene, con chi, e gli appunti (scelta dell'utente, 2026-11-21) */
function testoMieiDemo(cid, o) {
  const miei = D.contatti(cid).filter(r => r.dati.openDay === o.id && !r.eliminato && !nonInteressato(r) && confermato(r) && mio(r));
  const gr = gruppiPerNome(gruppiDemo(miei));
  const persona = (r, inGruppo) => {
    const d = r.dati, righe = [`*${d.nome || "Senza nome"}* (1x${vengono(r)})`];
    if (conChi(r) || !inGruppo) righe.push(conChi(r) ? `Viene con: ${conChi(r)}` : "Viene da solo/a");
    const chiE = [d.fascia, d.eta && d.eta + " anni", daDove(d)].filter(Boolean).join(", ");
    if (chiE) righe.push(chiE);
    for (const [k, t] of CATEGORIE) { const v = valoreApp(d, k)?.trim(); if (v) righe.push(`_${t}:_ ${v}`); }
    if (d.appunti?.trim()) righe.push(`_Altri appunti:_ ${d.appunti.trim()}`);
    return righe.join("\n");
  };
  const quando = new Date(o.quando).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return [`*Demo ${quando}${cittaOd(o) ? " · " + cittaOd(o) : ""}*`, `I miei confermati: ${nxmDemo(miei)}`,
    ...gr.map(p => p.length > 1 ? `👥 *Insieme* (1x${p.reduce((s, r) => s + vengono(r), 0)})\n` + p.map(r => persona(r, true)).join("\n\n") : persona(p[0]))].join("\n\n");
}
function disegnaDemo(cid, odid) {
  const o = odDi(cid, odid);
  if (!o) return vai(`#/c/${cid}/openday`);
  const tutti = D.contatti(cid).filter(r => r.dati.openDay === o.id && !r.eliminato && !nonInteressato(r));
  const conf = tutti.filter(confermato), cand = tutti.filter(r => !confermato(r));
  const chi = [...new Set(tutti.map(r => r.user_id))].sort((a, b) => (b === D.io()?.id) - (a === D.io()?.id) || D.nomeDi(cid, a).localeCompare(D.nomeDi(cid, b), "it"));
  const nomeChi = u => u === D.io()?.id ? "Tu" : D.nomeDi(cid, u);
  const g = gruppiDemo(tutti), m = g.flat().reduce((s, r) => s + vengono(r), 0);
  const rigaConf = r => `<div class="riga-demo">${pianta(r, "riga-pianta")}
      <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span><span class="sotto">${conChi(r) ? "con " + esc(conChi(r)) : "da solo/a"}</span></button>
      <button class="nxm chiaro" ${modificabile(r) ? `data-azione="conferma-apri" data-id="${r.id}"` : "disabled"}>1x${vengono(r)}</button></div>`;
  const corpoPag = U.odCandidati
    ? `${chi.filter(u => cand.some(r => r.user_id === u)).map(u => `<h3 class="sez">${u === D.io()?.id ? "I tuoi" : "Di " + esc(D.nomeDi(cid, u))} · ${cand.filter(r => r.user_id === u).length}</h3>` +
        cand.filter(r => r.user_id === u).map(r => `<div class="riga-demo">${pianta(r, "riga-pianta")}
          <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome || "Senza nome")}</span><span class="sotto">${esc(daDove(r.dati).replace(/\s*\([A-Za-z]{2}\)$/, "") || "da confermare")}</span></button>
          ${modificabile(r) ? `<button class="btn-conferma" data-azione="conferma-apri" data-id="${r.id}">Conferma</button>` : ""}</div>`).join("")).join("") || vuoto("Tutti confermati!", 2)}`
    : `<div class="eroe-demo"><div class="quando">${esc(testoQuando(o.quando))}</div><div class="dove">${esc(doveOd(o) || "")}</div>
        <div class="big"><b>${g.length}x${m}</b><span>${num(g.length, "gruppo", "gruppi")}<br>${num(m, "persona confermata", "persone confermate")}</span></div></div>
      ${cand.length ? `<button class="link con-ic candidati" data-azione="od-candidati" data-v="1">${num(cand.length, "candidato", "candidati")} da confermare ${ic("avanti")}</button>` : ""}
      <div class="riga-pulsanti tre">
        ${mapsOd(o) ? `<a class="secondario con-ic" href="${esc(mapsOd(o))}" target="_blank" rel="noopener">${ic("luogo")}Maps</a>` : ""}
        ${online(o) && /^https?:\/\//.test(o.zoom || "") ? `<a class="secondario con-ic" href="${esc(o.zoom)}" target="_blank" rel="noopener">${ic("video")}Zoom</a>` : ""}
        <button class="secondario con-ic" data-azione="condividi-od" data-id="${o.id}">${ic("condividi")}Condividi</button>
      </div>
      ${conf.length ? chi.filter(u => conf.some(r => r.user_id === u)).map(u => {
        // i confermati DIVISI PER CHI LI PORTA (scelta dell'utente, 2026-11-21); dentro, in ordine di nome
        const suoi = gruppiPerNome(g.filter(p => p[0].user_id === u)), io = u === D.io()?.id;
        return `<div class="testa-chi"><span class="nome">${io ? "I tuoi" : esc(nomeChi(u))}</span><span class="nxm ${io ? "" : "chiaro"}">${nxmDemo(suoi.flat())}</span>
            ${io ? `<button class="manda-wa" data-azione="manda-miei" data-id="${o.id}">${ic("messaggio")}Manda</button>` : ""}</div>
          ${suoi.map(p => p.length > 1 ? `<div class="blocco-gruppo verde"><p class="etich">INSIEME · 1x${p.reduce((s, r) => s + vengono(r), 0)}</p>${p.map(rigaConf).join("")}</div>` : rigaConf(p[0])).join("")}`;
      }).join("") : `<h3 class="sez">Confermati</h3><p class="tenue">Ancora nessun confermato.</p>`}`;
  $app.innerHTML = `${U.odCandidati
      ? `<header class="barra"><button class="icona" data-azione="od-candidati" data-v="0" aria-label="Indietro">${ic("indietro")}</button><h1><span class="piccolo">Demo ${esc(new Date(o.quando).toLocaleDateString("it-IT", { day: "numeric", month: "short" }))}</span>Da confermare · ${cand.length}</h1></header>`
      : barra({ titolo: "Demo " + new Date(o.quando).toLocaleDateString("it-IT", { day: "numeric", month: "short" }), sopra: corta(cittaOd(o)), indietro: `#/c/${cid}/openday`,
        destra: `<button class="icona" data-azione="od-modifica" data-id="${o.id}" aria-label="Modifica">${ic("matita")}</button>` })}
    <div class="corpo">${corpoPag}</div>
    ${schede(cid, "openday")}
    ${U.odModifica ? formOpenDay() : U.confermaDemo ? foglioConferma(cid) : ""}`;
}

// ---------- squillo per controllare il numero (scelta dell'utente, 2026-11-20) ----------
// Un'app web non può chiamare da sola: il tasto apre tel: (l'iPhone chiede «Chiama?») e segna `dati.squillo`. Solo i miei
// contatti presi da adesso in poi, con un telefono; dopo lo squillo resta piccolo e verde («Squillo fatto», si può rifare).
const RILASCIO_SQUILLO = "2026-11-20T15:30:00Z";
function tastoSquillo(r) {
  const tel = (r.dati.telefono || "").replace(/[^\d+]/g, "");
  if (!tel || !mio(r) || (r.dati.quando || r.creato_il || "") < RILASCIO_SQUILLO) return "";
  return r.dati.squillo
    ? `<button class="squillo fatto" data-azione="squillo" data-id="${r.id}">${ic("spunta")}Squillo fatto · rifallo</button>`
    : `<button class="squillo" data-azione="squillo" data-id="${r.id}">${ic("telefono")}Fai uno squillo a ${esc((r.dati.nome || "").split(" ")[0])}</button>`;
}

// ---------- scheda del contatto ----------
function disegnaScheda(cid, kid) {
  const r = D.contatto(kid);
  if (!r || r.eliminato) return vai(`#/c/${cid}`);
  const d = r.dati, puoi = modificabile(r);
  const st = stadio(d);
  const tel = (d.telefono || "").replace(/[^\d+]/g, "");
  const wa = numeroWa(d.telefono);
  const ods = openDay(cid);
  const od = odDi(cid, d.openDay);
  const comp = compagni(r);
  const tappe = ordinaTappe(d.tappe || []);
  const nota = (t, v) => v ? `<div class="nota"><b>${t}</b>${esc(v)}</div>` : "";
  const conf = U.conferma === "elimina-" + kid;
  if (U.schedaDi !== kid) { U.schedaDi = kid; U.linguetta = "info"; U.nomeInModifica = false; }   // ogni persona si apre su INFO (2026-11-20: subito i dati per la chiamata)

  // una sola riga discreta sotto il nome (scelta dell'utente: niente etichette colorate)
  const citta = daDove(d).replace(/\s*\([A-Za-z]{2}\)$/, "");
  const chiE = [d.fascia, d.eta && d.eta + " anni"].filter(Boolean).join(", ");
  const sottonome = [etichettaGruppo(r) && `<b>${etichettaGruppo(r)}</b>`, citta && esc(citta), chiE && esc(chiE)].filter(Boolean).join(" · ");

  const linguette = [["info", "Info"], ["appunti", "Appunti"], ["promemoria", "Promemoria"]];
  let contenuto;
  if (U.linguetta === "appunti") {
    contenuto = `${CATEGORIE.map(([k, t]) => nota(t, valoreApp(d, k))).join("")}${nota("Altri appunti", d.appunti)}
      ${senzaAppunti(r) ? `<p class="tenue">Ancora nessun appunto.</p>` : ""}
      ${puoi ? `<button class="link con-ic modifica-link" data-vai="#/c/${cid}/appunti/${kid}">${ic("matita")}Scrivi o modifica gli appunti</button>` : ""}`;
  } else if (U.linguetta === "info") {
    const righe = [["Telefono", d.telefono], ["Email", d.email], ["Di dov'è", daDove(d)], ["Chi è", chiE],
      ["Interesse", d.interesse && INTERESSE[d.interesse]], ["Gruppo", etichettaGruppo(r) && [etichettaGruppo(r), d.altri].filter(Boolean).join(" · ")],
      ["Presa da", `${mio(r) ? "te" : D.nomeDi(cid, r.user_id)}${d.quando ? " · " + quandoBreve(d.quando) : ""}`],
      ["Consenso privacy", d.consenso ? `sì · ${quandoBreve(d.consenso.quando)}${d.daQR ? " (dal suo telefono)" : ""}` : "non registrato"]];
    contenuto = `${righe.filter(([, v]) => v).map(([a, b]) => `<div class="riga-info"><span>${a}</span><span>${esc(b)}</span></div>`).join("")}
      ${comp.length ? `<h3 class="sez">Stesso gruppo</h3>${comp.map(x => cardContatto(x)).join("")}` : ""}
      ${puoi ? `<button class="link con-ic modifica-link" data-azione="stesso-gruppo" data-id="${kid}">${ic("piu")}Altro contatto dello stesso gruppo</button>
        <button class="link con-ic modifica-link" data-vai="#/c/${cid}/modifica/${kid}">${ic("matita")}Modifica i dati</button>
        <button class="link con-ic modifica-link rosso ${conf ? "conferma" : ""}" data-azione="elimina" data-id="${kid}">${ic("cestino")}${conf ? "Tocca di nuovo per eliminare" : "Elimina il contatto"}</button>` : ""}`;
  } else {
    // promemoria UNICO (2026-11-20): la stessa lista degli appunti, con un solo «Aggiungi una cosa da fare»
    contenuto = puoi ? coseDaFare(cid, r) : `<div class="tappe">${tappe.map(t => rigaTappa(r, t, puoi)).join("") || `<p class="tenue">Nessun promemoria.</p>`}</div>`;
  }

  // le azioni sempre in basso, sotto il pollice
  const azione = (attivo, attr, icona, testo) => attivo ? `<a ${attr}>${ic(icona)}${testo}</a>` : `<span class="spento">${ic(icona)}${testo}</span>`;
  $app.innerHTML = `${barra({ titolo: d.nome || (U.nomeInModifica ? "" : "Senza nome"), sopra: `${mio(r) ? "presa da te" : "presa da " + D.nomeDi(cid, r.user_id)}${d.quando ? " · " + quandoBreve(d.quando).replace(/ \d\d:\d\d$/, "") : ""}`, indietro: U.indietro || `#/c/${cid}`, modificaNome: puoi ? 'data-appunto="nome"' : null })}
    <div class="corpo scheda">
      ${sottonome ? `<p class="sottonome">${sottonome}</p>` : ""}
      ${tastoSquillo(r)}
      <div class="traguardi"><button class="ni ${nonInteressato(r) ? "on" : ""}" ${puoi ? `data-azione="non-interessato"` : "disabled"}>${ic("noMeno")}<span>Non interessato</span></button>${TRAGUARDI.map(t => `<button class="${!nonInteressato(r) && st >= t.stadio ? "on" : ""} ${U.cresciuta === kid && st === t.stadio ? "nuova" : ""}" ${puoi ? `data-azione="traguardo" data-k="${t.k}"` : "disabled"}>${svgPianta(t.stadio)}<span>${t.testo}</span></button>`).join("")}
</div>
      ${riquadroOd(cid, r, puoi)}
      <div class="interruttore linguette">${linguette.map(([k, t]) => `<button class="${U.linguetta === k ? "on" : ""}" data-azione="linguetta" data-v="${k}">${t}</button>`).join("")}</div>
      ${contenuto}
    </div>
    <nav class="barra-azioni">
      ${azione(tel, `href="tel:${esc(tel)}" data-chiama="${r.id}"`, "telefono", "Chiama")}
      ${azione(tel, `href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"`, "messaggio", "WhatsApp")}
      ${azione(d.email, `href="mailto:${esc(d.email || "")}"`, "email", "Email")}
      <a role="button" data-azione="condividi-scheda">${ic("condividi")}Condividi</a>
    </nav>
    ${U.tappaBozza ? foglioTappa() : U.odModifica ? formOpenDay() : U.sceltaOd ? foglioSceltaOd(cid, r) : U.confermaDemo ? foglioConferma(cid, r) : ""}`;
  U.cresciuta = null;
}
// ---------- messaggio di conferma dell'open day (anteprima approvata: anteprima/messaggi.html) ----------
function numeroWa(telefono) {
  let wa = (telefono || "").replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^00/, "");
  if (/^3\d{8,9}$/.test(wa)) wa = "39" + wa;
  return wa;
}
/** l'open day della persona, solo se deve ancora arrivare (altrimenti WhatsApp apre la chat come sempre) */
const odFuturo = (cid, d) => { const o = d.telefono && odDi(cid, d.openDay); return o && new Date(o.quando) > new Date() ? o : null; };
function testiMessaggi(cid, r) {
  const o = odDi(cid, r.dati.openDay);
  return messaggi({ nome: r.dati.nome, od: { tipo: o.tipo || "sede", quando: o.quando, via: o.indirizzo || o.luogo || corta(cittaOd(o)), zoom: o.zoom || "" },
    giro: U.msg.giro, sel: U.msg.sel, altro: U.msg.altro });
}
/** i messaggi si riscrivono sul posto (niente ridisegno: la riga dei pulsanti non torna all'inizio e il campo tiene il cursore) */
function aggiornaMessaggi(cid, r) {
  const t = testiMessaggi(cid, r);
  document.querySelectorAll(".msg-testo").forEach((a, i) => { a.value = t[i]; allunga(a); });
  U.msgMemo[U.msg.kid] = { sel: [...U.msg.sel], altro: U.msg.altro };
}
function foglioMessaggi(cid, r) {
  const o = odDi(cid, r.dati.openDay), online = o.tipo === "zoom" || o.tipo === "nazionale", testi = testiMessaggi(cid, r);
  return `<div class="foglio-velo" data-azione="msg-chiudi"></div>
    <div class="foglio modulo foglio-msg">
      <div class="maniglia"></div>
      <div class="testa-foglio"><button type="button" class="ann" data-azione="msg-chiudi">Chiudi</button><span class="tit">Scrivi a ${esc((r.dati.nome || "").split(" ")[0])}</span>
        <button type="button" class="altre-msg" data-azione="msg-altre">${ic("aggiorna")}Altre 2</button></div>
      <p class="info-msg con-ic">${ic(online ? "video" : "calendario")}Open day ${["oggi", "domani"].includes(quandoDetto(new Date(o.quando), new Date()).q) ? quandoDetto(new Date(o.quando), new Date()).q + " · " : ""}${esc(testoQuando(o.quando))}</p>
      <div class="etichetta">Viene con</div>
      <div class="chi-msg">${Object.entries(COMP).map(([k, c]) => `<button type="button" class="${U.msg.sel.includes(k) ? "on" : ""}" data-azione="msg-comp" data-k="${k}">${c[0]}</button>`).join("")}</div>
      <input class="altro-msg" data-msg-altro value="${esc(U.msg.altro)}" placeholder="Altro… (es. i tuoi cugini)" maxlength="80" autocomplete="off">
      ${testi.map((t, i) => `<div class="msg"><div class="num-msg">Messaggio ${i + 1}</div><textarea class="msg-testo" rows="4">${esc(t)}</textarea>
        <div class="piede-msg"><button type="button" class="copia" data-azione="msg-copia">${ic("copia")}Copia</button><button type="button" class="wa" data-azione="msg-wa">${ic("messaggio")}WhatsApp</button></div></div>`).join("")}
      <button type="button" class="link con-ic modifica-link" data-azione="msg-chat">${ic("messaggio")}Apri la chat senza testo</button>
    </div>`;
}
const testoMsg = el => el.closest(".msg").querySelector(".msg-testo").value.trim();
const apriLink = url => { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.click(); };

function rigaTappa(r, t, puoi) {
  const scadenza = t.fatta ? `<span class="q tenue">fatta ${esc(quandoBreve(t.fatta))}</span>`
    : t.quando ? `<span class="q ${new Date(t.quando) < Date.now() ? "scade" : "oggi"}">${ic("campanella")}${esc(quandoBreve(t.quando))}</span>`
    : `<span class="q tenue">${puoi ? `${ic("campanella")}data` : ""}</span>`;
  const riga = `<div class="tappa ${t.fatta ? "fatta" : ""} ${puoi ? "scorribile" : ""}" data-scorri="tappa" data-k="${r.id}" data-t="${t.id}">
    <button class="cerchio" ${puoi ? `data-azione="tappa-fatta" data-k="${r.id}" data-t="${t.id}"` : "disabled"} aria-label="Fatta">${t.fatta ? ic("spunta") : ""}</button>
    <button class="t" ${puoi ? `data-azione="tappa-apri" data-t="${t.id}"` : "disabled"}>${esc(t.titolo)}</button>
    <button class="q-btn" ${puoi ? `data-azione="tappa-apri" data-t="${t.id}"` : "disabled"}>${scadenza}</button>
  </div>`;
  return puoi ? `<div class="scorri-fondo">${ic("cestino")}<span>Cancella</span>${riga}</div>` : riga;
}
/** il foglio del promemoria (U.tappaBozza = { id, nuova, titolo, quando }) */
function foglioTappa() {
  const b = U.tappaBozza;
  return foglio({ titolo: b.nuova ? "Cosa da fare" : "Da fare", annulla: "tappa-chiudi", salva: "tappa-salva", corpo: `
    <div class="segm tipo-foglio">${[["richiamo", "telefono", "Chiamata"], ["messaggio", "messaggio", "Messaggio"]].map(([k, i, t]) => `<button type="button" class="${(b.tipo || "richiamo") === k ? "on" : ""}" data-azione="tappa-tipo" data-v="${k}">${ic(i)}${t}</button>`).join("")}</div>
    <input class="campo titolo-tappa" data-tappa-bozza="titolo" value="${esc(b.titolo)}" placeholder="Cosa devi fare? (es. Richiamare quando ci sono i genitori)" maxlength="80">
    <div class="riassunto">${esc(testoQuando(b.quando))}</div>
    ${ruoteQuando(b.quando, "tappa")}
    ${b.quando ? `<button type="button" class="link senza-data" data-azione="tappa-senza-data">Togli la data (nessun promemoria)</button>` : ""}
    ${b.nuova ? "" : `<button type="button" class="elimina-foglio" data-azione="tappa-elimina">${ic("cestino")}Elimina promemoria</button>`}` });
}

// ---------- modifica nome e recapiti ----------
function disegnaModifica(cid, kid) {
  const r = D.contatto(kid);
  if (!r) return vai(`#/c/${cid}`);
  $app.innerHTML = `${barra({ titolo: "Nome e recapiti", sopra: r.dati.nome, indietro: `#/c/${cid}/k/${kid}` })}
    <div class="corpo modulo">
      <label>Nome e cognome<input data-appunto="nome" value="${esc(r.dati.nome || "")}" autocapitalize="words"></label>
      <label>Telefono<input data-appunto="telefono" value="${esc(r.dati.telefono || "")}" type="tel" inputmode="tel"></label>
      <label>Email<input data-appunto="email" value="${esc(r.dati.email || "")}" type="email" inputmode="email" autocapitalize="off"></label>
      <label>Di dov'è${campoComune('data-appunto="citta"', daDove(r.dati))}</label>
      <div class="riga-pulsanti"><button class="primario" data-vai="#/c/${cid}/k/${kid}">Fatto</button></div>
    </div>`;
}

// ---------- open day ----------
function disegnaOpenDay(cid) {
  // versione «A · righe sottili» scelta dall'utente il 2026-10-28 (anteprima/openday.html)
  const tutti = openDay(cid);
  const citta = [...new Set(tutti.map(cittaOd))].sort((a, b) => (b === NAZ) - (a === NAZ) || a.localeCompare(b, "it"));   // «Nazionale» prima delle città
  if (U.odCitta && !citta.includes(U.odCitta)) U.odCitta = null;
  const scelti = tutti.filter(o => !U.odCitta || cittaOd(o) === U.odCitta);
  const futuri = scelti.filter(o => new Date(o.quando) > Date.now() - 6 * 3600000), passati = scelti.filter(o => !futuri.includes(o)).reverse();
  const contatti = D.contatti(cid);
  const prenotatiDi = o => contatti.filter(r => r.dati.openDay === o.id);
  const riga = o => {
    const p = prenotatiDi(o), d = new Date(o.quando);
    return `<div class="scorri-fondo">${ic("cestino")}<span>Elimina</span><button class="riga-od scorribile" data-scorri="od" data-id="${o.id}" data-azione="od-apri">
      <span class="dmini"><b>${d.getDate()}</b>${d.toLocaleDateString("it-IT", { month: "short" })}</span>
      <span class="testo"><span class="nome">${esc(d.toLocaleDateString("it-IT", { weekday: "long" }))} · ${ora(o.quando)}</span>
        <span class="sotto">${sottoOd(o)}</span></span>
      ${p.length ? `<span class="piante-od">${p.slice(0, 5).map(r => pianta(r, "micro")).join("")}</span><span class="nxm">${nxmDemo(p)}</span>` : ""}
    </button></div>`;
  };
  $app.innerHTML = `${barra({ titolo: "Open day", sopra: D.classe(cid).nome, indietro: "#/",
      destra: `<button class="tondo-nuovo" data-azione="od-modifica" data-id="nuovo" aria-label="Nuovo open day" title="Nuovo open day">${ic("piu")}</button>` })}
    <div class="corpo">
      ${citta.length > 1 ? `<div class="segm scorre">${[null, ...citta].map(c => `<button class="${U.odCitta === c ? "on" : ""}" data-azione="od-citta" data-c="${esc(c || "")}">${c === NAZ ? ic("mondo", "mini") : ""}${esc(c ? corta(c) : "Tutte")}</button>`).join("")}</div>` : ""}
      ${futuri.length ? `<h3 class="sez">Prossimi · ${futuri.length}</h3>${futuri.map(riga).join("")}` : vuoto("Nessun open day in calendario.<br>Tocca il «＋» in alto per aggiungerne uno.")}
      ${passati.length ? `<button class="link con-ic gia-fatti" data-azione="od-passati">${ic(U.odPassati ? "indietro" : "avanti", U.odPassati ? "su" : "")}Già fatti · ${passati.length}</button>
        ${U.odPassati ? passati.map(riga).join("") : ""}` : ""}
    </div>
    ${schede(cid, "openday")}
    ${U.odModifica ? formOpenDay() : U.odDettaglio && odDi(cid, U.odDettaglio) ? foglioOpenDay(cid, odDi(cid, U.odDettaglio), prenotatiDi) : ""}`;
}
/** il foglio di un open day: giorno e via in grande, Maps · Condividi, i prenotati con «è venuto?» */
function foglioOpenDay(cid, o, prenotatiDi) {
  const p = prenotatiDi(o);
  return `<div class="foglio-velo" data-azione="od-chiudi"></div>
    <div class="foglio modulo">
      <div class="maniglia"></div>
      <div class="testa-foglio"><button type="button" class="ann" data-azione="od-chiudi">Chiudi</button><span class="tit">Open day</span>
        <button type="button" class="ann" data-azione="od-modifica" data-id="${o.id}">Modifica</button></div>
      <div class="riassunto">${esc(testoQuando(o.quando))}</div>
      <p class="tenue od-dove-foglio">${esc(doveOd(o) || "Luogo da decidere")}</p>
      <div class="riga-pulsanti tre">
        ${mapsOd(o) ? `<a class="secondario con-ic" href="${esc(mapsOd(o))}" target="_blank" rel="noopener">${ic("luogo")}Maps</a>` : ""}
        ${online(o) && /^https?:\/\//.test(o.zoom || "") ? `<a class="secondario con-ic" href="${esc(o.zoom)}" target="_blank" rel="noopener">${ic("video")}Zoom</a>` : ""}
        <button class="secondario con-ic" data-azione="condividi-od" data-id="${o.id}">${ic("condividi")}Condividi</button>
      </div>
      <h3 class="sez">Prenotati · ${p.length}${o.posti ? " su " + o.posti : ""}</h3>
      ${p.length ? p.map(r => `<div class="prenotato">${pianta(r, "riga-pianta")}
          <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome)}</span><span class="sotto">di ${esc(D.nomeDi(cid, r.user_id))}${etichettaGruppo(r) ? " · " + etichettaGruppo(r) : ""}</span></button>
          <button class="venuto ${r.dati.traguardi?.openday ? "on" : ""}" ${modificabile(r) ? `data-azione="venuto" data-id="${r.id}"` : "disabled"}>${r.dati.traguardi?.openday ? `${ic("spunta")}venuto` : "è venuto?"}</button>
        </div>`).join("") : `<p class="tenue">Ancora nessuno prenotato.</p>`}
    </div>`;
}
// ---------- open day: sedi fisse e calendario (anteprima approvata: anteprima/openday-calendario.html, 2026-10-31) ----------
/** le sedi: ogni città con la via dell'ultimo open day che la indica (la via si scrive UNA volta; nel modulo non si rifà) */
function sedi(cid) {
  const m = new Map();
  for (const o of openDay(cid)) {   // in ordine di data: l'ultimo vince
    if (o.tipo === "nazionale") continue;
    const c = normalizzaCitta(o.citta); if (!c) continue;
    if (!m.has(c)) m.set(c, "");
    if ((o.indirizzo || "").trim()) m.set(c, o.indirizzo.trim());
  }
  return m;
}
/** un open day nuovo: dentro la schermata di una città (o dalla città di una persona) nasce lì; senza città si chiede prima «Dove?» */
function bozzaNuovoOd(cid, citta) {
  const base = { id: uid(), quando: alle(7, 18) };
  if (citta === NAZ) return { ...base, tipo: "nazionale" };
  if (citta) return { ...base, tipo: "sede", citta, indirizzo: sedi(cid).get(citta) || "" };
  return { ...base, passo: "sede" };
}
const SETTIMANE = 2;   // il calendario mostra sempre 2 settimane (scelta dell'utente, 2026-10-31)
const lunediDi = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
/** il calendario del giorno: 2 settimane, i giorni passati spenti, un puntino dove la stessa sede ha già un open day */
function calendarioOd(o, cid) {
  const scelto = new Date(o.quando), oggi = oggi0();
  if (!U.calInizio) U.calInizio = lunediDi(scelto - oggi < 14 * 864e5 && scelto >= oggi ? oggi : scelto).toISOString();
  const inizio = new Date(U.calInizio);
  const giorni = Array.from({ length: SETTIMANE * 7 }, (_, i) => { const g = new Date(inizio); g.setDate(g.getDate() + i); return g; });
  const ultimo = giorni[giorni.length - 1];
  const mese = giorni[0].getMonth() === ultimo.getMonth() ? ultimo.toLocaleDateString("it-IT", { month: "long", year: "numeric" })
    : `${giorni[0].toLocaleDateString("it-IT", { month: "short" })} – ${ultimo.toLocaleDateString("it-IT", { month: "short", year: "numeric" })}`;
  const stessa = x => x.id !== o.id && (o.tipo === "nazionale" ? x.tipo === "nazionale" : x.tipo !== "nazionale" && cittaOd(x) === normalizzaCitta(o.citta));
  const gia = new Set(openDay(cid).filter(stessa).map(x => chiaveData(x.quando)));
  const haGia = [...gia].length > 0;
  return `<div class="cal"><div class="cal-testa"><b>${esc(mese)}</b><span class="cal-frecce">
      <button type="button" class="cal-oggi" data-azione="cal-oggi">Oggi</button>
      <button type="button" data-azione="cal-passo" data-p="-1" aria-label="Settimana prima">‹</button>
      <button type="button" data-azione="cal-passo" data-p="1" aria-label="Settimana dopo">›</button></span></div>
    <div class="cal-gg">${["L", "M", "M", "G", "V", "S", "D"].map(x => `<span>${x}</span>`).join("")}</div>
    <div class="cal-gr">${giorni.map(g => {
      const passato = g < oggi, on = chiaveData(g) === chiaveData(scelto);
      return `<button type="button" class="${passato && !on ? "passato" : ""} ${g.getTime() === oggi.getTime() ? "oggi" : ""} ${on ? "on" : ""} ${gia.has(chiaveData(g)) ? "ha" : ""} ${g.getDate() === 1 ? "primo" : ""}"
        data-m="${esc(g.toLocaleDateString("it-IT", { month: "short" }))}" ${passato && !on ? "disabled" : `data-azione="cal-g" data-t="${g.getTime()}"`}>${g.getDate()}</button>`; }).join("")}</div>
    ${haGia ? `<div class="cal-leg"><i></i>c'è già un open day ${o.tipo === "nazionale" ? "nazionale" : "a " + esc(corta(normalizzaCitta(o.citta)))}</div>` : ""}</div>`;
}
/** la ruota dell'ora (ogni 15 minuti dalle 7:00 alle 22:45); il giorno si sceglie dal calendario */
function ruotaOra(iso, dove) {
  const d = new Date(iso), minuti = d.getHours() * 60 + d.getMinutes();
  const orari = ORARI.includes(minuti) ? ORARI : [...ORARI, minuti].sort((a, b) => a - b);   // un orario «strano» già salvato resta
  return `<div class="ruote una" data-dove="${dove}"><div class="ruota" data-ruota="orario" data-i="${orari.indexOf(minuti)}">${orari.map(m => `<div class="${m === minuti ? "on" : ""}" data-v="${m}">${hhmm(m)}</div>`).join("")}</div></div>`;
}
/** il foglio dell'open day: i valori stanno in U.odBozza (così i tocchi non cancellano quello che hai scritto).
    Passi: «Dove?» (scelta della sede) · «Nuova sede» (solo la prima volta in una città) · «via» (cambia l'indirizzo della sede) · il modulo. */
function formOpenDay() {
  const cid = rotta().cid, o = U.odBozza, nuovo = U.odModifica === "nuovo", naz = o.tipo === "nazionale";
  const velo = `<div class="foglio-velo" data-azione="od-chiudi"></div>`;
  const testa = (titolo, destra = `<span class="spazio-testa"></span>`, annulla = "od-chiudi") => `<div class="maniglia"></div><div class="testa-foglio">
      <button type="button" class="ann" data-azione="${annulla}">Annulla</button><span class="tit">${esc(titolo)}</span>${destra}</div>`;
  if (o.passo === "sede") {
    const qui = U.odPer ? trova(D.contatto(U.odPer)?.dati.citta) : null;
    const elenco = [...sedi(cid)].map(([c, via]) => ({ c, via, km: qui ? km(qui, trova(c)) : null }))
      .sort((a, b) => ((a.km ?? 1e9) - (b.km ?? 1e9)) || a.c.localeCompare(b.c, "it"));
    return `${velo}<div class="foglio modulo">${testa("Nuovo open day")}
      <div class="etichetta">Dove?</div>
      <div class="sedi-od">${elenco.map(x => `<button type="button" class="sede-scelta" data-azione="od-sede" data-c="${esc(x.c)}">${ic("citta")}<span><b>${esc(corta(x.c))}</b><small>${esc(x.via || "via da inserire")}${x.km != null ? ` · ${x.km} km` : ""}</small></span></button>`).join("")}
        <button type="button" class="sede-scelta" data-azione="od-sede" data-c="${NAZ}">${ic("mondo")}<span><b>Zoom nazionale</b><small>Online, per tutta Italia</small></span></button></div>
      <button type="button" class="link con-ic nuovo-od" data-azione="od-sede-nuova">${ic("piu")}Nuova sede</button></div>`;
  }
  if (o.passo === "nuova") {
    return `${velo}<div class="foglio modulo">${testa("Nuova sede", `<button type="button" class="salva" data-azione="od-sede-avanti">Avanti</button>`)}
      <label>Città<span class="campo-ic">${ic("citta")}${campoComune('data-od="citta"', o.citta || "", "Scrivi il comune, es. Roma")}</span></label>
      <label>Via e numero<span class="campo-ic">${ic("via")}<input data-od="indirizzo" value="${esc(o.indirizzo || "")}" placeholder="es. Via Nazionale 12" autocapitalize="words"></span></label>
      <p class="tenue piccolo-testo">Questa sede resta salvata: la prossima volta basta toccare il suo nome.</p></div>`;
  }
  if (o.passo === "via") {
    return `${velo}<div class="foglio modulo">${testa("Sede di " + corta(o.citta || ""), `<button type="button" class="salva" data-azione="od-via-salva">Salva</button>`, "od-via-annulla")}
      <div class="sede-riga">${ic("citta")}<span class="t"><b>${esc(corta(o.citta || ""))}</b><small>la città non si cambia</small></span>${ic("lucchetto")}</div>
      <label>Via e numero<span class="campo-ic">${ic("via")}<input data-od="indirizzo" value="${esc(o.indirizzo || "")}" placeholder="es. Via Nazionale 12" autocapitalize="words"></span></label>
      <p class="tenue piccolo-testo">Cambia l'indirizzo di tutti gli open day di ${esc(corta(o.citta || ""))}, anche quelli già fissati.</p></div>`;
  }
  const zoom = naz || o.tipo === "zoom";
  const sedeRiga = naz ? `<div class="sede-riga">${ic("mondo")}<span class="t"><b>Zoom nazionale</b><small>Online, per tutta Italia</small></span></div>`
    : `<div class="sede-riga">${ic("citta")}<span class="t"><b>${esc(corta(normalizzaCitta(o.citta) || "Città da decidere"))}</b>${zoom ? `<small>Online, dalla sede</small>` : o.indirizzo ? `<small>${esc(o.indirizzo)}</small>` : ""}</span>
        ${o.indirizzo && !zoom ? `<button type="button" class="mod-sede" data-azione="od-via" aria-label="Cambia l'indirizzo della sede">${ic("matita")}</button>` : ""}
        <span class="mini-segm">${[["sede", "sede", "In presenza"], ["zoom", "video", "Online su Zoom"]].map(([t, i, d]) =>
          `<button type="button" class="${(o.tipo === "zoom") === (t === "zoom") ? "on" : ""}" data-azione="od-tipo" data-t="${t}" aria-label="${d}" title="${d}">${ic(i)}</button>`).join("")}</span></div>`;
  return foglio({ titolo: nuovo ? "Nuovo open day" : "Open day", annulla: "od-chiudi", form: "form-od", corpo: `
    <div class="riassunto">${esc(testoQuando(o.quando))}</div>
    ${sedeRiga}
    ${!zoom && !o.indirizzo ? `<label>Via e numero<span class="campo-ic">${ic("via")}<input data-od="indirizzo" value="" placeholder="es. Via Nazionale 12" autocapitalize="words"></span></label>
      <p class="tenue piccolo-testo">Una volta salvata, la via di questa sede non si chiede più.</p>` : ""}
    ${zoom ? `<label>Link Zoom <span class="facolt">(facoltativo)</span><span class="campo-ic">${ic("video")}<input data-od="zoom" value="${esc(o.zoom || "")}" placeholder="Si può mettere anche dopo" inputmode="url" autocapitalize="off"></span></label>` : ""}
    <div class="etichetta">Giorno</div>${calendarioOd(o, cid)}
    <div class="etichetta">Ora</div>${ruotaOra(o.quando, "od")}
    ${nuovo ? "" : `<button type="button" class="elimina-foglio" data-azione="od-elimina" data-id="${o.id}">${ic("cestino")}Elimina open day</button>`}` });
}

// ---------- squadra: «B» rivista (scelta dell'utente il 2026-10-28, anteprima/squadra3.html) ----------
// Squadra «H2 · M3» (2026-10-28, anteprima/squadra7.html): riquadro azzurro con due numeri affiancati (CONTATTI grandi,
// persone più piccole), niente frase; tre cerchi col NUMERO al centro; piantine decorative accanto al titolo «Squadra».
// Nella pagina di una persona sotto i numeri restano le piantine per fase. Niente classifica, niente pulsanti in alto.
const perc = (n, tot) => tot ? Math.round(n / tot * 100) : 0;
function eroe(n, conFasi, vasi = false) {
  const fasi = conFasi ? `<div class="fasi">${[[0, n.st[0], "semi"], [1, n.st[1], "risposto"], [2, n.st[2], "confermati"], [3, n.st[3], "fioriti"]]
    .map(([st, v, t]) => `<span>${svgPianta(st)}${v}<small>${t}</small></span>`).join("")}</div>` : "";
  // vasi = tre piantine decorative appoggiate SUL riquadro (stanno dentro .corpo e scorrono con lui: prima erano nella barra fissa e restavano sospese)
  return `<div class="eroe ${conFasi ? "con-fasi" : ""} ${vasi ? "con-vasi" : ""}">${vasi ? `<span class="vasi-eroe" aria-hidden="true">${[1, 2, 3].map(st => svgPianta(st)).join("")}</span>` : ""}<div class="due-num">
    <div class="n-uno"><b>${n.contatti}</b><span>${n.contatti === 1 ? "contatto" : "contatti"}</span></div>
    <div class="n-due"><b>${n.persone}</b><span>${n.persone === 1 ? "persona" : "persone"}</span></div></div>${fasi}</div>`;
}
function anelli(n) {
  const anello = (v, t) => { const p = perc(v, n.numeri);
    return `<div class="anello"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--chip)" stroke-width="6"/>
      <circle cx="32" cy="32" r="27" fill="none" stroke="var(--accento)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(p / 100 * 169.6).toFixed(1)} 169.6" transform="rotate(-90 32 32)"/>
      <text x="32" y="39.5" text-anchor="middle">${v}</text></svg>${v === 1 && t === "iscritti" ? "iscritto" : t}<br>${p}%</div>`; };
  return `<div class="anelli">${anello(n.risposto, "risposto")}${anello(n.openday, "confermato")}${anello(n.iscritti, "iscritti")}</div>
    ${n.ni ? `<p class="tenue piccolo-testo con-ic centrato">${ic("noMeno")}${num(n.ni, "non interessato", "non interessati")}</p>` : ""}`;
}
function disegnaSquadra(cid) {
  const tutti = D.contatti(cid), io = D.io().id;
  if (U.chi !== "tutti" && !D.membri(cid).some(m => m.user_id === U.chi)) U.chi = "tutti";
  const unaPersona = U.chi !== "tutti";
  const sel = unaPersona ? tutti.filter(r => r.user_id === U.chi) : tutti;
  const nome = unaPersona ? (U.chi === io ? "Tu" : D.nomeDi(cid, U.chi)) : "";
  const di = !unaPersona ? "della squadra" : U.chi === io ? "tuoi" : "di " + nome;
  const titoloLista = U.chi === io ? "I tuoi contatti" : "Contatti " + di;
  let contenuto;
  if (U.squadraLista) {
    // tutti i contatti (della squadra o della persona), con ricerca e filtri
    const filtri = { tutti: "Tutti", sentire: "Da sentire", risposto: "Risposto", openday: "Confermati", iscritti: "Iscritti", ni: "Non interessati" };
    const passa = r => {
      const st = stadio(r.dati), ni = nonInteressato(r);
      if (U.filtro === "sentire" && (ni || st > 0)) return false;
      if (U.filtro === "risposto" && (ni || st < 1)) return false;
      if (U.filtro === "openday" && (ni || st < 2)) return false;
      if (U.filtro === "iscritti" && (ni || st < 3)) return false;
      if (U.filtro === "ni" && !ni) return false;
      if (U.cerca.trim() && !corrisponde(r, U.cerca)) return false;
      return true;
    };
    const lista = sel.filter(passa).sort((a, b) => (b.dati.quando || "").localeCompare(a.dati.quando || ""));
    contenuto = `<button class="link con-ic torna-squadra" data-azione="squadra-lista" data-v="0">${ic("indietro")}${unaPersona ? esc(nome) : "La squadra"}</button>
      <h3 class="sez">${esc(titoloLista)} · ${sel.length}</h3>
      <input class="campo cerca" type="search" placeholder="Cerca nome, telefono, città…" value="${esc(U.cerca)}" data-cerca>
      <div class="segm scorre">${Object.entries(filtri).map(([k, t]) => `<button class="${U.filtro === k ? "on" : ""}" data-azione="filtro" data-f="${k}">${t}</button>`).join("")}</div>
      <div id="lista-squadra">${lista.map(r => rigaContatto(r, { conChi: !unaPersona })).join("") || `<p class="tenue">Nessun contatto.</p>`}</div>`;
  } else if (unaPersona) {
    contenuto = `<button class="link con-ic torna-squadra" data-azione="scegli-chi" data-id="tutti">${ic("indietro")}La squadra</button>
      ${sel.length ? eroe(conteggi(sel), true) + anelli(conteggi(sel)) : vuoto("Ancora nessun contatto.")}
      <button class="riga-tutti" data-azione="squadra-lista" data-v="1">${ic("lista")}${esc(titoloLista)}<span>${sel.length}</span>${ic("avanti", "freccia")}</button>`;
  } else {
    const membri = D.membri(cid).map(m => ({ m, c: conteggi(tutti.filter(r => r.user_id === m.user_id)) }))
      .sort((a, b) => a.m.nome.localeCompare(b.m.nome, "it"));
    contenuto = `${tutti.length ? eroe(conteggi(tutti), false, true) + anelli(conteggi(tutti)) : vuoto("Ancora nessun contatto nella squadra.")}
      <h3 class="sez">La squadra</h3>
      ${membri.map(x => `<button class="riga-persona" data-azione="scegli-chi" data-id="${x.m.user_id}">
        <span class="iniziale">${esc((x.m.nome || "?").trim()[0].toUpperCase())}</span>
        <span class="testo"><span class="nome">${esc(x.m.nome)}${x.m.user_id === io ? " (tu)" : ""}</span>
        <span class="tre-num"><span><b>${x.c.contatti}</b> ${x.c.contatti === 1 ? "contatto" : "contatti"}</span><span><b>${x.c.persone}</b> ${x.c.persone === 1 ? "persona" : "persone"}</span><span><b>${x.c.iscritti}</b> ${x.c.iscritti === 1 ? "iscritto" : "iscritti"}</span></span></span>
        ${ic("avanti", "freccia")}</button>`).join("")}
      <button class="riga-tutti" data-azione="squadra-lista" data-v="1">${ic("lista")}Tutti i contatti<span>${tutti.length}</span>${ic("avanti", "freccia")}</button>`;
  }
  $app.innerHTML = `${barra({ titolo: unaPersona ? nome : "Squadra", sopra: D.classe(cid).nome, indietro: "#/",
      destra: `<button class="icona" data-azione="esporta" aria-label="Esporta i contatti (CSV)" title="Esporta i contatti ${esc(di)} (CSV)">${ic("esporta")}</button>` })}
    <div class="corpo">${contenuto}</div>
    ${schede(cid, "squadra")}`;
}

// ---------- condividere in chat ----------
/** la scheda della persona come testo ordinato per WhatsApp/Telegram (*grassetto*) */
function testoScheda(r) {
  const d = r.dati, cid = r.classe_id, od = odDi(cid, d.openDay);
  const righe = [`*${d.nome || "Senza nome"}*`];
  if (d.telefono) righe.push("Telefono: " + d.telefono);
  if (d.email) righe.push("Email: " + d.email);
  if (daDove(d)) righe.push("Di dove: " + daDove(d));
  const chi = [d.fascia, d.eta && d.eta + " anni", etichettaGruppo(r) && "gruppo " + etichettaGruppo(r)].filter(Boolean).join(", ");
  if (chi) righe.push(chi);
  if (od) righe.push("Open day: " + dataOd(od) + (doveOd(od) ? " – " + doveOd(od) : ""));
  if (d.interesse) righe.push("Interesse: " + INTERESSE[d.interesse].toLowerCase());
  righe.push("Stato: " + (nonInteressato(r) ? "non interessato" : STADI[stadio(d)].spiega));
  for (const [k, t] of [...CATEGORIE, ["altri", "Chi altro c'era"], ["appunti", "Altri appunti"]]) if (valoreApp(d, k)?.trim()) righe.push("", `*${t}*`, valoreApp(d, k).trim());
  righe.push("", `Preso da ${D.nomeDi(cid, r.user_id)}${d.quando ? " il " + new Date(d.quando).toLocaleDateString("it-IT") : ""}`);
  return righe.join("\n");
}
/** il foglio «Condividi» dell'iPhone; se non c'è, copia negli appunti */
async function condividi(testo, copiato) {
  if (navigator.share) { await navigator.share({ text: testo }).catch(() => {}); return; }
  await navigator.clipboard.writeText(testo);
  avviso(copiato, { icona: "copia" });
}

// ---------- esporta CSV (si apre con Excel / Numbers / Google Fogli) ----------
async function esporta(cid) {
  const lista = D.contatti(cid).filter(r => U.chi === "tutti" || r.user_id === U.chi)
    .sort((a, b) => (a.dati.quando || "").localeCompare(b.dati.quando || ""));
  const data = iso => iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "";
  const colonne = [
    ["Nome", r => r.dati.nome], ["Telefono", r => r.dati.telefono], ["Email", r => r.dati.email],
    ["Preso da", r => D.nomeDi(cid, r.user_id)], ["Quando", r => data(r.dati.quando)], ["Di dove", r => daDove(r.dati)],
    ["Gruppo", r => etichettaGruppo(r) || "1x1"], ["Chi altro c'era", r => r.dati.altri], ["Chi è", r => r.dati.fascia], ["Età", r => r.dati.eta],
    ...CATEGORIE.map(([k, t]) => [t, r => valoreApp(r.dati, k)]), ["Interesse", r => INTERESSE[r.dati.interesse] || ""],
    ["Appunti", r => r.dati.appunti], ["Open day prenotato", r => { const o = odDi(cid, r.dati.openDay); return o ? dataOd(o) : ""; }],
    ["Stato", r => nonInteressato(r) ? "Non interessato" : STADI[stadio(r.dati)].spiega],
    ["Ha risposto", r => data(r.dati.traguardi?.risposto)], ["Ha confermato", r => data(r.dati.traguardi?.confermato)], ["Venuto all'open day", r => data(r.dati.traguardi?.openday)], ["Iscritto", r => data(r.dati.traguardi?.iscritto)],
    ["Consenso privacy", r => data(r.dati.consenso?.quando)], ["Dal QR", r => r.dati.daQR ? "sì" : ""],
  ];
  const cella = v => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const testo = "﻿" + [colonne.map(c => c[0]), ...lista.map(r => colonne.map(c => c[1](r)))].map(riga => riga.map(cella).join(";")).join("\r\n");
  const nome = `volantinaggio-${D.classe(cid).nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toLocaleDateString("sv")}.csv`;   // "sv" = data come 2026-10-22, con l'ora italiana
  const file = new File([testo], nome, { type: "text/csv" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: nome }).catch(() => {});
  } else {
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: nome });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  avviso(`${num(lista.length, "contatto esportato", "contatti esportati")}`, { icona: "esporta" });
}

// ---------- diario di bordo ----------
// Diario «A · come una chat» (2026-10-28, anteprime anteprima/diario.html e diario-a.html): una casella che parte da UNA
// riga e cresce col testo (fino a ~7 righe, poi scorre dentro), invio tondo in basso a destra, cinque faccine senza scritte,
// note come linea del tempo; tocco su una nota = si apre lì per correggerla.
function disegnaDiario(cid) {
  const note = D.elencoP(`diario:${cid}:`).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.quando.localeCompare(a.quando));
  const spunto = SPUNTI[new Date().getDate() % SPUNTI.length];
  const faccine = (attivo, azione, k = "") => `<div class="faccine">${UMORI.map(u => `<button type="button" class="${attivo === u.k ? "on" : ""}" data-azione="${azione}" data-u="${u.k}"${k ? ` data-k="${esc(k)}"` : ""} aria-label="${u.testo}" title="${u.testo}">${ic(u.k)}</button>`).join("")}</div>`;
  let giorno = "", righe = "";
  for (const n of note) {
    const g = giornoLungo(n.quando);
    if (g !== giorno) { righe += `<h3 class="sez">${esc(g)}</h3>`; giorno = g; }
    const aperta = U.notaAperta === n.k, conf = U.conferma === "nota-" + n.k, u = umore(n.umore);
    righe += aperta ? `<div class="voce aperta"><div class="q">${ora(n.quando)}</div>
        <textarea class="campo" rows="1" data-nota="${esc(n.k)}">${esc(n.testo)}</textarea>
        ${faccine(u?.k, "nota-umore", n.k)}
        <div class="azioni-nota"><button class="pericolo con-ic ${conf ? "conferma" : ""}" data-azione="nota-elimina" data-k="${esc(n.k)}">${ic("cestino")}${conf ? "Tocca di nuovo" : "Elimina"}</button><button class="primario" data-azione="nota-apri" data-k="">Fatto</button></div>
      </div>`
      : `<button class="voce" data-azione="nota-apri" data-k="${esc(n.k)}"><span class="q">${ora(n.quando)}${u ? ic(u.k) : ""}</span><span class="t">${esc(n.testo)}</span></button>`;
  }
  $app.innerHTML = `${barra({ titolo: "Diario di bordo", sopra: D.classe(cid).nome, indietro: "#/" })}
    <div class="corpo">
      <form id="form-diario" class="scrivi-diario">
        <div class="scrivi"><textarea name="testo" rows="1" placeholder="${esc(spunto)}" aria-label="Scrivi nel diario"></textarea>
          <button class="invia" aria-label="Scrivi nel diario">${ic("avanti")}</button></div>
        ${faccine(U.umore, "umore")}
      </form>
      <p class="tenue piccolo-testo con-ic">${ic("lucchetto")}Il diario lo vedi solo tu.</p>
      ${righe ? `<div class="tempo">${righe}</div>` : `<div class="vuoto"><p>Qui puoi segnare pensieri, cosa succede, cosa impari mentre volantini.</p></div>`}
    </div>
    ${schede(cid, "diario")}`;
}

// ---------- classe ----------
function disegnaClasse(cid) {
  const c = D.classe(cid), capo = D.sonoCapo(cid), I = imp(cid);
  const link = location.origin + location.pathname + "#/entra/" + c.codice;
  const io = D.membri(cid).find(m => m.user_id === D.io().id);
  const not = statoNotifiche();
  const testoNot = { "attive": "Promemoria attivi su questo telefono.", "da-attivare": "", "bloccate": "Notifiche bloccate: riattivale da Impostazioni → Notifiche → Volantinaggio.",
    "serve-installazione": "Per i promemoria aggiungi l'app alla schermata Home: in Safari tocca Condividi → «Aggiungi alla schermata Home», poi apri l'app da lì.",
    "non-supportate": "Questo browser non supporta le notifiche." }[not];
  const lista = (k, titolo, spiega) => `<h3 class="sez">${titolo}</h3><p class="tenue piccolo-testo">${spiega}</p>
    ${I[k].map((t, i) => capo ? `<div class="riga-lista"><input class="campo" data-imp="${k}" data-i="${i}" value="${esc(t)}">
      <button class="icona piccola" data-azione="imp-su" data-k="${k}" data-i="${i}" ${i ? "" : "disabled"} aria-label="Su">${ic("indietro", "su")}</button>
      <button class="icona piccola" data-azione="imp-togli" data-k="${k}" data-i="${i}" aria-label="Togli">${ic("chiudi")}</button></div>`
      : `<p class="riga-sola">${i + 1}. ${esc(t)}</p>`).join("")}
    ${capo ? `<button class="link con-ic" data-azione="imp-aggiungi" data-k="${k}">${ic("piu")}Aggiungi</button>` : ""}`;
  $app.innerHTML = `${barra({ titolo: "La classe", sopra: c.nome, indietro: "#/" })}
    <div class="corpo modulo">
      <div class="riquadro invito">
        <span class="etichetta">Codice invito</span>
        <p class="codice">${esc(c.codice)}</p>
        <div class="riga-pulsanti"><button class="primario con-ic" data-azione="condividi" data-link="${esc(link)}">${ic("condividi")}Invita la squadra</button><button class="secondario con-ic" data-azione="copia" data-t="${esc(c.codice)}">${ic("copia")}Copia codice</button></div>
        ${capo ? `<button class="link piccolo-testo" data-azione="nuovo-codice">Cambia codice (il vecchio smette di funzionare)</button>` : ""}
      </div>
      ${capo ? `<label>Nome della classe<input data-classe-nome value="${esc(c.nome)}" maxlength="80"></label>` : ""}
      <label>Il tuo nome nella classe<input data-mio-nome value="${esc(io?.nome || "")}" maxlength="40"></label>
      <h3 class="sez">Promemoria</h3>
      ${not === "da-attivare" ? `<button class="primario largo con-ic" data-azione="notifiche">${ic("campanella")}Attiva i promemoria</button>` : `<p class="tenue con-ic">${ic("campanella")}${testoNot}</p>`}
      <h3 class="sez">Il mio perché</h3>
      <button class="secondario largo" data-vai="#/c/${cid}/perche/0">Rileggi e modifica il mio perché</button>
      ${lista("domande", "Domande del perché", "Le domande che ognuno trova entrando nella classe.")}
      <h3 class="sez">Testo del consenso privacy</h3>
      ${capo ? `<textarea class="campo" rows="5" data-privacy>${esc(I.privacy)}</textarea><p class="tenue piccolo-testo">Ogni contatto salva il testo che ha accettato, con data e ora.</p>` : `<p class="tenue">${esc(I.privacy)}</p>`}
      <h3 class="sez">Squadra · ${D.membri(cid).length}</h3>
      ${D.membri(cid).map(m => {
        const conf = U.conferma === "membro-" + m.user_id;
        return `<div class="riga-lista"><span class="nome">${esc(m.nome)}${m.user_id === c.creata_da ? " · ha creato la classe" : ""}${m.user_id === D.io().id ? " (tu)" : ""}</span>
        ${capo && m.user_id !== D.io().id ? `<button class="pericolo piccolo ${conf ? "conferma" : ""}" data-azione="togli-membro" data-id="${m.user_id}">${conf ? "Sicuro?" : "Togli"}</button>` : ""}</div>`;
      }).join("")}
      <div class="riga-pulsanti fondo">
        ${capo ? `<button class="pericolo ${U.conferma === "elimina-classe" ? "conferma" : ""}" data-azione="elimina-classe">${U.conferma === "elimina-classe" ? "Tocca di nuovo: elimina TUTTO" : "Elimina la classe"}</button>`
          : `<button class="pericolo ${U.conferma === "esci-classe" ? "conferma" : ""}" data-azione="esci-classe">${U.conferma === "esci-classe" ? "Tocca di nuovo per uscire" : "Esci dalla classe"}</button>`}
      </div>
      <p class="tenue piccolo-testo account">${D.PROVA ? 'Modalità prova. <a href="./">Esci dalla prova</a>' : `Account: ${esc(D.io()?.email)} · <button class="link" data-azione="logout">Esci</button>`}</p>
    </div>
    ${schede(cid, "classe")}`;
}

// =========================================================
// IL REGISTA
// =========================================================
let pronto = false;
/** le caselle di testo crescono con quello che scrivi (niente scorrimento dentro la casella) */
function allunga(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; }
function dopoDisegno() {
  $app.querySelectorAll("textarea").forEach(allunga);
  $app.querySelectorAll(".ruota").forEach(r => { r.scrollTop = +r.dataset.i * RIGA_RUOTA; });
}
/** ridisegna restando allo stesso punto (per i tocchi che non cambiano schermata) */
function ridisegnaQui() { const y = corpo()?.scrollTop || 0; disegna(); const c = corpo(); if (c) c.scrollTop = y; }
function disegna() {
  disegnaDentro();
  // i fogli che possono salire da qualsiasi schermata (es. da «Da fare»)
  if (pronto && U.esito && D.contatto(U.esito.kid)) $app.insertAdjacentHTML("beforeend", foglioEsito());
  else if (pronto && U.confermaDemo && !$app.querySelector(".foglio-conferma") && D.contatto(U.confermaDemo.kid)) $app.insertAdjacentHTML("beforeend", foglioConferma(rotta().cid));
  dopoDisegno();
}
/** «Com'è andata con Paolo?»: Non ha risposto · Viene · Ci pensa · Non interessato (+ quando riprovare / richiamare) */
function foglioEsito() {
  const x = D.contatto(U.esito.kid), t = (x.dati.tappe || []).find(y => y.id === U.esito.tid);
  if (!t) { U.esito = null; return ""; }
  const o = odDi(x.classe_id, x.dati.openDay), p = U.esito.passo, tardi = new Date().getHours() >= 19;
  const chip = (q, testo) => `<button data-azione="esito-quando" data-q="${q}">${testo}</button>`;
  return `<div class="foglio-velo" data-azione="esito-chiudi"></div>
    <div class="foglio modulo foglio-esito">
      <div class="maniglia"></div>
      <h3 class="tit-esito">Com'è andata con ${esc((x.dati.nome || "").split(" ")[0])}?</h3>
      <p class="sotto-esito">${esc(t.titolo)}${o ? " · " + esc(dataOd(o).split(" · ")[0]) : ""}${t.tentativi ? ` · ${t.tentativi + 1}° tentativo` : ""}</p>
      ${p === "pensa" ? pannelloPensa(x) : `<div class="esiti">
        <button class="nr ${p === "nr" ? "on" : ""}" data-azione="esito-passo" data-p="nr">${ic("telefono")}Non ha risposto<small>riprovo più tardi</small></button>
        <button class="si" data-azione="esito-viene">${ic("spunta")}Viene<small>confermo e scelgo con chi</small></button>
        <button class="pensa ${p === "pensa" ? "on" : ""}" data-azione="esito-passo" data-p="pensa">${ic("calendario")}Ci pensa<small>lo richiamo…</small></button>
        <button class="no" data-azione="esito-no">${ic("noMeno")}Non interessato<small>tolgo le cose da fare</small></button>
        <button class="nessuna" data-azione="esito-scheda">${ic("matita")}Nessuna di queste<small>non cambio nulla, apro la sua scheda</small></button>
      </div>`}
      ${p === "nr" ? `<p class="dopo-esito">Riprovo:</p><div class="scegli-quando">${chip("2h", "Tra 2 ore")}${tardi ? "" : chip("sera", "Stasera")}${chip("domani", "Domani")}</div>` : ""}
      ${p === "pensa" ? "" : `<button class="link esito-ancora" data-azione="esito-chiudi">Non ho ancora chiamato</button>`}
    </div>`;
}
/** ridisegna solo il contenuto del foglio «Com'è andata?», senza farlo risalire ogni volta */
function aggiornaEsito() {
  const f = $app.querySelector(".foglio-esito");
  if (!f) return ridisegnaQui();
  const t = document.createElement("div"); t.innerHTML = foglioEsito();
  const nuovo = t.querySelector(".foglio-esito");
  if (nuovo) f.innerHTML = nuovo.innerHTML; else ridisegnaQui();
}
/** «Ci pensa»: che promemoria (chiamata o messaggio), che giorno, a che ora (facoltativa) e, se serve, un altro open day */
function pannelloPensa(x) {
  const e = U.esito, cid = x.classe_id;
  if (e.tipo == null) Object.assign(e, { tipo: "richiamo", giorno: "domani", ora: "", od: x.dati.openDay || null });
  const attuale = odDi(cid, e.od);
  const futuri = openDay(cid).filter(o => new Date(o.quando) > Date.now() - 3 * 3600000 || o.id === x.dati.openDay);
  const suo = odDi(cid, x.dati.openDay), citta = suo ? cittaOd(suo) : null;   // l'ordine non cambia mentre si sceglie
  const vicini = [...futuri].sort((a, b) => (cittaOd(a) !== citta) - (cittaOd(b) !== citta)).slice(0, 6);   // prima quelli della stessa città
  const prima = (() => { if (!attuale) return null; const d = new Date(attuale.quando); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return d > Date.now() ? d : null; })();
  if (e.giorno === "prima" && !prima) e.giorno = "domani";
  const g = (q, t) => `<button class="${e.giorno === q ? "on" : ""}" data-azione="esito-giorno" data-q="${q}">${t}</button>`;
  const etOd = o => { const d = new Date(o.quando); return `${d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}${citta && cittaOd(o) !== citta ? " · " + corta(cittaOd(o)) : ""}`; };
  return `<div class="pensa-pannello">
      <button class="link indietro-esito" data-azione="esito-passo" data-p="">${ic("indietro")}Ci pensa</button>
      <p class="dopo-esito">Promemoria</p>
      <div class="segm segm-esito">
        <button class="${e.tipo === "richiamo" ? "on" : ""}" data-azione="esito-tipo" data-v="richiamo">${ic("telefono", "mini")}Chiamata</button>
        <button class="${e.tipo === "messaggio" ? "on" : ""}" data-azione="esito-tipo" data-v="messaggio">${ic("messaggio", "mini")}Messaggio</button>
      </div>
      <p class="dopo-esito">Quando</p>
      <div class="scegli-quando">${g("domani", "Domani")}${g("dopodomani", "Dopodomani")}${g("settimana", "Tra una settimana")}${prima ? g("prima", "Giorno prima della demo") : ""}<button data-azione="esito-scegli">Altro giorno</button></div>
      <p class="dopo-esito">Ora</p>
      <div class="scegli-quando"><button class="${e.ora ? "" : "on"}" data-azione="esito-senzaora" id="esito-senzaora">Senza ora</button><input type="time" class="ora-esito ${e.ora ? "on" : ""}" data-esito-ora value="${esc(e.ora)}" step="900"></div>
      <p class="dopo-esito">Open day</p>
      <div class="scegli-quando">${vicini.map(o => `<button class="${o.id === e.od ? "on" : ""}" data-azione="esito-od" data-id="${o.id}">${esc(etOd(o))}</button>`).join("")}<button class="${e.od ? "" : "on"}" data-azione="esito-od" data-id="">Nessuno</button></div>
      <button class="primario largo salva-esito" data-azione="esito-salva">Salva</button>
    </div>`;
}
/** il giorno scelto in «Ci pensa», all'ora scelta (o alle 18 se senza ora) */
function quandoPensa(x) {
  const e = U.esito;
  let d;
  if (e.giorno === "prima") { const o = odDi(x.classe_id, e.od); d = new Date(o.quando); d.setDate(d.getDate() - 1); }
  else d = new Date(alle({ domani: 1, dopodomani: 2, settimana: 7 }[e.giorno] || 1));
  const [h, m] = e.ora ? e.ora.split(":").map(Number) : [18, 0];
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
function disegnaDentro() {
  if (!pronto) return;
  U.daRidisegnare = false;
  if (!D.PROVA && !D.io()) return disegnaAccesso();
  const R = rotta();
  if (R.vista !== "qr") qrAperto = null;
  if (R.vista === "entra") return disegnaEntra(R.codice);
  if (R.vista === "classi") {
    const ultima = sessionStorage.getItem("volantini.aperta") ? null : ricordato("volantini.classe");
    sessionStorage.setItem("volantini.aperta", "1");
    if (ultima && D.classe(ultima)) return vai("#/c/" + ultima);
    return disegnaClassi();
  }
  if (!D.classe(R.cid)) return D.classi().length || D.PROVA ? vai("#/") : disegnaClassi();
  ricorda("volantini.classe", R.cid);
  if (["miei", "squadra", "openday", "dafare", "od"].includes(R.vista)) U.indietro = location.hash;
  switch (R.vista) {
    case "miei": return disegnaMiei(R.cid);
    case "openday": return disegnaOpenDay(R.cid);
    case "dafare": return disegnaDaFare(R.cid);
    case "od": return disegnaDemo(R.cid, R.param);
    case "squadra": return disegnaSquadra(R.cid);
    case "diario": return disegnaDiario(R.cid);
    case "classe": return disegnaClasse(R.cid);
    case "nuovo": return disegnaNuovo(R.cid);
    case "qr": return disegnaQR(R.cid);
    case "appunti": return disegnaAppunti(R.cid, R.param);
    case "modifica": return disegnaModifica(R.cid, R.param);
    case "k": return disegnaScheda(R.cid, R.param);
    case "perche": return disegnaPerche(R.cid, R.param);
    default: return vai("#/c/" + R.cid);
  }
}
/** ridisegna senza disturbare chi sta scrivendo, e restando allo stesso punto dello scorrimento */
function ridisegnaQuandoPuoi() {
  const a = document.activeElement;
  const vista = rotta().vista;
  if ((a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && $app.contains(a)) || vista === "nuovo") { U.daRidisegnare = true; return; }
  const y = corpo()?.scrollTop || 0;
  disegna();
  const c = corpo();
  if (c) c.scrollTop = y;
}
// il nome: finito di scriverlo (tocco fuori o Invio) torna titolo
$app.addEventListener("focusout", e => {
  if (!e.target.classList?.contains("nome-campo")) return;
  U.nomeInModifica = false;
  if (!e.target.value.trim()) { const r = contattoAperto(); if (r) salvaDati(r, { nome: "Senza nome" }); }
  setTimeout(ridisegnaQui, 0);
});
$app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.classList?.contains("nome-campo")) { e.preventDefault(); e.target.blur(); } });
document.addEventListener("focusout", () => setTimeout(() => {
  if (U.daRidisegnare && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) ridisegnaQuandoPuoi();
}, 50));

addEventListener("hashchange", () => { U.sceltaOd = false; U.conferma = null; U.tappaBozza = null; U.odModifica = null; U.odDettaglio = null; U.notaAperta = null; U.msg = null; U.confermaDemo = null; U.esito = null; if (rotta().vista !== "od") U.odCandidati = false; disegna(); });

// ---------- dopo una chiamata: torni nell'app e sale «Com'è andata?» (2026-11-20) ----------
// il link di chiamata (data-chiama) segna la chiamata sul primo richiamo aperto; quando l'app torna visibile dopo essere
// stata nascosta (la telefonata), si apre il foglio. Se non torni, la riga in «Da fare» mostra «Com'è andata?».
let chiamataInCorso = null, nascostaDopo = false;
document.addEventListener("click", e => {
  const a = e.target.closest("[data-chiama]"); if (!a) return;
  const x = D.contatto(a.dataset.chiama); if (!x || !mio(x)) return;
  const t = ordinaTappe(tappeDaFare(x)).find(y => tipoTappa(y) === "richiamo");
  if (!t) return;
  chiamataInCorso = { kid: x.id, tid: t.id, quando: Date.now() }; nascostaDopo = false;
  setTimeout(() => { cambiaTappa(x, t.id, { chiamata: new Date().toISOString() }); ridisegnaQuandoPuoi(); }, 300);
}, true);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { if (chiamataInCorso) nascostaDopo = true; return; }
  const c = chiamataInCorso;
  if (!c || !nascostaDopo || Date.now() - c.quando > 3 * 3600000) return;
  chiamataInCorso = null; nascostaDopo = false;
  const x = D.contatto(c.kid), t = x?.dati.tappe?.find(y => y.id === c.tid);
  if (t && !t.fatta) { U.esito = { kid: c.kid, tid: c.tid, passo: null }; setTimeout(ridisegnaQui, 300); }
});

// mentre il QR è aperto controllo spesso se è arrivato il contatto
setInterval(() => { if (rotta().vista === "qr" && !document.hidden) D.sincronizza(); }, 5000);

// ---------- i tocchi ----------
const contattoAperto = () => D.contatto(rotta().param);
function confermaDue(chiave) {
  if (U.conferma === chiave) { U.conferma = null; return true; }
  U.conferma = chiave;
  ridisegnaQuandoPuoi();
  setTimeout(() => { if (U.conferma === chiave) { U.conferma = null; ridisegnaQuandoPuoi(); } }, 4000);
  return false;
}
/** salva il promemoria del foglio (nuovo o modificato) e chiude il foglio */
function salvaTappaBozza(r) {
  const b = U.tappaBozza;
  const titolo = b.titolo.trim() || (b.tipo === "messaggio" ? "Messaggio" : "Richiamo");
  const tipo = b.tipo || "richiamo";
  if (b.nuova) salvaDati(r, { tappe: [...(r.dati.tappe || []), { id: b.id, tipo, titolo: b.titolo.trim() || (tipo === "messaggio" ? "Messaggio" : "Richiamo"), quando: b.quando, fatta: null, orario: !!b.quando }] });
  else cambiaTappa(r, b.id, { tipo, titolo, quando: b.quando, orario: !!b.quando });
  U.tappaBozza = null;
  avviso(b.quando ? `Promemoria ${quandoBreve(b.quando)}` : "Promemoria senza data", { annulla: true, icona: "campanella" });
  ridisegnaQui();
}
function cambiaTappa(r, tid, cambi) {
  salvaDati(r, { tappe: (r.dati.tappe || []).map(t => t.id === tid ? { ...t, ...cambi } : t) });
}
async function salvaImp(cid, cambi) {
  try { await D.aggiornaClasse(cid, { impostazioni: { ...D.classe(cid).impostazioni, ...cambi } }); }
  catch (e) { errore(e); }
}

// ---------- le ruote: mentre giri si illumina la voce al centro; a ruota ferma salvo il valore nella bozza ----------
let timerRuota = null;
$app.addEventListener("scroll", e => {
  const r = e.target;
  if (!r.classList?.contains("ruota")) return;
  const i = Math.round(r.scrollTop / RIGA_RUOTA);
  [...r.children].forEach((c, n) => c.classList.toggle("on", n === i));
  clearTimeout(timerRuota);
  timerRuota = setTimeout(() => {
    const box = r.closest(".ruote"), q = leggiRuote(box);
    if (box.dataset.dove === "od" && U.odBozza) U.odBozza.quando = q;
    if (box.dataset.dove === "tappa" && U.tappaBozza) U.tappaBozza.quando = q;
    box.parentElement.querySelectorAll(".ruota").forEach(x => { x.dataset.i = Math.round(x.scrollTop / RIGA_RUOTA); });
    const t = box.parentElement.querySelector(".riassunto"); if (t) t.textContent = testoQuando(q);
  }, 120);
}, true);   // «true»: lo scorrimento non risale da solo fino ad $app

// ---------- scorri a sinistra per cancellare (promemoria, open day) ----------
let sc = null, ultimoScorri = 0;
$app.addEventListener("pointerdown", e => {
  const el = e.target.closest(".scorribile");
  if (el && e.isPrimary && !e.target.closest("input, textarea, .tappa-opzioni, .od-corpo")) sc = { el, x: e.clientX, y: e.clientY, dx: 0, attivo: false };
});
$app.addEventListener("pointermove", e => {
  if (!sc) return;
  const dx = e.clientX - sc.x, dy = e.clientY - sc.y;
  if (!sc.attivo) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { sc = null; return; }   // stai scorrendo la pagina
    if (dx > -12) return;
    sc.attivo = true;
    sc.el.style.transition = "none";
    sc.el.parentElement.classList.add("attivo");
  }
  sc.dx = Math.min(0, dx);
  sc.el.style.transform = `translateX(${sc.dx}px)`;
  sc.el.parentElement.classList.toggle("pronto", sc.dx < -90);
});
function fineScorri() {
  if (!sc) return;
  const { el, dx, attivo } = sc;
  sc = null;
  if (!attivo) return;
  ultimoScorri = Date.now();
  el.style.transition = "transform .2s";
  if (dx < -90) { el.style.transform = "translateX(-110%)"; setTimeout(() => cancellaScorrendo(el), 180); }
  else { el.style.transform = ""; el.parentElement.classList.remove("pronto"); setTimeout(() => el.parentElement.classList.remove("attivo"), 200); }
}
$app.addEventListener("pointerup", fineScorri);
$app.addEventListener("pointercancel", fineScorri);
async function cancellaScorrendo(el) {
  const cid = rotta().cid;
  try {
    if (el.dataset.scorri === "tappa") {
      const r = D.contatto(el.dataset.k);
      salvaDati(r, { tappe: r.dati.tappe.filter(t => t.id !== el.dataset.t) });
      avviso("Promemoria cancellato", { annulla: true, icona: "cestino" });
    }
    if (el.dataset.scorri === "od") {
      const prima = [...(imp(cid).openDay || [])];
      await D.salvaOpenDay(cid, prima.filter(o => o.id !== el.dataset.id));
      avviso("Open day eliminato", { icona: "cestino", annulla: async () => { try { await D.salvaOpenDay(cid, prima); ridisegnaQui(); } catch (err) { errore(err); } } });
    }
  } catch (err) { errore(err); }
  ridisegnaQui();
}

// ---------- tocco lungo su una persona (Lista e Orto): menu dei gruppi ----------
let lungo = null, ultimoLungo = 0;
function apriMenuGruppo(k) { U.menuGruppo = k; ultimoLungo = Date.now(); navigator.vibrate?.(15); ridisegnaQui(); }
$app.addEventListener("pointerdown", e => {
  const el = e.target.closest("[data-lungo]");
  if (!el || !e.isPrimary || e.button > 0) return;
  el.classList.add("premuto");
  lungo = { el, x: e.clientX, y: e.clientY, t: setTimeout(() => { el.classList.remove("premuto"); lungo = null; apriMenuGruppo(el.dataset.lungo); }, 500) };
});
function fermaLungo() { if (!lungo) return; clearTimeout(lungo.t); lungo.el.classList.remove("premuto"); lungo = null; }
$app.addEventListener("pointermove", e => { if (lungo && Math.hypot(e.clientX - lungo.x, e.clientY - lungo.y) > 8) fermaLungo(); });
["pointerup", "pointercancel"].forEach(t => $app.addEventListener(t, fermaLungo));
$app.addEventListener("scroll", fermaLungo, true);
$app.addEventListener("contextmenu", e => {   // clic destro sul Mac (e niente menu di sistema sul telefono)
  const el = e.target.closest("[data-lungo]");
  if (el) { e.preventDefault(); fermaLungo(); apriMenuGruppo(el.dataset.lungo); }
});

$app.addEventListener("click", async e => {
  if (Date.now() - ultimoScorri < 400) return;   // il dito che ha appena scorso non è un tocco
  if (Date.now() - ultimoLungo < 700) return;    // il dito del tocco lungo non apre la scheda
  const el = e.target.closest("[data-vai], [data-azione]");
  if (!el || el.disabled) return;
  if (el.dataset.scheda && el.classList.contains("on")) { e.preventDefault(); return toccaSchedaAttiva(el); }
  if (el.dataset.vai) { e.preventDefault(); return vai(el.dataset.vai); }
  const a = el.dataset.azione, R = rotta(), cid = R.cid;
  const r = ["k", "appunti", "modifica"].includes(R.vista) ? contattoAperto() : null;
  try {
    switch (a) {
      case "annulla": if (D.annulla()) avviso("Annullato", { icona: "annulla" }); break;
      case "cambia-accesso": U.nuovoAccount = !U.nuovoAccount; disegna(); break;
      case "logout": await D.esci(); location.hash = "#/"; disegna(); break;
      case "pannello": U.pannello = el.dataset.p; disegna(); document.querySelector(".riquadro input")?.focus(); break;
      case "chiudi-pannello": U.pannello = null; if (R.vista === "entra") vai("#/"); else disegna(); break;
      case "prossimo-perche": U.perche++; disegna(); break;
      case "fine-perche": avviso("Il tuo perché è con te", { icona: "spunta" }); vai(`#/c/${el.dataset.cid}`); break;
      case "fase-miei": U.faseMiei = el.dataset.f || null; disegna(); break;
      case "vista": U.vista = el.dataset.v; ricorda("volantini.vista", U.vista); disegna(); break;
      case "notifiche":
        await attivaNotifiche(); avviso("Promemoria attivi", { icona: "campanella" }); disegna(); break;

      // nuovo contatto
      case "nuovo": U.bozza = bozzaNuova(el.dataset.cid); vai(`#/c/${el.dataset.cid}/nuovo`); break;
      case "annulla-nuovo": U.bozza = null; vai(`#/c/${cid}`); break;
      case "consenso": U.bozza.consenso = !U.bozza.consenso; disegnaNuovo(cid); break;
      case "salva-nuovo": salvaNuovo(); break;
      case "stesso-gruppo": {
        const base = D.contatto(el.dataset.id);
        U.bozza = bozzaNuova(cid, base);
        vai(`#/c/${cid}/nuovo`);
        break;
      }

      // gruppi 1xN dal tocco lungo (tutte le scritture nello stesso istante = un solo passo da annullare)
      case "gr-chiudi": U.menuGruppo = null; ridisegnaQui(); break;
      case "gr-apri": { const k = U.menuGruppo; U.menuGruppo = null; vai(`#/c/${cid}/k/${k}`); break; }
      case "gr-raggruppa": {
        const b = D.contatto(U.menuGruppo);
        U.selGruppo = { base: b.id, scelti: new Set(compagni(b).map(x => x.id)) };
        U.menuGruppo = null; ridisegnaQui(); break;
      }
      case "gr-togli": {
        const x = D.contatto(U.menuGruppo), comp = compagni(x);
        salvaDati(x, { gruppo: null });
        if (comp.length === 1) salvaDati(comp[0], { gruppo: null });   // chi resta da solo torna 1x1
        U.menuGruppo = null;
        avviso(`${(x.dati.nome || "").split(" ")[0]} tolto/a dal gruppo`, { annulla: true, icona: "gruppo" }); ridisegnaQui(); break;
      }
      case "gr-sciogli": {
        const x = D.contatto(U.menuGruppo);
        [x, ...compagni(x)].forEach(y => salvaDati(y, { gruppo: null }));
        U.menuGruppo = null;
        avviso("Gruppo sciolto", { annulla: true, icona: "gruppo" }); ridisegnaQui(); break;
      }
      case "sel-tocca": {
        const k = el.dataset.k;
        if (k !== U.selGruppo.base) U.selGruppo.scelti.has(k) ? U.selGruppo.scelti.delete(k) : U.selGruppo.scelti.add(k);
        ridisegnaQui(); break;
      }
      case "sel-annulla": U.selGruppo = null; ridisegnaQui(); break;
      case "sel-fatto": {
        const b = D.contatto(U.selGruppo.base);
        const scelti = [...U.selGruppo.scelti].map(k => D.contatto(k)).filter(Boolean);
        const g = b.dati.gruppo || uid();
        const vecchi = new Set([b, ...scelti].map(y => y.dati.gruppo).filter(x => x && x !== g));
        compagni(b).filter(y => !U.selGruppo.scelti.has(y.id)).forEach(y => salvaDati(y, { gruppo: null }));   // tolti dalla spunta
        [b, ...scelti].forEach(y => { if (y.dati.gruppo !== g) salvaDati(y, { gruppo: g }); });
        // chi è rimasto da solo in un vecchio gruppo torna 1x1
        vecchi.forEach(v => { const resto = miei(cid).filter(y => y.dati.gruppo === v); if (resto.length === 1) salvaDati(resto[0], { gruppo: null }); });
        U.selGruppo = null;
        avviso(`Gruppo fatto: 1x${scelti.length + 1}`, { annulla: true, icona: "gruppo" }); ridisegnaQui(); break;
      }

      // appunti
      case "appunto-scelta": {
        const v = el.dataset.k === "interesse" ? +el.dataset.v : el.dataset.v;
        salvaDati(r, { [el.dataset.k]: r.dati[el.dataset.k] === v ? null : v });
        ridisegnaQuandoPuoi(); break;
      }
      case "fine-appunti":
        salvaDati(r, { appuntiFatti: true });
        vai(`#/c/${cid}/k/${r.id}`); break;

      // messaggio di conferma dell'open day
      case "msg-apri": {
        if (!odFuturo(cid, r.dati)) break;
        const memo = U.msgMemo[r.id] || {};
        U.msg = { kid: r.id, giro: 0, sel: [...(memo.sel || [])], altro: memo.altro || "" };
        ridisegnaQui(); break;
      }
      case "msg-chiudi": U.msg = null; ridisegnaQui(); break;
      case "msg-comp": {
        const k = el.dataset.k, i = U.msg.sel.indexOf(k);
        i < 0 ? U.msg.sel.push(k) : U.msg.sel.splice(i, 1);
        el.classList.toggle("on", i < 0); aggiornaMessaggi(cid, r); break;
      }
      case "msg-altre": U.msg.giro++; aggiornaMessaggi(cid, r); break;
      case "msg-copia": await navigator.clipboard.writeText(testoMsg(el)); avviso("Messaggio copiato", { icona: "copia" }); break;
      case "msg-wa": apriLink(`https://wa.me/${numeroWa(r.dati.telefono)}?text=${encodeURIComponent(testoMsg(el))}`); break;
      case "msg-chat": apriLink(`https://wa.me/${numeroWa(r.dati.telefono)}`); break;

      // scheda
      case "traguardo": {
        // i pulsanti scelgono la FASE: tocco «Ha risposto» → la piantina va lì (anche tornando indietro);
        // toccando la fase in cui sei già, scendi di una
        const prima = stadio(r.dati), adesso = new Date().toISOString();
        let fase = TRAGUARDI.find(t => t.k === el.dataset.k).stadio;
        if (fase === prima) fase -= 1;
        if (fase === 2 && prima < 2 && odDi(cid, r.dati.openDay) && !nonInteressato(r)) {   // con una demo: si conferma col foglio (chi viene con lui)
          U.confermaDemo = { kid: r.id, conf: true, con: [...(r.dati.demo?.con || [])], altro: r.dati.demo?.altro || "", insieme: r.dati.demo?.insieme || null };
          ridisegnaQui(); break;
        }
        const vecchi = r.dati.traguardi || {};
        const tr = { ...vecchi,
          risposto: fase >= 1 ? vecchi.risposto || adesso : null,
          confermato: fase >= 2 ? vecchi.confermato || adesso : null,
          openday: fase >= 2 ? vecchi.openday || null : null,   // «è venuto» (dagli open day) vale solo dalla fase 2 in su
          iscritto: fase >= 3 ? vecchi.iscritto || adesso : null };
        salvaDati(r, { traguardi: tr });
        const dopo = stadio({ traguardi: tr });
        if (dopo > prima) { U.cresciuta = r.id; avviso(["", "È spuntato un germoglio!", "La piantina cresce!", "È fiorita! Benvenuto/a nel corso!"][dopo], { annulla: true, icona: "orto" }); }
        ridisegnaQuandoPuoi(); break;
      }
      case "non-interessato": salvaDati(r, { nonInteressato: !r.dati.nonInteressato }); avviso(r.dati.nonInteressato ? "La piantina si risveglia" : "Segnato come non interessato: i promemoria si fermano", { annulla: true, icona: r.dati.nonInteressato ? "orto" : "noMeno" }); ridisegnaQuandoPuoi(); break;
      case "tappa-fatta": {
        const rr = r || D.contatto(el.dataset.k);   // dalla scheda oppure dalla vista «Da fare»
        const t = rr.dati.tappe.find(x => x.id === el.dataset.t);
        if (!t.fatta && tipoTappa(t) === "richiamo") { U.esito = { kid: rr.id, tid: t.id, passo: null }; ridisegnaQui(); break; }   // com'è andata?
        cambiaTappa(rr, t.id, { fatta: t.fatta ? null : new Date().toISOString() });
        if (!t.fatta) avviso("Tappa fatta: piantina annaffiata", { annulla: true, icona: "spunta" });
        ridisegnaQuandoPuoi(); break;
      }
      case "condividi-scheda": await condividi(testoScheda(r), "Scheda copiata: incollala nella chat"); break;
      case "scegli-od-apri": U.sceltaOd = true; U.sceltaOdCitta = null; ridisegnaQui(); break;
      case "scegli-od-chiudi": U.sceltaOd = false; ridisegnaQui(); break;
      case "od-nuovo-per":   // nuovo open day creato dalla scelta di una persona: salvato, le viene già assegnato
        U.odModifica = "nuovo"; U.odPer = r.id;
        U.calInizio = null; U.odBozza = bozzaNuovoOd(cid, el.dataset.citta || "");
        ridisegnaQui(); break;
      case "scegli-od-citta": U.sceltaOdCitta = el.dataset.c; ridisegnaQui(); break;
      case "scegli-od": {
        salvaDati(r, { openDay: el.dataset.id || null });
        U.sceltaOd = false;
        if (U.dopoOd === r.id && el.dataset.id) {   // arrivo da «Com'è andata? → Viene»: subito la conferma
          U.dopoOd = null; const x = D.contatto(r.id);
          U.confermaDemo = { kid: x.id, conf: true, con: [...(x.dati.demo?.con || [])], altro: x.dati.demo?.altro || "", insieme: x.dati.demo?.insieme || null };
          ridisegnaQui(); break;
        }
        U.dopoOd = null;
        const o = odDi(cid, el.dataset.id);
        avviso(o ? `Open day ${dataOd(o)}` : "Nessun open day", { annulla: true, icona: "calendario" });
        ridisegnaQui(); break;
      }
      case "linguetta": U.linguetta = el.dataset.v; ridisegnaQui(); break;
      case "modifica-nome": {
        U.nomeInModifica = true; ridisegnaQui();
        const c = $app.querySelector(".nome-campo"); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
        break;
      }
      case "tappa-apri": {
        const t = r.dati.tappe.find(x => x.id === el.dataset.t);
        U.tappaBozza = { id: t.id, nuova: false, titolo: t.titolo, quando: t.quando || alle(1), tipo: tipoTappa(t) };   // senza data: si parte da domani alle 18
        ridisegnaQui(); break;
      }
      case "tappa-chiudi": U.tappaBozza = null; ridisegnaQui(); break;
      case "squillo": {
        const x = D.contatto(el.dataset.id);
        location.href = "tel:" + (x.dati.telefono || "").replace(/[^\d+]/g, "");
        if (!x.dati.squillo) setTimeout(() => { salvaDati(x, { squillo: new Date().toISOString() }); ridisegnaQuandoPuoi(); }, 600);
        break;
      }
      case "tappa-quando": cambiaTappa(r, el.dataset.t, { quando: el.dataset.q, orario: false }); ridisegnaQuandoPuoi(); break;
      case "senza-data": U.senzaAperta = !U.senzaAperta; ridisegnaQui(); break;
      // «Com'è andata?» dopo una chiamata (2026-11-20, anteprima/esito.html)
      case "esito-apri": U.esito = { kid: el.dataset.k, tid: el.dataset.t, passo: null }; ridisegnaQui(); break;
      case "esito-passo": U.esito.passo = el.dataset.p; aggiornaEsito(); break;
      case "esito-chiudi": { const x = D.contatto(U.esito.kid); if (x) cambiaTappa(x, U.esito.tid, { chiamata: null }); U.esito = null; ridisegnaQui(); break; }
      case "esito-quando": {   // Non ha risposto (riprova) o Ci pensa (richiamalo)
        const x = D.contatto(U.esito.kid), nr = U.esito.passo === "nr", q = el.dataset.q;
        const quando = { "2h": new Date(Math.ceil((Date.now() + 2 * 3600000) / 900000) * 900000).toISOString(), sera: stasera(), domani: alle(1),
          dopodomani: alle(2), settimana: alle(7) }[q];
        const tappe = (x.dati.tappe || []).map(t => t.id !== U.esito.tid ? t : { ...t, quando, chiamata: null, orario: q === "2h" || q === "sera",
          tentativi: (t.tentativi || 0) + (nr ? 1 : 0) });
        const cambi = { tappe };
        if (!nr) cambi.traguardi = { ...(x.dati.traguardi || {}), risposto: x.dati.traguardi?.risposto || new Date().toISOString() };
        salvaDati(x, cambi);
        avviso(`${nr ? "Non ha risposto · riprovi" : "Lo richiami"} ${quandoBreve(quando)}`, { annulla: true, icona: "telefono" });
        U.esito = null; ridisegnaQuandoPuoi(); break;
      }
      case "esito-scegli": {   // Ci pensa → giorno e ora a scelta: si apre il promemoria nella sua scheda
        const { kid, tid } = U.esito, x = D.contatto(kid), t = x.dati.tappe.find(y => y.id === tid);
        const tipo = U.esito.tipo || tipoTappa(t), od = U.esito.tipo ? U.esito.od : x.dati.openDay;
        const titolo = tipo === tipoTappa(t) ? t.titolo : tipo === "messaggio" ? "Messaggio" : "Richiamo";
        U.esito = null;
        salvaDati(x, { traguardi: { ...(x.dati.traguardi || {}), risposto: x.dati.traguardi?.risposto || new Date().toISOString() },
          openDay: od || null, tappe: x.dati.tappe.map(y => y.id === tid ? { ...y, chiamata: null } : y) });
        location.hash = `#/c/${x.classe_id}/k/${kid}`;
        setTimeout(() => { U.tappaBozza = { id: tid, nuova: false, titolo, quando: t.quando || alle(1), tipo }; ridisegnaQui(); }, 60);
        break;
      }
      case "esito-scheda": {   // nessuna delle quattro: niente modifiche, si apre la scheda per sistemare a mano
        const { kid, tid } = U.esito, x = D.contatto(kid);
        U.esito = null; cambiaTappa(x, tid, { chiamata: null });
        const dove = `#/c/${x.classe_id}/k/${kid}`;
        if (location.hash === dove) ridisegnaQui(); else location.hash = dove;
        break;
      }
      case "esito-tipo": U.esito.tipo = el.dataset.v; aggiornaEsito(); break;
      case "esito-giorno": U.esito.giorno = el.dataset.q; aggiornaEsito(); break;
      case "esito-senzaora": U.esito.ora = ""; aggiornaEsito(); break;
      case "esito-od": U.esito.od = el.dataset.id || null; aggiornaEsito(); break;
      case "esito-salva": {   // Ci pensa → promemoria scelto (tipo, giorno, ora) ed eventuale cambio di open day
        const x = D.contatto(U.esito.kid), e = U.esito, quando = quandoPensa(x);
        const tappe = (x.dati.tappe || []).map(t => {
          if (t.id !== e.tid) return t;
          const titolo = e.tipo === tipoTappa(t) ? t.titolo : e.tipo === "messaggio" ? "Messaggio" : "Richiamo";
          return { ...t, tipo: e.tipo, titolo, quando, chiamata: null, orario: !!e.ora };
        });
        const cambi = { tappe, traguardi: { ...(x.dati.traguardi || {}), risposto: x.dati.traguardi?.risposto || new Date().toISOString() } };
        const cambiaOd = (e.od || null) !== (x.dati.openDay || null);
        if (cambiaOd) cambi.openDay = e.od || null;
        salvaDati(x, cambi);
        const o = cambiaOd ? odDi(x.classe_id, e.od) : null;
        avviso(`${e.tipo === "messaggio" ? "Messaggio" : "Chiamata"} ${quandoBreve(quando)}${cambiaOd ? (o ? " · open day " + dataOd(o).split(" · ")[0] : " · senza open day") : ""}`, { annulla: true, icona: e.tipo === "messaggio" ? "messaggio" : "telefono" });
        U.esito = null; ridisegnaQuandoPuoi(); break;
      }
      case "esito-viene": {
        const { kid, tid } = U.esito, x = D.contatto(kid);
        U.esito = null;
        cambiaTappa(x, tid, { chiamata: null });
        if (odDi(x.classe_id, x.dati.openDay)) {
          U.confermaDemo = { kid, conf: true, con: [...(x.dati.demo?.con || [])], altro: x.dati.demo?.altro || "", insieme: x.dati.demo?.insieme || null };
          ridisegnaQui();
        } else {   // senza demo: prima si sceglie la demo nella sua scheda
          location.hash = `#/c/${x.classe_id}/k/${kid}`;
          setTimeout(() => { U.sceltaOd = true; U.sceltaOdCitta = null; U.dopoOd = kid; ridisegnaQui(); avviso("Scegli la demo, poi tocca «Viene?»", { icona: "calendario" }); }, 60);
        }
        break;
      }
      case "esito-no": {
        const x = D.contatto(U.esito.kid);
        salvaDati(x, { nonInteressato: true, tappe: x.dati.tappe.map(y => y.id === U.esito.tid ? { ...y, chiamata: null } : y) });
        avviso(`${(x.dati.nome || "").split(" ")[0]}: non interessato`, { annulla: true, icona: "noMeno" });
        U.esito = null; ridisegnaQuandoPuoi(); break;
      }
      case "tappa-nuova": U.tappaBozza = { id: uid(), nuova: true, titolo: "", quando: alle(1), tipo: "richiamo" }; ridisegnaQui(); break;
      case "tappa-tipo": U.tappaBozza.tipo = el.dataset.v; el.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === el)); break;
      case "filtro-dafare": U.filtroDaFare = U.filtroDaFare === el.dataset.f ? null : el.dataset.f; ridisegnaQui(); break;
      case "tappa-senza-data": U.tappaBozza.quando = null; salvaTappaBozza(r); break;
      case "tappa-salva": salvaTappaBozza(r); break;
      case "tappa-elimina":
        salvaDati(r, { tappe: r.dati.tappe.filter(t => t.id !== U.tappaBozza.id) });
        U.tappaBozza = null; avviso("Promemoria eliminato", { annulla: true, icona: "cestino" }); ridisegnaQui(); break;
      case "elimina":
        if (!confermaDue("elimina-" + r.id)) break;
        D.salvaContatto({ ...r, eliminato: true });
        avviso("Contatto eliminato", { annulla: true, icona: "cestino" });
        vai(`#/c/${cid}`); break;

      // open day
      case "od-apri": U.odCandidati = false; vai(`#/c/${cid}/od/${el.dataset.id}`); break;
      case "od-candidati": U.odCandidati = el.dataset.v === "1"; disegna(); corpo().scrollTop = 0; break;
      case "conferma-apri": {
        const x = D.contatto(el.dataset.id), dm = x.dati.demo || {};
        U.confermaDemo = { kid: x.id, conf: true, con: [...(dm.con || [])], altro: dm.altro || "", insieme: dm.insieme || null };
        ridisegnaQui(); break;
      }
      case "conf-chiudi": U.confermaDemo = null; ridisegnaQui(); break;
      case "conf-toggle": U.confermaDemo.conf = !U.confermaDemo.conf; ridisegnaQui(); break;
      case "conf-comp": { const c = U.confermaDemo.con, i = c.indexOf(el.dataset.k); i < 0 ? c.push(el.dataset.k) : c.splice(i, 1); ridisegnaQui(); break; }
      case "conf-insieme": U.confermaDemo.insieme = U.confermaDemo.insieme === el.dataset.id ? null : el.dataset.id; ridisegnaQui(); break;
      case "conf-salva": {
        const b = U.confermaDemo, x = D.contatto(b.kid), adesso = new Date().toISOString(), tr = { ...(x.dati.traguardi || {}) };
        if (b.conf) {
          Object.assign(tr, { risposto: tr.risposto || adesso, confermato: tr.confermato || adesso });
          // confermato = i richiami ancora aperti si spuntano da soli (scelta dell'utente)
          const tappe = (x.dati.tappe || []).map(t => !t.fatta && tipoTappa(t) === "richiamo" ? { ...t, fatta: adesso } : t);
          salvaDati(x, { traguardi: tr, tappe, demo: { con: b.con, altro: b.altro.trim(), insieme: b.insieme } });
          if (stadio(x.dati) < 2) U.cresciuta = x.id;
          avviso(`${(x.dati.nome || "").split(" ")[0]} confermato/a · 1x${1 + b.con.length + altriScritti(b.altro)}`, { annulla: true, icona: "spunta" });
        } else {
          Object.assign(tr, { confermato: null, openday: null, iscritto: null });
          salvaDati(x, { traguardi: tr, demo: null });
          avviso("Torna candidato/a", { annulla: true, icona: "calendario" });
        }
        U.confermaDemo = null; ridisegnaQuandoPuoi(); break;
      }
      case "od-chiudi": if (U.odModifica && (U.odModifica !== "nuovo" || U.sceltaOd)) U.odModifica = null; else { U.odModifica = null; U.odDettaglio = null; } U.odPer = null; ridisegnaQui(); break;   // da Modifica si torna al foglio dell'open day
      case "od-passati": U.odPassati = !U.odPassati; ridisegnaQui(); break;
      case "od-modifica": {
        const o = odDi(cid, el.dataset.id);
        U.odModifica = o ? o.id : "nuovo"; U.calInizio = null;
        U.odBozza = o ? { ...o } : bozzaNuovoOd(cid, U.odCitta);   // dentro una città nasce lì; da «Tutte» si chiede prima «Dove?»
        ridisegnaQui(); break;
      }
      case "od-sede": {   // la sede scelta: ha già la sua via
        const b = U.odBozza, c = el.dataset.c;
        Object.assign(b, c === NAZ ? { tipo: "nazionale", citta: "", indirizzo: "" } : { tipo: "sede", citta: c, indirizzo: sedi(cid).get(c) || "" });
        delete b.passo; U.calInizio = null; ridisegnaQui(); break;
      }
      case "od-sede-nuova": U.odBozza.passo = "nuova"; ridisegnaQui(); break;
      case "od-sede-avanti": {
        const b = U.odBozza, c = normalizzaCitta(b.citta), via = (b.indirizzo || "").trim();
        if (!c) throw new Error("Scrivi la città.");
        if (!via) throw new Error("Scrivi la via e il numero.");
        Object.assign(b, { tipo: "sede", citta: c, indirizzo: via }); delete b.passo; U.calInizio = null; ridisegnaQui(); break;
      }
      case "od-via": U.odBozza.viaPrima = U.odBozza.indirizzo || ""; U.odBozza.passo = "via"; ridisegnaQui(); break;
      case "od-via-annulla": U.odBozza.indirizzo = U.odBozza.viaPrima; delete U.odBozza.viaPrima; delete U.odBozza.passo; ridisegnaQui(); break;
      case "od-via-salva": {   // la via di una sede cambia per TUTTI i suoi open day
        const b = U.odBozza, via = (b.indirizzo || "").trim(), c = normalizzaCitta(b.citta), prima = imp(cid).openDay || [];
        if (!via) throw new Error("Scrivi la via e il numero.");
        const lista = prima.map(x => x.tipo !== "nazionale" && normalizzaCitta(x.citta) === c && x.indirizzo !== via ? { ...x, indirizzo: via } : x);
        if (lista.some((x, i) => x !== prima[i])) await D.salvaOpenDay(cid, lista);
        b.indirizzo = via; delete b.viaPrima; delete b.passo; ridisegnaQui(); break;
      }
      case "cal-g": {   // un giorno del calendario: l'ora resta quella della ruota
        const b = U.odBozza, d = new Date(+el.dataset.t), q = new Date(b.quando);
        d.setHours(q.getHours(), q.getMinutes(), 0, 0); b.quando = d.toISOString();
        el.closest(".cal-gr").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === el));
        const t = document.querySelector(".foglio .riassunto"); if (t) t.textContent = testoQuando(b.quando);
        break;
      }
      case "cal-passo": case "cal-oggi": {
        const adesso = lunediDi(oggi0());
        let n = a === "cal-oggi" ? adesso : new Date(new Date(U.calInizio).getTime() + (+el.dataset.p) * 7 * 864e5);
        if (n < adesso) n = adesso;
        U.calInizio = n.toISOString();
        el.closest(".cal").outerHTML = calendarioOd(U.odBozza, cid); break;
      }
      case "od-citta": U.odCitta = el.dataset.c || null; disegna(); break;
      case "od-tipo": {   // «In una città» torna a in presenza o Zoom della sede (come prima), le altre scelte sono dirette
        const t = el.dataset.t, b = U.odBozza;
        b.tipo = t === "citta" ? (b.tipo === "nazionale" ? b.tipoCitta || "sede" : b.tipo || "sede") : t;
        if (t !== "nazionale" && t !== "citta") b.tipoCitta = t;
        ridisegnaQui(); break;
      }
      case "manda-miei": await condividi(testoMieiDemo(cid, odDi(cid, el.dataset.id)), "Copiato: incollalo nella chat di WhatsApp"); break;
      case "condividi-od": await condividi(testoOd(odDi(cid, el.dataset.id)), "Open day copiato: incollalo nella chat"); break;
      case "od-elimina": {
        const prima = [...(imp(cid).openDay || [])];
        await D.salvaOpenDay(cid, prima.filter(o => o.id !== el.dataset.id));
        U.odModifica = null; U.odDettaglio = null;
        if (rotta().vista === "od") location.hash = `#/c/${cid}/openday`;
        avviso("Open day eliminato", { icona: "cestino", annulla: async () => { try { await D.salvaOpenDay(cid, prima); ridisegnaQui(); } catch (err) { errore(err); } } });
        ridisegnaQui(); break;
      }
      case "venuto": {
        const x = D.contatto(el.dataset.id);
        const tr = { ...(x.dati.traguardi || {}) };
        tr.openday = tr.openday ? null : new Date().toISOString();
        salvaDati(x, { traguardi: tr });
        if (tr.openday) avviso("La piantina di " + x.dati.nome.split(" ")[0] + " cresce!", { annulla: true, icona: "orto" });
        ridisegnaQuandoPuoi(); break;
      }

      // squadra
      case "scegli-chi":
        if (el.dataset.id === "tutti") { indietroDiLato(() => { U.chi = "tutti"; U.squadraLista = false; }); break; }
        U.chi = el.dataset.id; U.squadraLista = false; disegna(); corpo().scrollTop = 0; break;
      case "squadra-lista":
        if (el.dataset.v !== "1") { indietroDiLato(() => { U.squadraLista = false; }); break; }
        U.squadraLista = true; disegna(); corpo().scrollTop = 0; break;
      case "filtro": U.filtro = el.dataset.f; ridisegnaQuandoPuoi(); break;
      case "esporta": await esporta(cid); break;

      // diario
      case "umore": U.umore = U.umore === el.dataset.u ? null : el.dataset.u; document.querySelectorAll('[data-azione="umore"]').forEach(b => b.classList.toggle("on", b.dataset.u === U.umore)); break;
      case "nota-apri": U.notaAperta = el.dataset.k || null; ridisegnaQuandoPuoi(); break;
      case "nota-umore": { const k = el.dataset.k; const n = D.leggiP(k); D.scriviP(k, { ...n, umore: umore(n.umore)?.k === el.dataset.u ? null : el.dataset.u }); ridisegnaQuandoPuoi(); break; }
      case "nota-elimina":
        if (!confermaDue("nota-" + el.dataset.k)) break;
        D.scriviP(el.dataset.k, null); U.notaAperta = null; avviso("Nota eliminata", { annulla: true, icona: "cestino" }); ridisegnaQuandoPuoi(); break;

      // classe
      case "condividi": {
        const c = D.classe(cid);
        const testo = `Entra nella classe «${c.nome}» su Volantinaggio (LEARNIS Mind). Codice: ${c.codice}`;
        if (navigator.share) await navigator.share({ title: "Volantinaggio", text: testo, url: el.dataset.link }).catch(() => {});
        else { await navigator.clipboard.writeText(testo + "\n" + el.dataset.link); avviso("Invito copiato: incollalo su WhatsApp", { icona: "copia" }); }
        break;
      }
      case "copia": await navigator.clipboard.writeText(el.dataset.t); avviso("Copiato", { icona: "copia" }); break;
      case "nuovo-codice": await D.nuovoCodice(cid); avviso("Nuovo codice: " + D.classe(cid).codice); break;
      case "imp-aggiungi": await salvaImp(cid, { [el.dataset.k]: [...imp(cid)[el.dataset.k], el.dataset.k === "tappe" ? "Nuova tappa" : "Nuova domanda?"] }); break;
      case "imp-togli": { const l = [...imp(cid)[el.dataset.k]]; l.splice(+el.dataset.i, 1); await salvaImp(cid, { [el.dataset.k]: l }); break; }
      case "imp-su": { const l = [...imp(cid)[el.dataset.k]], i = +el.dataset.i; [l[i - 1], l[i]] = [l[i], l[i - 1]]; await salvaImp(cid, { [el.dataset.k]: l }); break; }
      case "togli-membro": if (confermaDue("membro-" + el.dataset.id)) { await D.togliMembro(cid, el.dataset.id); avviso("Tolto dalla classe"); } break;
      case "esci-classe": if (confermaDue("esci-classe")) { await D.togliMembro(cid, D.io().id); ricorda("volantini.classe", null); vai("#/"); } break;
      case "elimina-classe": if (confermaDue("elimina-classe")) { await D.eliminaClasse(cid); ricorda("volantini.classe", null); avviso("Classe eliminata"); vai("#/"); } break;
    }
  } catch (err) { errore(err); }
});
$avviso.addEventListener("click", e => {
  if (!e.target.closest('[data-azione="annulla"]')) return;
  if (annullaSuMisura) annullaSuMisura(); else D.annulla();
  annullaSuMisura = null;
  $avviso.hidden = true;
});

// scrivere nei campi
$app.addEventListener("input", e => {
  const el = e.target, R = rotta(), cid = R.cid;
  if (el.tagName === "TEXTAREA") allunga(el);
  if (el.dataset.bozza) { U.bozza[el.dataset.bozza] = el.value; return; }
  if (el.dataset.od) { U.odBozza[el.dataset.od] = el.value; return; }
  if (el.dataset.appunto) { const r = contattoAperto(); salvaDati(r, el.dataset.appunto === "bisogno" ? { bisogno: el.value, utilita: "", motivazione: "" } : { [el.dataset.appunto]: el.value }, { unisci: true }); return; }
  if (el.dataset.perche) {
    const risposte = [...perche(cid)];
    risposte[+el.dataset.perche] = el.value;
    D.scriviP("perche:" + cid, { risposte }, { unisci: true });
    return;
  }
  if (el.dataset.nota) { const n = D.leggiP(el.dataset.nota); D.scriviP(el.dataset.nota, { ...n, testo: el.value }, { unisci: true }); return; }
  if (el.dataset.tappaBozza) { U.tappaBozza[el.dataset.tappaBozza] = el.value; return; }
  if ("esitoOra" in el.dataset && U.esito) { U.esito.ora = el.value; el.classList.toggle("on", !!el.value); document.getElementById("esito-senzaora")?.classList.toggle("on", !el.value); return; }
  if ("confAltro" in el.dataset && U.confermaDemo) { U.confermaDemo.altro = el.value; const n = document.getElementById("conf-n"); if (n) n.textContent = `1x${1 + U.confermaDemo.con.length + altriScritti(el.value)}`; return; }
  if ("msgAltro" in el.dataset) { U.msg.altro = el.value; const r = contattoAperto(); if (r) aggiornaMessaggi(cid, r); return; }
  if ("cerca" in el.dataset) {
    U[el.dataset.cerca || "cerca"] = el.value;
    clearTimeout(U.timerCerca);
    U.timerCerca = setTimeout(() => {
      const y = corpo()?.scrollTop || 0;
      disegna();
      corpo().scrollTop = y;
      const c = document.querySelector("[data-cerca]"); c.focus(); c.setSelectionRange(c.value.length, c.value.length);
    }, 250);
  }
});
// campi che si salvano quando hai finito (servono la rete o sono scelte)
$app.addEventListener("change", async e => {
  const el = e.target, R = rotta(), cid = R.cid;
  try {
    if (el.dataset.appunto === "citta") { const r = contattoAperto(), c = normalizzaCitta(el.value); if (c !== el.value) { el.value = c; salvaDati(r, { citta: c }); } }
    if (el.dataset.imp) { const l = [...imp(cid)[el.dataset.imp]]; l[+el.dataset.i] = el.value.trim() || l[+el.dataset.i]; await salvaImp(cid, { [el.dataset.imp]: l }); }
    if ("privacy" in el.dataset) { await salvaImp(cid, { privacy: el.value.trim() || IMPOSTAZIONI_INIZIALI.privacy }); avviso("Testo privacy salvato"); }
    if ("classeNome" in el.dataset && el.value.trim()) { await D.aggiornaClasse(cid, { nome: el.value.trim() }); avviso("Nome salvato"); }
    if ("mioNome" in el.dataset && el.value.trim()) { await D.rinominami(cid, el.value.trim()); ricorda("volantini.nome", el.value.trim()); avviso("Nome salvato"); }
  } catch (err) { errore(err); }
});

$app.addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, v = Object.fromEntries(new FormData(f)), R = rotta(), cid = R.cid;
  const bottone = f.querySelector("button:not([type=button])");
  try {
    if (f.id === "form-accesso") {
      bottone.disabled = true;
      await D.accedi(v.email.trim(), v.password, U.nuovoAccount);
      dopoAccesso();
    }
    if (f.id === "form-crea") {
      bottone.disabled = true;
      ricorda("volantini.nome", v.mioNome.trim());
      const id = await D.creaClasse(v.nome.trim(), v.mioNome.trim(), IMPOSTAZIONI_INIZIALI);
      U.pannello = null;
      vai(`#/c/${id}/perche/0`);
    }
    if (f.id === "form-entra") {
      bottone.disabled = true;
      ricorda("volantini.nome", v.mioNome.trim());
      const id = await D.entra(v.codice, v.mioNome.trim());
      U.pannello = null;
      avviso("Benvenuto/a nella squadra!", { icona: "squadra" });
      vai(perche(id).length ? `#/c/${id}` : `#/c/${id}/perche/0`);
    }
    if (f.id === "form-tappa" && v.titolo.trim()) {
      U.tappaBozza = { id: uid(), nuova: true, titolo: v.titolo.trim(), quando: alle(1), tipo: /messagg|scriv|whats/i.test(v.titolo) ? "messaggio" : "richiamo" };   // si apre il foglio per scegliere quando
      ridisegnaQui();
    }
    if (f.id === "form-od") {
      const o = { ...U.odBozza, posti: +U.odBozza.posti || null };
      for (const k of ["luogo", "indirizzo", "maps", "note", "zoom"]) o[k] = (o[k] || "").trim();
      delete o.tipoCitta; delete o.passo; delete o.viaPrima;
      o.tipo = o.tipo || "sede";
      o.citta = o.tipo === "nazionale" ? "" : normalizzaCitta(o.citta);
      if (o.zoom && !/^https?:\/\//i.test(o.zoom) && /\./.test(o.zoom)) o.zoom = "https://" + o.zoom;
      if (!o.quando) throw new Error("Scegli il giorno e l'ora.");
      if (o.tipo === "sede" && !o.indirizzo && !o.luogo) throw new Error("Scrivi la via e il numero della sede.");
      const lista = [...(imp(cid).openDay || [])];
      const i = lista.findIndex(x => x.id === o.id);
      if (i >= 0) lista[i] = o; else lista.push(o);
      bottone.disabled = true;
      await D.salvaOpenDay(cid, lista);
      U.odModifica = null; U.odDettaglio = null;
      const per = U.odPer && D.contatto(U.odPer);
      U.odPer = null;
      if (per) { salvaDati(per, { openDay: o.id }); U.sceltaOd = false; avviso(`Open day creato e assegnato a ${(per.dati.nome || "").split(" ")[0]}`, { icona: "calendario" }); }
      else avviso("Open day salvato", { icona: "calendario" });
      ridisegnaQuandoPuoi();
    }
    if (f.id === "form-diario" && v.testo.trim()) {
      D.scriviP(`diario:${cid}:${uid()}`, { quando: new Date().toISOString(), testo: v.testo.trim(), umore: U.umore || null });
      U.umore = null;
      avviso("Scritto nel diario", { annulla: true, icona: "diario" }); disegna();
    }
  } catch (err) {
    errore(err);
    const p = f.querySelector(".errore"); if (p) p.textContent = err.message;
    if (bottone) bottone.disabled = false;
  }
});

// ⌘Z / Ctrl+Z (non dentro i campi di testo) e ⇧⌘Z per ripetere
addEventListener("keydown", e => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
  if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  e.preventDefault();
  if (e.shiftKey ? D.ripeti() : D.annulla()) avviso(e.shiftKey ? "Ripetuto" : "Annullato", { icona: "annulla" });
});

function dopoAccesso() {
  const codice = D.PROVA ? null : ricordato("volantini.codice");   // in prova il codice di un vero invito non vale
  if (codice) { ricorda("volantini.codice", null); location.hash = "#/entra/" + codice; }
  disegna();
  if (!D.PROVA && statoNotifiche() === "attive") registraDispositivo().catch(() => {});
}

// ---------- avvio ----------
/** i contatti arrivati dal QR ricevono messaggio e richiamo (solo i miei, solo quelli presi dopo il rilascio) */
function daFareAiNuovi() {
  if (!D.io()) return;
  for (const c of D.classi()) for (const r of miei(c.id))
    if (!r.eliminato && !r.dati.daFareOk && (r.dati.quando || r.creato_il || "") >= RILASCIO_DAFARE)
      salvaDati(r, { tappe: [...(r.dati.tappe || []), ...tappeIniziali()], daFareOk: true });
}
D.suCambio(() => { daFareAiNuovi(); ridisegnaQuandoPuoi(); });
attivaComuni($app);
caricaComuni().then(() => { if (["appunti", "k", "openday"].includes(rotta().vista)) ridisegnaQuandoPuoi(); }).catch(() => {});   // serve per le distanze
D.suStato(() => { const r = document.querySelector(".barra .rete"); const nuovo = statoRete(); if (r) r.outerHTML = nuovo || "<span class='rete'></span>"; else if (nuovo) ridisegnaQuandoPuoi(); });
D.suRegistro(() => { const b = document.querySelector('.barra [data-azione="annulla"]'); if (b) b.disabled = !D.puoiAnnullare(); });
// l'aiutante offline: si controlla ogni volta che torni sull'app; se ne arriva uno nuovo, la pagina si ricarica una volta
if ("serviceWorker" in navigator && !location.hostname.match(/^(localhost|127\.)/)) {
  const cera = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let ricaricata = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!cera || ricaricata || rotta().vista === "nuovo") return;   // mai mentre stai scrivendo un contatto nuovo
    ricaricata = true;
    location.reload();
  });
}

(async () => {
  const R = rotta();
  if (R.vista === "entra" && R.codice) ricorda("volantini.codice", R.codice);
  const dentro = await D.avvia().catch(() => false);
  pronto = true;
  if (dentro) dopoAccesso(); else disegna();
})();
