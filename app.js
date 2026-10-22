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
import { statoNotifiche, attivaNotifiche, registraDispositivo } from "./push.js";
import { IMPOSTAZIONI_INIZIALI } from "./prova.js";

const $app = document.getElementById("app");
const $avviso = document.getElementById("avviso");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => crypto.randomUUID();
const ricorda = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* niente */ } };
const ricordato = k => { try { return localStorage.getItem(k); } catch { return null; } };

const FASCE = ["Superiori", "Università", "Lavoro", "Genitore", "Altro"];
const INTERESSE = ["", "Poco", "Medio", "Molto"];
const SPUNTI = ["Cosa è andato bene oggi?", "Cosa ho allenato del mio perché?", "Quale incontro mi è rimasto dentro?",
  "Cosa farei diversamente la prossima volta?", "Cosa ho imparato dalle persone che ho fermato?", "Come mi sento adesso?"];
const TRAGUARDI = [
  { k: "risposto", testo: "Ha risposto", stadio: 1 },
  { k: "openday", testo: "Open day", stadio: 2 },
  { k: "iscritto", testo: "Iscritto", stadio: 3 },
];
const mini = st => `<span class="pianta-icona">${svgPianta(st)}</span>`;   // la piantina piccola, al posto delle emoji 🌱🌿🌸
const umore = k => UMORI.find(u => u.k === (DA_EMOJI[k] || k)) || null;

// stato della schermata (non salvato)
const U = {
  pannello: null,        // classi: "crea" | "entra"
  nuovoAccount: false,
  vistaOrto: ricordato("volantini.orto") === "1",
  cerca: "", filtro: "tutti", chi: "tutti",
  bozza: null,           // il contatto in scrittura (passo 1)
  perche: 0,             // quale risposta del perché mostrare
  conferma: null,        // pulsante "tocca di nuovo per confermare"
  notaAperta: null, tappaAperta: null, odAperto: null, odModifica: null,
  appenaPiantato: null, cresciuta: null,
  piantine: ricordato("volantini.piantine") !== "0",   // Squadra: mostrare le piantine di ognuno
  daRidisegnare: false,
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

// ---------- aiutanti sui dati ----------
const imp = cid => ({ ...IMPOSTAZIONI_INIZIALI, ...(D.classe(cid)?.impostazioni || {}) });
const openDay = cid => [...(imp(cid).openDay || [])].sort((a, b) => a.quando.localeCompare(b.quando));
const openDayFuturi = cid => openDay(cid).filter(o => new Date(o.quando) > Date.now() - 6 * 3600000);
const odDi = (cid, id) => openDay(cid).find(o => o.id === id) || null;
const mio = r => r.user_id === D.io()?.id;
const modificabile = r => mio(r) || D.sonoCapo(r.classe_id);
const miei = cid => D.contatti(cid).filter(mio);
const nonInteressato = r => !!r.dati.nonInteressato;
const persone = r => Math.max(1, +r.dati.persone || 1);
const etichettaGruppo = r => persone(r) > 1 ? `1x${persone(r)}` : "";
const compagni = r => r.dati.gruppo ? D.contatti(r.classe_id).filter(x => x.id !== r.id && x.dati.gruppo === r.dati.gruppo) : [];
/** di dov'è la persona (testo libero; i contatti del primo giorno avevano anche una zona Roma/Lazio o fuori) */
const daDove = d => d.citta || { lazio: "Roma o Lazio", fuori: "Fuori dal Lazio" }[d.zona] || "";
const senzaAppunti = r => !r.dati.appuntiFatti && !r.dati.bisogno && !r.dati.motivazione && !r.dati.appunti && !r.dati.fascia;
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
let timerAvviso = null;
function avviso(testo, { annulla = false, icona = null } = {}) {
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
function barra({ titolo, sopra = "", indietro = null, destra = "" }) {
  return `<header class="barra">
    ${indietro ? `<button class="icona" data-vai="${esc(indietro)}" aria-label="Indietro">${ic("indietro")}</button>` : ""}
    <h1><span class="piccolo">${esc(sopra)}</span>${esc(titolo)}</h1>
    ${statoRete()}
    ${destra}
    <button class="icona" data-azione="annulla" aria-label="Annulla" ${D.puoiAnnullare() ? "" : "disabled"}>${ic("annulla")}</button>
  </header>`;
}
function schede(cid, attiva) {
  const s = [["miei", "persona", "I miei", ""], ["openday", "calendario", "Open day", "/openday"], ["squadra", "squadra", "Squadra", "/squadra"],
    ["diario", "diario", "Diario", "/diario"], ["classe", "impostazioni", "Classe", "/classe"]];
  return `<nav class="schede">${s.map(([k, i, t, h]) =>
    `<button class="${k === attiva ? "on" : ""}" data-vai="#/c/${cid}${h}">${ic(i)}${t}</button>`).join("")}</nav>`;
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
function disegnaMiei(cid) {
  const c = D.classe(cid);
  const lista = miei(cid);
  const daFare = lista.filter(r => !nonInteressato(r)).flatMap(r => tappeDaFare(r).filter(scaduta).map(t => ({ r, t })))
    .sort((a, b) => a.t.quando.localeCompare(b.t.quando));
  const dopo = lista.filter(r => !nonInteressato(r)).flatMap(r => tappeDaFare(r).filter(t => t.quando && !scaduta(t)).map(t => ({ r, t })))
    .sort((a, b) => a.t.quando.localeCompare(b.t.quando)).slice(0, 5);
  const n = conteggi(lista);
  const notifiche = statoNotifiche();
  const invitoNotifiche = !D.PROVA && notifiche === "da-attivare" && lista.some(r => tappeDaFare(r).some(t => t.quando))
    ? `<button class="striscia" data-azione="notifiche">${ic("campanella")}Attiva i promemoria sul telefono</button>` : "";

  let contenuto;
  if (U.vistaOrto) {
    const ordinati = [...lista].sort((a, b) => (nonInteressato(a) - nonInteressato(b)) || (stadio(b.dati) - stadio(a.dati)) || (b.dati.quando || "").localeCompare(a.dati.quando || ""));
    contenuto = `${contaStadi(n)}
      ${lista.length ? `<div class="orto">${ordinati.map(r => `<button data-vai="#/c/${cid}/k/${r.id}" class="${U.appenaPiantato === r.id ? "nuova" : ""}">${pianta(r)}<span>${esc((r.dati.nome || "?").split(" ")[0])}</span></button>`).join("")}</div>`
        : vuoto("Il tuo orto è vuoto: ogni contatto che prendi è un seme.")}
      <p class="tenue piccolo-testo legenda-stadi">${STADI.map((s, i) => `${mini(i)}${s.spiega}`).join(" → ")}</p>`;
  } else {
    const altri = [...lista].sort((a, b) => (nonInteressato(a) - nonInteressato(b)) || (b.dati.quando || "").localeCompare(a.dati.quando || ""));
    contenuto = `${daFare.length ? `<h3 class="sez">Da fare oggi · ${daFare.length}</h3>${daFare.map(x => cardContatto(x.r, { conTappa: x.t })).join("")}` : ""}
      ${dopo.length ? `<h3 class="sez">Prossimi promemoria</h3>${dopo.map(x => cardContatto(x.r, { conTappa: x.t })).join("")}` : ""}
      <h3 class="sez">Tutti · ${num(n.contatti, "contatto", "contatti")}${n.persone > n.contatti ? ` · ${n.persone} persone` : ""}</h3>
      ${altri.length ? altri.map(r => cardContatto(r)).join("") : vuoto("Ancora nessun contatto.<br>Tocca «Nuovo contatto» quando fermi qualcuno.")}`;
  }
  $app.innerHTML = `${barra({ titolo: "I miei contatti", sopra: c.nome, indietro: "#/" })}
    <div class="corpo con-grande">
      ${bannerPerche(cid)}
      ${invitoNotifiche}
      <div class="interruttore"><button class="${U.vistaOrto ? "" : "on"}" data-azione="vista-orto" data-v="0">${ic("lista")}Lista</button><button class="${U.vistaOrto ? "on" : ""}" data-azione="vista-orto" data-v="1">${ic("orto")}Il mio orto</button></div>
      ${contenuto}
    </div>
    <button class="grande" data-azione="nuovo" data-cid="${cid}">${ic("piu")}Nuovo contatto</button>
    ${schede(cid, "miei")}`;
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
      <label>Di dove sei? <span class="facolt">(facoltativo)</span><input data-bozza="citta" value="${esc(b.citta)}" autocomplete="off" autocapitalize="words" placeholder="es. Roma, Latina, Napoli"></label>
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
  if (!b.consenso) return err("Serve la spunta del consenso privacy.");
  const base = b.gruppoDi ? D.contatto(b.gruppoDi) : null;
  const id = uid();
  const dati = {
    nome: b.nome.trim(), telefono: b.telefono.trim(), email: b.email.trim(),
    openDay: null, quando: new Date().toISOString(), citta: b.citta.trim(),
    consenso: { quando: new Date().toISOString(), testo: imp(cid).privacy },
    traguardi: {}, tappe: imp(cid).tappe.map(t => ({ id: uid(), titolo: t, quando: null, fatta: null })),
    persone: base ? persone(base) : 1,
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
  vai(`#/c/${cid}/appunti/${id}`);
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
      ${arrivati.length ? `<h3 class="sez">Arrivati dal QR</h3>${arrivati.map(r => cardContatto(r)).join("")}` : `<p class="tenue piccolo-testo attesa">${ic("aggiorna", "gira")}In attesa: appena compila, il contatto compare qui.</p>`}
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
  const campo = (k, etichetta, segnaposto, righe = 2) =>
    `<label>${etichetta}<textarea data-appunto="${k}" rows="${righe}" placeholder="${esc(segnaposto)}">${esc(d[k] || "")}</textarea></label>`;
  $app.innerHTML = `${barra({ titolo: "I miei appunti", sopra: d.nome, indietro: `#/c/${cid}/k/${kid}` })}
    <div class="corpo modulo">
      ${U.appenaPiantato === kid ? `<div class="piantato">${pianta(r, "nuova")}<p><b>Seme piantato!</b><br>Ora che ${esc(d.nome.split(" ")[0])} se n'è andato/a, segnati cosa ti ha raccontato.</p></div>` : ""}
      <p class="tenue con-ic">${ic("lucchetto")}Solo per la squadra: la persona non li vede.</p>
      <span class="etichetta">Chi è</span>
      <div class="segm">${FASCE.map(f => `<button class="${d.fascia === f ? "on" : ""}" data-azione="appunto-scelta" data-k="fascia" data-v="${f}">${f}</button>`).join("")}</div>
      <div class="due">
        <label>Età<input data-appunto="eta" value="${esc(d.eta || "")}" inputmode="numeric" placeholder="—"></label>
        <div><span class="etichetta">Gruppo</span>
          <div class="contatore"><button data-azione="persone" data-d="-1" aria-label="Meno">−</button><b>1x${persone(r)}</b><button data-azione="persone" data-d="1" aria-label="Più">${ic("piu")}</button></div></div>
      </div>
      ${persone(r) > 1 ? campo("altri", "Chi altro c'era", "es. moglie Anna, figlio Luca 15 anni (liceo)", 2) : ""}
      ${campo("bisogno", "Bisogno", "Di cosa ha bisogno? Cosa gli/le serve nello studio?", 3)}
      ${campo("motivazione", "Perché vuole venire", "Perché vuole vedere l'open day / fare il corso?", 3)}
      <span class="etichetta">Interesse</span>
      <div class="segm">${[1, 2, 3].map(i => `<button class="${+d.interesse === i ? "on" : ""}" data-azione="appunto-scelta" data-k="interesse" data-v="${i}">${INTERESSE[i]}</button>`).join("")}</div>
      ${campo("appunti", "Altri appunti", "Com'è andata, cosa ti ha colpito…", 3)}
      <span class="etichetta">Open day prenotato</span>
      ${(() => {
        const ods = openDay(cid).filter(o => new Date(o.quando) > Date.now() - 6 * 3600000 || o.id === d.openDay);
        return ods.length ? `<div class="segm colonna">${ods.map(o => `<button class="${d.openDay === o.id ? "on" : ""}" data-azione="appunto-scelta" data-k="openDay" data-v="${o.id}">${esc(dataOd(o))}${o.luogo ? `<small>${esc(o.luogo)}</small>` : ""}</button>`).join("")}
          <button class="${!d.openDay ? "on" : ""}" data-azione="appunto-scelta" data-k="openDay" data-v="">Nessuno per ora</button></div>`
          : `<p class="tenue">Nessun open day in calendario. <button class="link" data-vai="#/c/${cid}/openday">Aggiungine uno</button></p>`;
      })()}
      <div class="riga-pulsanti">
        ${persone(r) > 1 ? `<button class="secondario con-ic" data-azione="stesso-gruppo" data-id="${kid}">${ic("piu")}Altro dello stesso gruppo</button>` : ""}
        <button class="primario" data-azione="fine-appunti" data-id="${kid}">Fatto</button>
      </div>
    </div>`;
}

// ---------- scheda del contatto ----------
function disegnaScheda(cid, kid) {
  const r = D.contatto(kid);
  if (!r || r.eliminato) return vai(`#/c/${cid}`);
  const d = r.dati, puoi = modificabile(r);
  const st = stadio(d);
  const tel = (d.telefono || "").replace(/[^\d+]/g, "");
  let wa = tel.replace(/^\+/, "").replace(/^00/, "");
  if (/^3\d{8,9}$/.test(wa)) wa = "39" + wa;
  const ods = openDay(cid);
  const od = odDi(cid, d.openDay);
  const comp = compagni(r);
  const tappe = d.tappe || [];
  const nota = (t, v) => v ? `<div class="nota"><b>${t}</b>${esc(v)}</div>` : "";
  const conf = U.conferma === "elimina-" + kid;
  const info = [daDove(d) && `<span>${ic("luogo")}${esc(daDove(d))}</span>`, d.fascia && `<span>${esc(d.fascia)}</span>`, d.eta && `<span>${esc(d.eta)} anni</span>`,
    d.interesse && `<span>interesse ${INTERESSE[d.interesse].toLowerCase()}</span>`,
    etichettaGruppo(r) && `<span>${ic("gruppo")}${etichettaGruppo(r)}</span>`, d.daQR && `<span>${ic("qr")}dal QR</span>`].filter(Boolean).join("");

  $app.innerHTML = `${barra({ titolo: d.nome || "Senza nome", sopra: `${mio(r) ? "preso da te" : "preso da " + D.nomeDi(cid, r.user_id)} · ${d.quando ? quandoBreve(d.quando) : ""}`, indietro: U.indietro || `#/c/${cid}` })}
    <div class="corpo scheda">
      <div class="testa">
        <div class="pianta-scheda ${U.cresciuta === kid || U.appenaPiantato === kid ? "nuova" : ""}">${pianta(r)}</div>
        <div>
          <p class="stadio">${nonInteressato(r) ? "Non interessato" : `${STADI[st].nome} · ${STADI[st].spiega}`}</p>
          <p class="info">${info}</p>
        </div>
      </div>
      <div class="azioni">
        ${tel ? `<a href="tel:${esc(tel)}">${ic("telefono")}Chiama</a><a href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">${ic("messaggio")}WhatsApp</a>` : ""}
        ${d.email ? `<a href="mailto:${esc(d.email)}">${ic("email")}Email</a>` : ""}
      </div>
      <p class="tenue recapito">${esc(d.telefono || "")}${d.telefono && d.email ? " · " : ""}${esc(d.email || "")}</p>

      <h3 class="sez">Come sta crescendo</h3>
      <div class="traguardi">${TRAGUARDI.map(t => `<button class="${d.traguardi?.[t.k] ? "on" : ""}" ${puoi ? `data-azione="traguardo" data-k="${t.k}"` : "disabled"}>${svgPianta(t.stadio)}<span>${t.testo}</span></button>`).join("")}</div>
      ${puoi ? `<button class="link piccolo-testo con-ic" data-azione="non-interessato">${ic(nonInteressato(r) ? "aggiorna" : "noMeno")}${nonInteressato(r) ? "È di nuovo interessato" : "Segna come non interessato"}</button>` : ""}

      <h3 class="sez">Open day</h3>
      ${puoi && ods.length ? `<select class="campo" data-azione-cambia="scegli-od">
          <option value="">— nessuno —</option>
          ${ods.map(o => `<option value="${o.id}" ${o.id === d.openDay ? "selected" : ""}>${esc(dataOd(o))}${o.luogo ? " · " + esc(o.luogo) : ""}</option>`).join("")}
        </select>` : `<p class="tenue">${od ? esc(dataOd(od)) + (od.luogo ? " · " + esc(od.luogo) : "") : ods.length ? "Nessun open day prenotato." : `Nessun open day in calendario. <button class="link" data-vai="#/c/${cid}/openday">Aggiungine uno</button>`}</p>`}

      <h3 class="sez">Tappe e promemoria</h3>
      <div class="tappe">${tappe.map(t => rigaTappa(r, t, puoi)).join("") || `<p class="tenue">Nessuna tappa.</p>`}</div>
      ${puoi ? `<form class="nuova-tappa" id="form-tappa"><input name="titolo" placeholder="Aggiungi tappa (es. Richiamare)" maxlength="80"><button class="chip-btn primario">Aggiungi</button></form>` : ""}

      <h3 class="sez">Appunti ${puoi ? `<button class="link con-ic" data-vai="#/c/${cid}/appunti/${kid}">${ic("matita")}modifica</button>` : ""}</h3>
      ${nota("Bisogno", d.bisogno)}${nota("Perché vuole venire", d.motivazione)}${nota("Chi altro c'era", d.altri)}${nota("Altri appunti", d.appunti)}
      ${senzaAppunti(r) ? `<p class="tenue">${puoi ? `Ancora nessun appunto. <button class="link" data-vai="#/c/${cid}/appunti/${kid}">Scrivili ora</button>` : "Nessun appunto."}</p>` : ""}
      ${comp.length || (puoi && persone(r) > 1) ? `<h3 class="sez">Stesso gruppo</h3>${comp.map(x => cardContatto(x)).join("")}
        ${puoi ? `<button class="secondario largo con-ic" data-azione="stesso-gruppo" data-id="${kid}">${ic("piu")}Altro contatto dello stesso gruppo</button>` : ""}` : ""}

      <p class="tenue piccolo-testo consenso-dato con-ic">${d.consenso ? `${ic("spunta")}Consenso privacy dato ${esc(quandoBreve(d.consenso.quando))}${d.daQR ? " (dal suo telefono)" : ""}` : "Consenso privacy non registrato"}</p>
      ${puoi ? `<div class="riga-pulsanti">
        <button class="secondario con-ic" data-vai="#/c/${cid}/modifica/${kid}">${ic("matita")}Nome e recapiti</button>
        <button class="pericolo con-ic ${conf ? "conferma" : ""}" data-azione="elimina" data-id="${kid}">${ic("cestino")}${conf ? "Tocca di nuovo per eliminare" : "Elimina"}</button></div>` : ""}
    </div>`;
  U.cresciuta = null;
}
function rigaTappa(r, t, puoi) {
  const aperta = U.tappaAperta === t.id;
  const od = odDi(r.classe_id, r.dati.openDay) || openDayFuturi(r.classe_id)[0];
  const scadenza = t.fatta ? `<span class="q tenue">fatta ${esc(quandoBreve(t.fatta))}</span>`
    : t.quando ? `<span class="q ${new Date(t.quando) < Date.now() ? "scade" : "oggi"}">${ic("campanella")}${esc(quandoBreve(t.quando))}</span>`
    : `<span class="q tenue">${puoi ? `${ic("campanella")}data` : ""}</span>`;
  return `<div class="tappa ${t.fatta ? "fatta" : ""}">
    <button class="cerchio" ${puoi ? `data-azione="tappa-fatta" data-t="${t.id}"` : "disabled"} aria-label="Fatta">${t.fatta ? ic("spunta") : ""}</button>
    <span class="t">${esc(t.titolo)}</span>
    <button class="q-btn" ${puoi ? `data-azione="tappa-apri" data-t="${t.id}"` : "disabled"}>${scadenza}</button>
  </div>
  ${aperta && puoi ? `<div class="tappa-opzioni">
      <input class="campo" data-tappa-titolo="${t.id}" value="${esc(t.titolo)}" maxlength="80">
      <div class="segm">
        <button data-azione="tappa-quando" data-t="${t.id}" data-q="${alle(0)}">oggi 18:00</button>
        <button data-azione="tappa-quando" data-t="${t.id}" data-q="${alle(1)}">domani 18:00</button>
        <button data-azione="tappa-quando" data-t="${t.id}" data-q="${alle(3)}">tra 3 giorni</button>
        <button data-azione="tappa-quando" data-t="${t.id}" data-q="${alle(7)}">tra una settimana</button>
        ${od ? `<button data-azione="tappa-quando" data-t="${t.id}" data-q="${(() => { const d = new Date(od.quando); d.setDate(d.getDate() - 1); d.setHours(18, 0, 0, 0); return d.toISOString(); })()}">giorno prima dell'open day</button>` : ""}
      </div>
      <label class="riga-input">Oppure scegli: <input type="datetime-local" class="campo" data-tappa-quando="${t.id}" value="${perInput(t.quando)}"></label>
      <div class="riga-pulsanti">
        ${t.quando ? `<button class="secondario" data-azione="tappa-quando" data-t="${t.id}" data-q="">Togli la data</button>` : ""}
        <button class="pericolo" data-azione="tappa-togli" data-t="${t.id}">Togli tappa</button>
        <button class="primario" data-azione="tappa-apri" data-t="">Fatto</button>
      </div>
    </div>` : ""}`;
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
      <label>Di dov'è<input data-appunto="citta" value="${esc(daDove(r.dati))}" autocapitalize="words"></label>
      <div class="riga-pulsanti"><button class="primario" data-vai="#/c/${cid}/k/${kid}">Fatto</button></div>
    </div>`;
}

// ---------- open day ----------
function disegnaOpenDay(cid) {
  const tutti = openDay(cid);
  const futuri = tutti.filter(o => new Date(o.quando) > Date.now() - 6 * 3600000), passati = tutti.filter(o => !futuri.includes(o)).reverse();
  const contatti = D.contatti(cid);
  const scheda = o => {
    const prenotati = contatti.filter(r => r.dati.openDay === o.id);
    const venuti = prenotati.filter(r => r.dati.traguardi?.openday).length;
    const aperto = U.odAperto === o.id, modifica = U.odModifica === o.id, conf = U.conferma === "od-" + o.id;
    return `<div class="od ${aperto ? "aperto" : ""}">
      <button class="od-testa" data-azione="od-apri" data-id="${o.id}">
        <span class="od-data"><b>${new Date(o.quando).getDate()}</b>${new Date(o.quando).toLocaleDateString("it-IT", { month: "short" })}</span>
        <span class="testo"><span class="nome">${esc(new Date(o.quando).toLocaleDateString("it-IT", { weekday: "long" }))} · ${ora(o.quando)}</span>
          <span class="sotto">${esc(o.luogo || "luogo da decidere")}</span></span>
        <span class="od-conta"><b>${prenotati.length}${o.posti ? "/" + o.posti : ""}</b>prenotati${venuti ? `<br>${venuti} venuti` : ""}</span>
      </button>
      ${modifica ? formOpenDay(cid, o) : aperto ? `<div class="od-corpo">
        ${o.note ? `<p class="tenue">${esc(o.note)}</p>` : ""}
        ${prenotati.length ? prenotati.map(r => `<div class="prenotato">
            <button class="testo" data-vai="#/c/${cid}/k/${r.id}"><span class="nome">${esc(r.dati.nome)}</span><span class="sotto">di ${esc(D.nomeDi(cid, r.user_id))}${etichettaGruppo(r) ? " · " + etichettaGruppo(r) : ""}</span></button>
            <button class="venuto ${r.dati.traguardi?.openday ? "on" : ""}" ${modificabile(r) ? `data-azione="venuto" data-id="${r.id}"` : "disabled"}>${r.dati.traguardi?.openday ? `${ic("spunta")}venuto` : "è venuto?"}</button>
          </div>`).join("") : `<p class="tenue">Ancora nessuno prenotato.</p>`}
        <div class="riga-pulsanti">
          <button class="pericolo con-ic ${conf ? "conferma" : ""}" data-azione="od-elimina" data-id="${o.id}">${ic("cestino")}${conf ? "Tocca di nuovo" : "Elimina"}</button>
          <button class="secondario con-ic" data-azione="od-modifica" data-id="${o.id}">${ic("matita")}Modifica</button>
        </div></div>` : ""}
    </div>`;
  };
  $app.innerHTML = `${barra({ titolo: "Open day", sopra: D.classe(cid).nome, indietro: "#/" })}
    <div class="corpo">
      <p class="tenue">Le date che la squadra sta organizzando. Tutti possono aggiungerle, spostarle e modificarle.</p>
      ${futuri.map(scheda).join("") || `<div class="vuoto"><p>Nessun open day in calendario.</p></div>`}
      ${U.odModifica === "nuovo" ? `<div class="od aperto">${formOpenDay(cid, null)}</div>` : `<button class="primario largo con-ic" data-azione="od-modifica" data-id="nuovo">${ic("piu")}Aggiungi open day</button>`}
      ${passati.length ? `<h3 class="sez">Già fatti</h3>${passati.map(scheda).join("")}` : ""}
    </div>
    ${schede(cid, "openday")}`;
}
function formOpenDay(cid, o) {
  return `<form class="modulo od-corpo" id="form-od" data-id="${o?.id || ""}">
    <label>Data e ora<input type="datetime-local" name="quando" class="campo" value="${perInput(o?.quando || alle(7, 18))}" required></label>
    <label>Luogo<input name="luogo" value="${esc(o?.luogo || "")}" placeholder="es. Sede LEARNIS, via…"></label>
    <div class="due"><label>Posti <span class="facolt">(facoltativo)</span><input name="posti" inputmode="numeric" value="${esc(o?.posti || "")}"></label><div></div></div>
    <label>Note<input name="note" value="${esc(o?.note || "")}" placeholder="es. portare i moduli d'iscrizione"></label>
    <div class="riga-pulsanti"><button type="button" class="secondario" data-azione="od-modifica" data-id="">Annulla</button><button class="primario">Salva</button></div>
  </form>`;
}

// ---------- squadra: tutta la squadra oppure una persona ----------
// Scelte dell'utente: niente classifica né barre tra persone (non vuole competizione); niente ripetizioni:
// i riquadri dicono solo contatti e persone, le barre dicono risposto / open day / iscritti (con le %).
const perc = (n, tot) => tot ? Math.round(n / tot * 100) : 0;
const riquadri = n => `<div class="numeri due-numeri"><div><b>${n.contatti}</b>${n.contatti === 1 ? "contatto" : "contatti"}</div><div><b>${n.persone}</b>${n.persone === 1 ? "persona raggiunta" : "persone raggiunte"}</div></div>`;
/** il percorso: quanti arrivano a ogni traguardo, sul totale dei numeri presi */
function percorso(n) {
  const tappe = [["Hanno risposto", n.risposto, 1], ["Venuti all'open day", n.openday, 2], ["Iscritti", n.iscritti, 3]];
  return `<h3 class="sez">Il percorso</h3><div class="imbuto">${tappe.map(([t, v, st]) => `<div class="imbuto-riga" title="${esc(t)}: ${v} su ${n.numeri}">
      <span class="imbuto-nome">${mini(st)}${t}</span>
      <span class="imbuto-barra"><i style="width:${Math.max(perc(v, n.numeri), v ? 2 : 0)}%"></i></span>
      <span class="imbuto-val"><b>${v}</b> · ${perc(v, n.numeri)}%</span></div>`).join("")}</div>
    ${n.ni ? `<p class="tenue piccolo-testo con-ic">${ic("noMeno")}${num(n.ni, "non interessato", "non interessati")}</p>` : ""}`;
}
function chiSono(lista) {
  const fasce = new Map();
  lista.forEach(r => { if (r.dati.fascia) fasce.set(r.dati.fascia, (fasce.get(r.dati.fascia) || 0) + 1); });
  return fasce.size ? `<h3 class="sez">Chi sono</h3><div class="fasce">${[...fasce].sort((a, b) => b[1] - a[1]).map(([f, v]) => `<span class="chip">${esc(f)} <b>${v}</b></span>`).join("")}</div>` : "";
}
/** le statistiche di UNA persona */
function statistichePersona(lista) {
  if (!lista.length) return vuoto("Ancora nessun contatto per questa persona.");
  const n = conteggi(lista);
  return `${riquadri(n)}${percorso(n)}${chiSono(lista)}`;
}
/** tutta la squadra: gli stessi numeri di tutti, poi una scheda per volantinatore (piantine accendibili) */
function statisticheSquadra(cid, tutti) {
  if (!tutti.length) return vuoto("Ancora nessun contatto nella squadra.");
  const io = D.io().id;
  const membri = D.membri(cid).map(m => ({ m, lista: tutti.filter(r => r.user_id === m.user_id) }))
    .map(x => ({ ...x, c: conteggi(x.lista) }))
    .sort((a, b) => a.m.nome.localeCompare(b.m.nome, "it"));
  const n = conteggi(tutti);
  return `${riquadri(n)}${percorso(n)}
    <div class="sez-riga"><h3 class="sez">Per volantinatore</h3>
      <button class="interruttore-piccolo ${U.piantine ? "on" : ""}" data-azione="piantine" role="switch" aria-checked="${U.piantine}"><i></i>Piantine</button></div>
    ${membri.map(x => `<button class="riga-membro" data-azione="scegli-chi" data-id="${x.m.user_id}">
      <span class="testo"><span class="nome">${esc(x.m.nome)}${x.m.user_id === io ? " (tu)" : ""}</span>
      <span class="sotto">${num(x.c.contatti, "contatto", "contatti")} · ${num(x.c.persone, "persona", "persone")} · ${num(x.c.iscritti, "iscritto", "iscritti")}</span>
      ${U.piantine && x.lista.length ? `<span class="mini-orto">${x.lista.map(r => pianta(r, "micro")).join("")}</span>` : ""}</span>
      ${ic("avanti", "freccia")}</button>`).join("")}
    ${chiSono(tutti)}`;
}
function disegnaSquadra(cid) {
  const tutti = D.contatti(cid);
  if (U.chi !== "tutti" && !D.membri(cid).some(m => m.user_id === U.chi)) U.chi = "tutti";
  const sel = U.chi === "tutti" ? tutti : tutti.filter(r => r.user_id === U.chi);
  const io = D.io().id;
  const altri = D.membri(cid).filter(m => m.user_id !== io).sort((a, b) => a.nome.localeCompare(b.nome, "it"));
  const scelte = [{ id: "tutti", nome: "Tutta la squadra" }, { id: io, nome: "Io" }, ...altri.map(m => ({ id: m.user_id, nome: m.nome }))];
  const filtri = { tutti: "Tutti", sentire: "Da sentire", risposto: "Risposto", openday: "Open day", iscritti: "Iscritti", ni: "Non interessati" };
  const passa = r => {
    const st = stadio(r.dati), ni = nonInteressato(r);
    if (U.filtro === "sentire" && (ni || st > 0)) return false;
    if (U.filtro === "risposto" && (ni || st < 1)) return false;
    if (U.filtro === "openday" && (ni || st < 2)) return false;
    if (U.filtro === "iscritti" && (ni || st < 3)) return false;
    if (U.filtro === "ni" && !ni) return false;
    const q = U.cerca.trim().toLowerCase();
    if (q && !`${r.dati.nome} ${r.dati.fascia} ${r.dati.telefono} ${r.dati.email} ${r.dati.citta}`.toLowerCase().includes(q)) return false;
    return true;
  };
  const lista = sel.filter(passa).sort((a, b) => (b.dati.quando || "").localeCompare(a.dati.quando || ""));
  const di = U.chi === "tutti" ? "della squadra" : U.chi === io ? "tuoi" : "di " + D.nomeDi(cid, U.chi);   // «Contatti della squadra / I tuoi contatti / Contatti di Chiara»
  $app.innerHTML = `${barra({ titolo: "Squadra", sopra: D.classe(cid).nome, indietro: "#/",
      destra: `<button class="icona" data-azione="esporta" aria-label="Esporta i contatti (CSV)" title="Esporta i contatti (CSV)">${ic("esporta")}</button>` })}
    <div class="corpo">
      <div class="segm scorre">${scelte.map(p => `<button class="${U.chi === p.id ? "on" : ""}" data-azione="scegli-chi" data-id="${p.id}">${esc(p.nome)}</button>`).join("")}</div>
      ${U.chi === "tutti" ? statisticheSquadra(cid, tutti) : statistichePersona(sel)}
      <h3 class="sez">${U.chi === io ? "I tuoi contatti" : "Contatti " + esc(di)} · ${sel.length}</h3>
      <input class="campo cerca" type="search" placeholder="Cerca nome, telefono, città…" value="${esc(U.cerca)}" data-cerca>
      <div class="segm scorre">${Object.entries(filtri).map(([k, t]) => `<button class="${U.filtro === k ? "on" : ""}" data-azione="filtro" data-f="${k}">${t}</button>`).join("")}</div>
      <div id="lista-squadra">${lista.map(r => cardContatto(r, { conChi: U.chi === "tutti" })).join("") || `<p class="tenue">Nessun contatto.</p>`}</div>
      <button class="secondario largo con-ic" data-azione="esporta">${ic("esporta")}Esporta ${U.chi === io ? "i tuoi contatti" : "i contatti " + esc(di)} (CSV)</button>
    </div>
    ${schede(cid, "squadra")}`;
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
    ["Bisogno", r => r.dati.bisogno], ["Perché vuole venire", r => r.dati.motivazione], ["Interesse", r => INTERESSE[r.dati.interesse] || ""],
    ["Appunti", r => r.dati.appunti], ["Open day prenotato", r => { const o = odDi(cid, r.dati.openDay); return o ? dataOd(o) : ""; }],
    ["Stato", r => nonInteressato(r) ? "Non interessato" : STADI[stadio(r.dati)].spiega],
    ["Ha risposto", r => data(r.dati.traguardi?.risposto)], ["Venuto all'open day", r => data(r.dati.traguardi?.openday)], ["Iscritto", r => data(r.dati.traguardi?.iscritto)],
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
function disegnaDiario(cid) {
  const note = D.elencoP(`diario:${cid}:`).map(([k, v]) => ({ k, ...v })).sort((a, b) => b.quando.localeCompare(a.quando));
  const spunto = SPUNTI[new Date().getDate() % SPUNTI.length];
  const sceltaUmori = (attivo, azione, k = "") => UMORI.map(u => `<button type="button" class="${attivo === u.k ? "on" : ""}" data-azione="${azione}" data-u="${u.k}"${k ? ` data-k="${esc(k)}"` : ""}>${ic(u.k)}${u.testo}</button>`).join("");
  let giorno = "", righe = "";
  for (const n of note) {
    const g = giornoLungo(n.quando);
    if (g !== giorno) { righe += `<h3 class="sez">${esc(g)}</h3>`; giorno = g; }
    const aperta = U.notaAperta === n.k, conf = U.conferma === "nota-" + n.k, u = umore(n.umore);
    righe += aperta ? `<div class="nota aperta">
        <b>${ora(n.quando)}</b>
        <div class="segm umori">${sceltaUmori(u?.k, "nota-umore", n.k)}</div>
        <textarea class="campo" rows="4" data-nota="${esc(n.k)}">${esc(n.testo)}</textarea>
        <div class="riga-pulsanti"><button class="pericolo con-ic ${conf ? "conferma" : ""}" data-azione="nota-elimina" data-k="${esc(n.k)}">${ic("cestino")}${conf ? "Tocca di nuovo" : "Elimina"}</button><button class="primario" data-azione="nota-apri" data-k="">Fatto</button></div>
      </div>`
      : `<button class="nota" data-azione="nota-apri" data-k="${esc(n.k)}"><b>${ora(n.quando)}${u ? ` · ${ic(u.k)}${u.testo}` : ""}</b>${esc(n.testo)}</button>`;
  }
  $app.innerHTML = `${barra({ titolo: "Diario di bordo", sopra: D.classe(cid).nome, indietro: "#/" })}
    <div class="corpo">
      <form id="form-diario" class="scrivi-diario">
        <textarea class="campo" name="testo" rows="3" placeholder="${esc(spunto)}"></textarea>
        <div class="segm umori">${sceltaUmori(U.umore, "umore")}</div>
        <button class="primario largo">Scrivi nel diario</button>
      </form>
      <p class="tenue piccolo-testo con-ic">${ic("lucchetto")}Il diario lo vedi solo tu.</p>
      ${righe || `<div class="vuoto"><p>Qui puoi segnare pensieri, cosa succede, cosa impari mentre volantini.</p></div>`}
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
      ${lista("tappe", "Tappe predefinite", "Ogni nuovo contatto parte con queste tappe; poi le cambi persona per persona." + (capo ? "" : " Le decide chi ha creato la classe."))}
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
function disegna() {
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
  if (["miei", "squadra", "openday"].includes(R.vista)) U.indietro = location.hash;
  switch (R.vista) {
    case "miei": return disegnaMiei(R.cid);
    case "openday": return disegnaOpenDay(R.cid);
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
document.addEventListener("focusout", () => setTimeout(() => {
  if (U.daRidisegnare && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) ridisegnaQuandoPuoi();
}, 50));

addEventListener("hashchange", () => { U.conferma = null; U.tappaAperta = null; U.notaAperta = null; disegna(); });

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
function cambiaTappa(r, tid, cambi) {
  salvaDati(r, { tappe: (r.dati.tappe || []).map(t => t.id === tid ? { ...t, ...cambi } : t) });
}
async function salvaImp(cid, cambi) {
  try { await D.aggiornaClasse(cid, { impostazioni: { ...D.classe(cid).impostazioni, ...cambi } }); }
  catch (e) { errore(e); }
}

$app.addEventListener("click", async e => {
  const el = e.target.closest("[data-vai], [data-azione]");
  if (!el || el.disabled) return;
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
      case "vista-orto": U.vistaOrto = el.dataset.v === "1"; ricorda("volantini.orto", U.vistaOrto ? "1" : "0"); disegna(); break;
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

      // appunti
      case "appunto-scelta": {
        const v = el.dataset.k === "interesse" ? +el.dataset.v : el.dataset.v;
        salvaDati(r, { [el.dataset.k]: r.dati[el.dataset.k] === v ? null : v });
        ridisegnaQuandoPuoi(); break;
      }
      case "persone": {
        const n = Math.max(1, Math.min(30, persone(r) + +el.dataset.d));
        // tutti i contatti dello stesso gruppo hanno lo stesso 1xN (un solo passo da annullare)
        const gruppo = r.dati.gruppo || (n > 1 ? r.id : null);
        salvaDati(r, { persone: n, gruppo });
        compagni({ ...r, dati: { ...r.dati, gruppo } }).forEach(x => salvaDati(x, { persone: n }));
        ridisegnaQuandoPuoi(); break;
      }
      case "fine-appunti":
        salvaDati(r, { appuntiFatti: true });
        vai(`#/c/${cid}/k/${r.id}`); break;

      // scheda
      case "traguardo": {
        const prima = stadio(r.dati);
        const tr = { ...(r.dati.traguardi || {}) };
        tr[el.dataset.k] = tr[el.dataset.k] ? null : new Date().toISOString();
        salvaDati(r, { traguardi: tr });
        const dopo = stadio({ traguardi: tr });
        if (dopo > prima) { U.cresciuta = r.id; avviso(["", "È spuntato un germoglio!", "La piantina cresce!", "È fiorita! Benvenuto/a nel corso!"][dopo], { annulla: true, icona: "orto" }); }
        ridisegnaQuandoPuoi(); break;
      }
      case "non-interessato": salvaDati(r, { nonInteressato: !r.dati.nonInteressato }); avviso(r.dati.nonInteressato ? "La piantina si risveglia" : "Segnato come non interessato: i promemoria si fermano", { annulla: true, icona: r.dati.nonInteressato ? "orto" : "noMeno" }); ridisegnaQuandoPuoi(); break;
      case "tappa-fatta": {
        const t = r.dati.tappe.find(x => x.id === el.dataset.t);
        cambiaTappa(r, t.id, { fatta: t.fatta ? null : new Date().toISOString() });
        if (!t.fatta) avviso("Tappa fatta: piantina annaffiata", { annulla: true, icona: "spunta" });
        ridisegnaQuandoPuoi(); break;
      }
      case "tappa-apri": U.tappaAperta = U.tappaAperta === el.dataset.t ? null : el.dataset.t || null; ridisegnaQuandoPuoi(); break;
      case "tappa-quando":
        cambiaTappa(r, el.dataset.t, { quando: el.dataset.q || null });
        if (el.dataset.q) avviso(`Promemoria ${quandoBreve(el.dataset.q)}`, { icona: "campanella" });
        U.tappaAperta = null; ridisegnaQuandoPuoi(); break;
      case "tappa-togli": salvaDati(r, { tappe: r.dati.tappe.filter(t => t.id !== el.dataset.t) }); U.tappaAperta = null; avviso("Tappa tolta", { annulla: true }); ridisegnaQuandoPuoi(); break;
      case "elimina":
        if (!confermaDue("elimina-" + r.id)) break;
        D.salvaContatto({ ...r, eliminato: true });
        avviso("Contatto eliminato", { annulla: true, icona: "cestino" });
        vai(`#/c/${cid}`); break;

      // open day
      case "od-apri": U.odAperto = U.odAperto === el.dataset.id ? null : el.dataset.id; U.odModifica = null; ridisegnaQuandoPuoi(); break;
      case "od-modifica": U.odModifica = el.dataset.id || null; if (el.dataset.id && el.dataset.id !== "nuovo") U.odAperto = el.dataset.id; ridisegnaQuandoPuoi(); break;
      case "od-elimina":
        if (!confermaDue("od-" + el.dataset.id)) break;
        await D.salvaOpenDay(cid, (imp(cid).openDay || []).filter(o => o.id !== el.dataset.id));
        avviso("Open day eliminato", { icona: "cestino" }); ridisegnaQuandoPuoi(); break;
      case "venuto": {
        const x = D.contatto(el.dataset.id);
        const tr = { ...(x.dati.traguardi || {}) };
        tr.openday = tr.openday ? null : new Date().toISOString();
        salvaDati(x, { traguardi: tr });
        if (tr.openday) avviso("La piantina di " + x.dati.nome.split(" ")[0] + " cresce!", { annulla: true, icona: "orto" });
        ridisegnaQuandoPuoi(); break;
      }

      // squadra
      case "scegli-chi": U.chi = el.dataset.id; disegna(); corpo().scrollTop = 0; break;
      case "piantine": U.piantine = !U.piantine; ricorda("volantini.piantine", U.piantine ? "1" : "0"); ridisegnaQuandoPuoi(); break;
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
$avviso.addEventListener("click", e => { if (e.target.closest('[data-azione="annulla"]')) { D.annulla(); $avviso.hidden = true; } });

// scrivere nei campi
$app.addEventListener("input", e => {
  const el = e.target, R = rotta(), cid = R.cid;
  if (el.dataset.bozza) { U.bozza[el.dataset.bozza] = el.value; return; }
  if (el.dataset.appunto) { const r = contattoAperto(); salvaDati(r, { [el.dataset.appunto]: el.value }, { unisci: true }); return; }
  if (el.dataset.perche) {
    const risposte = [...perche(cid)];
    risposte[+el.dataset.perche] = el.value;
    D.scriviP("perche:" + cid, { risposte }, { unisci: true });
    return;
  }
  if (el.dataset.nota) { const n = D.leggiP(el.dataset.nota); D.scriviP(el.dataset.nota, { ...n, testo: el.value }, { unisci: true }); return; }
  if (el.dataset.tappaTitolo) { const r = contattoAperto(); D.salvaContatto({ ...r, dati: { ...r.dati, tappe: r.dati.tappe.map(t => t.id === el.dataset.tappaTitolo ? { ...t, titolo: el.value } : t) } }, { unisci: true }); return; }
  if ("cerca" in el.dataset) {
    U.cerca = el.value;
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
    if (el.dataset.tappaQuando) { const r = contattoAperto(); cambiaTappa(r, el.dataset.tappaQuando, { quando: daInput(el.value) }); if (el.value) avviso(`Promemoria ${quandoBreve(daInput(el.value))}`, { icona: "campanella" }); U.tappaAperta = null; ridisegnaQuandoPuoi(); }
    if (el.dataset.azioneCambia === "scegli-od") { const r = contattoAperto(); salvaDati(r, { openDay: el.value || null }); avviso("Open day aggiornato", { annulla: true, icona: "calendario" }); }
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
      const r = contattoAperto();
      salvaDati(r, { tappe: [...(r.dati.tappe || []), { id: uid(), titolo: v.titolo.trim(), quando: null, fatta: null }] });
      U.tappaAperta = D.contatto(r.id).dati.tappe.at(-1).id;   // apro subito la nuova tappa per scegliere quando
      ridisegnaQuandoPuoi();
    }
    if (f.id === "form-od") {
      const lista = [...(imp(cid).openDay || [])];
      const o = { id: f.dataset.id || uid(), quando: daInput(v.quando), luogo: v.luogo.trim(), posti: +v.posti || null, note: v.note.trim() };
      const i = lista.findIndex(x => x.id === o.id);
      if (i >= 0) lista[i] = o; else lista.push(o);
      bottone.disabled = true;
      await D.salvaOpenDay(cid, lista);
      U.odModifica = null; U.odAperto = o.id;
      avviso("Open day salvato", { icona: "calendario" }); ridisegnaQuandoPuoi();
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
D.suCambio(ridisegnaQuandoPuoi);
D.suStato(() => { const r = document.querySelector(".barra .rete"); const nuovo = statoRete(); if (r) r.outerHTML = nuovo || "<span class='rete'></span>"; else if (nuovo) ridisegnaQuandoPuoi(); });
D.suRegistro(() => { const b = document.querySelector('.barra [data-azione="annulla"]'); if (b) b.disabled = !D.puoiAnnullare(); });
if ("serviceWorker" in navigator && !location.hostname.match(/^(localhost|127\.)/)) navigator.serviceWorker.register("sw.js").catch(() => {});

(async () => {
  const R = rotta();
  if (R.vista === "entra" && R.codice) ricorda("volantini.codice", R.codice);
  const dentro = await D.avvia().catch(() => false);
  pronto = true;
  if (dentro) dopoAccesso(); else disegna();
})();
