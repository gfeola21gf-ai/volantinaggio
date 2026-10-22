/* dati.js — dove stanno i dati.
   Tutto è salvato SUBITO sul telefono (localStorage) e poi mandato a Supabase,
   così l'app funziona anche in strada senza rete. Ogni 20 secondi (e quando torni
   sull'app) scarica le novità della squadra.

   Tre tipi di dati:
   • classi e membri  → piccoli: si riscaricano interi a ogni giro (crearli/entrarci richiede la rete);
   • contatti         → righe di volantini_contatti (chiave "k:<id>"), visibili alla classe;
   • privato          → "cassetti" chiave → valore solo miei (chiave "p:<chiave>"): perche:<classe>, diario:<classe>:<id>.
   valore null = eliminato. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";
import { SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA } from "./config.js";
import { datiDiProva } from "./prova.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA);

/** ?prova nell'indirizzo = modalità prova: niente account, dati finti solo su questo dispositivo */
export const PROVA = new URLSearchParams(location.search).has("prova");

let utente = null;
let S = vuoto();             // tutto ciò che è salvato sul telefono
let stato = "ok";            // ok | invio | offline
const suCambi = new Set(), suStati = new Set();

function vuoto() {
  return { classi: [], membri: [], k: {}, p: {}, inAttesa: [], ultimoK: null, ultimoP: null };
}
const cassetto = () => PROVA ? "volantini.prova" : "volantini." + utente?.id;
let inAttesa = new Set();

function salvaLocale() {
  S.inAttesa = [...inAttesa];
  try { localStorage.setItem(cassetto(), JSON.stringify(S)); } catch { /* spazio pieno o navigazione privata */ }
}
function caricaLocale() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(cassetto()) || "null"); } catch { /* niente */ }
  S = Object.assign(vuoto(), d || {});
  if (PROVA && !d) S = Object.assign(vuoto(), datiDiProva());
  inAttesa = new Set(S.inAttesa);
}
function cambiaStato(s) {
  if (s === stato) return;
  stato = s;
  suStati.forEach(f => f(s));
}
const avvisaCambi = () => suCambi.forEach(f => f());

// ---------- leggere ----------
export const io = () => PROVA ? { id: "io", email: "prova@esempio.it" } : utente;
export const classi = () => S.classi;
export const classe = id => S.classi.find(c => c.id === id) || null;
export const membri = classeId => S.membri.filter(m => m.classe_id === classeId);
export const nomeDi = (classeId, userId) => membri(classeId).find(m => m.user_id === userId)?.nome || "?";
export const sonoCapo = classeId => classe(classeId)?.creata_da === io()?.id;
/** la mia chiave per il QR in questa classe (il modulo pubblico la usa per sapere a chi va il contatto) */
export const miaChiaveQR = classeId => membri(classeId).find(m => m.user_id === io()?.id)?.chiave_qr || null;
export const contatto = id => S.k[id] || null;
export const contatti = classeId => Object.values(S.k).filter(r => r && r.classe_id === classeId && !r.eliminato);
export const leggiP = chiave => S.p[chiave] ?? null;
export const elencoP = prefisso => Object.entries(S.p).filter(([k, v]) => v != null && k.startsWith(prefisso));
export const inSospeso = () => inAttesa.size;

// ---------- scrivere (contatti e privato: offline, annullabili) ----------
function metti(chiave, valore) {
  const [tipo, ...resto] = chiave.split(":");
  const k = resto.join(":");
  if (tipo === "k") S.k[k] = valore; else S.p[k] = valore ?? null;
}
function prendi(chiave) {
  const [tipo, ...resto] = chiave.split(":");
  const k = resto.join(":");
  return tipo === "k" ? S.k[k] : S.p[k];
}
function scrivi(chiave, valore, unisci) {
  if (registro) ricordaPrima(chiave, unisci);
  metti(chiave, copia(valore));
  inAttesa.add(chiave);
  salvaLocale();
  programmaInvio();
}
/** salva un contatto intero: { id, classe_id, user_id, dati, eliminato } */
export function salvaContatto(riga, { unisci = false } = {}) {
  scrivi("k:" + riga.id, { ...riga, aggiornato_il: new Date().toISOString() }, unisci ? "k:" + riga.id : null);
}
export function scriviP(chiave, valore, { unisci = false } = {}) {
  scrivi("p:" + chiave, valore, unisci ? "p:" + chiave : null);
}

// ---------- annulla / ripeti (⌘Z, ⇧⌘Z, freccetta ↶) ----------
// Un "passo" = le scritture fatte nello stesso istante. Le lettere scritte nella stessa casella
// si uniscono in un passo solo (fino a 2 secondi di pausa).
const annullabili = [], ripetibili = [], suRegistri = new Set();
let registro = true, passo = null;
const copia = v => v == null ? null : JSON.parse(JSON.stringify(v));
function ricordaPrima(chiave, unisci) {
  const ultimo = annullabili[annullabili.length - 1], ora = Date.now();
  if (!passo && unisci && ultimo?.unisci === unisci && ora - ultimo.quando < 2000) { ultimo.quando = ora; return; }
  if (!passo) {
    passo = { prima: {}, quando: ora, unisci };
    annullabili.push(passo);
    if (annullabili.length > 100) annullabili.shift();
    ripetibili.length = 0;
    setTimeout(() => { passo = null; suRegistri.forEach(f => f()); }, 0);
  }
  if (!(chiave in passo.prima)) passo.prima[chiave] = copia(prendi(chiave));
}
function applicaPasso(da, verso) {
  const p = da.pop();
  if (!p) return false;
  const opposto = { prima: {}, quando: Date.now(), unisci: null };
  registro = false;
  for (const [k, v] of Object.entries(p.prima)) {
    opposto.prima[k] = copia(prendi(k));
    // un contatto appena creato, annullato = eliminato (sul server resta la riga, segnata come eliminata)
    if (k.startsWith("k:") && v == null) scrivi(k, { ...prendi(k), eliminato: true });
    else scrivi(k, v);
  }
  registro = true;
  verso.push(opposto);
  suRegistri.forEach(f => f());
  avvisaCambi();
  return true;
}
export const annulla = () => applicaPasso(annullabili, ripetibili);
export const ripeti = () => applicaPasso(ripetibili, annullabili);
export const puoiAnnullare = () => annullabili.length > 0;
export const suRegistro = f => suRegistri.add(f);

export const statoSync = () => stato;
export const suCambio = f => suCambi.add(f);   // chiamata quando arrivano novità dalla squadra
export const suStato = f => suStati.add(f);

// ---------- sincronizzazione con Supabase ----------
let timerInvio = null, inCorso = false, ancora = false;
function programmaInvio(ms = 800) {
  if (PROVA || !utente) return;
  cambiaStato("invio");
  clearTimeout(timerInvio);
  timerInvio = setTimeout(sincronizza, ms);
}

async function invia() {
  if (!inAttesa.size) return true;
  const chiaviDaInviare = [...inAttesa];
  const foto = chiaviDaInviare.map(k => JSON.stringify(prendi(k) ?? null));   // "fotografia" di ciò che mando
  const contattiDaInviare = [], privatiDaInviare = [];
  chiaviDaInviare.forEach((k, i) => {
    const v = JSON.parse(foto[i]);
    if (k.startsWith("k:")) {
      if (v) contattiDaInviare.push({ id: v.id, classe_id: v.classe_id, dati: v.dati, eliminato: !!v.eliminato });
    } else privatiDaInviare.push({ user_id: utente.id, chiave: k.slice(2), valore: v });
  });
  let ok = true;
  // i contatti uno per uno: se uno viene rifiutato (es. classe lasciata) gli altri passano lo stesso
  const rifiutati = new Set();
  for (const r of contattiDaInviare) {
    const { error } = await sb.from("volantini_contatti").upsert(r, { onConflict: "id" });
    if (error) {
      console.warn("Contatto non inviato:", error.message);
      if (/row-level security|violates/i.test(error.message)) rifiutati.add("k:" + r.id); else ok = false;
    }
  }
  if (privatiDaInviare.length) {
    const { error } = await sb.from("volantini_privato").upsert(privatiDaInviare, { onConflict: "user_id,chiave" });
    if (error) { console.warn("Invio non riuscito:", error.message); ok = false; privatiDaInviare.length = 0; }
  }
  // tolgo dall'attesa solo ciò che è arrivato e non è cambiato mentre inviavo
  chiaviDaInviare.forEach((k, i) => {
    const arrivato = k.startsWith("k:") ? ok || rifiutati.has(k) : privatiDaInviare.length > 0;
    if ((arrivato || rifiutati.has(k)) && JSON.stringify(prendi(k) ?? null) === foto[i]) inAttesa.delete(k);
  });
  salvaLocale();
  return ok;
}

const indietro = t => t ? new Date(new Date(t).getTime() - 15000).toISOString() : null;   // 15 s di margine

async function scaricaClassi() {
  const [c, m] = await Promise.all([
    sb.from("volantini_classi").select("id, nome, codice, creata_da, impostazioni, aggiornato_il").order("creata_il"),
    sb.from("volantini_membri").select("classe_id, user_id, nome, entrato_il, chiave_qr").order("entrato_il"),
  ]);
  if (c.error || m.error) { console.warn("Classi non scaricate:", (c.error || m.error).message); return false; }
  const prima = new Set(S.classi.map(x => x.id));
  const nuova = c.data.some(x => !prima.has(x.id));
  const cambiato = JSON.stringify([S.classi, S.membri]) !== JSON.stringify([c.data, m.data]);
  S.classi = c.data;
  S.membri = m.data;
  if (nuova) S.ultimoK = null;   // classe nuova: riscarico tutti i contatti (anche quelli vecchi della squadra)
  return cambiato ? "cambiato" : true;
}

async function scaricaRighe(tabella, campi, campoUltimo, applica) {
  let cambiato = false;
  for (let giro = 0; giro < 40; giro++) {
    let q = sb.from(tabella).select(campi).order("aggiornato_il").limit(500);
    if (S[campoUltimo]) q = q.gt("aggiornato_il", indietro(S[campoUltimo]));
    const { data, error } = await q;
    if (error) { console.warn("Download non riuscito:", error.message); return null; }
    for (const r of data) if (applica(r)) cambiato = true;
    const fine = data.length < 500;
    if (data.length) S[campoUltimo] = data[data.length - 1].aggiornato_il;
    if (fine) break;
  }
  return cambiato;
}

async function scarica() {
  const c = await scaricaClassi();
  if (!c) return false;
  const k = await scaricaRighe("volantini_contatti", "id, classe_id, user_id, dati, eliminato, aggiornato_il", "ultimoK", r => {
    if (inAttesa.has("k:" + r.id)) return false;   // qui c'è una versione più nuova, non ancora inviata
    if (JSON.stringify(S.k[r.id] ?? null) === JSON.stringify(r)) return false;
    S.k[r.id] = r;
    return true;
  });
  const p = await scaricaRighe("volantini_privato", "chiave, valore, aggiornato_il", "ultimoP", r => {
    if (inAttesa.has("p:" + r.chiave)) return false;
    if (JSON.stringify(S.p[r.chiave] ?? null) === JSON.stringify(r.valore ?? null)) return false;
    S.p[r.chiave] = r.valore;
    return true;
  });
  // contatti di classi che non sono più mie: via dal telefono
  const mie = new Set(S.classi.map(x => x.id));
  for (const [id, r] of Object.entries(S.k)) if (r && !mie.has(r.classe_id) && !inAttesa.has("k:" + id)) delete S.k[id];
  salvaLocale();
  if (k === null || p === null) return false;
  if (c === "cambiato" || k || p) avvisaCambi();
  return true;
}

export async function sincronizza() {
  if (PROVA || !utente) return;
  if (inCorso) { ancora = true; return; }
  inCorso = true;
  clearTimeout(timerInvio);
  try {
    const ok = (await invia()) && (await scarica());
    if (inAttesa.size && ok) programmaInvio(300);
    else cambiaStato(ok ? "ok" : "offline");
    if (!ok) { clearTimeout(timerInvio); timerInvio = setTimeout(sincronizza, 15000); }
  } catch (e) {
    console.warn(e);
    cambiaStato("offline");
  } finally {
    inCorso = false;
    if (ancora) { ancora = false; programmaInvio(100); }
  }
}

// ---------- classi (servono la rete) ----------
function erroreChiaro(error) {
  const m = error?.message || String(error);
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error("Serve la connessione a internet per questa operazione.");
  return new Error(m);
}

export async function creaClasse(nome, mioNome, impostazioni) {
  if (PROVA) {
    const id = crypto.randomUUID();
    S.classi.push({ id, nome, codice: "LM-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0"), creata_da: "io", impostazioni });
    S.membri.push({ classe_id: id, user_id: "io", nome: mioNome });
    salvaLocale(); avvisaCambi();
    return id;
  }
  const { data, error } = await sb.rpc("volantini_crea_classe", { p_nome: nome, p_mio_nome: mioNome, p_impostazioni: impostazioni });
  if (error) throw erroreChiaro(error);
  await sincronizza();
  return data;
}

export async function entra(codice, mioNome) {
  if (PROVA) {
    const c = S.classi.find(x => x.codice === codice.trim().toUpperCase());
    if (!c) throw new Error("Codice non trovato (in prova funziona solo il codice di una classe di prova).");
    return c.id;
  }
  const { data, error } = await sb.rpc("volantini_entra", { p_codice: codice, p_mio_nome: mioNome });
  if (error) throw erroreChiaro(error.message.includes("Codice non trovato") ? new Error("Codice non trovato: controlla di averlo scritto bene.") : error);
  await sincronizza();
  return data;
}

export async function aggiornaClasse(id, cambi) {
  const c = classe(id);
  if (!c) return;
  if (PROVA) { Object.assign(c, cambi); salvaLocale(); avvisaCambi(); return; }
  const { error } = await sb.from("volantini_classi").update(cambi).eq("id", id);
  if (error) throw erroreChiaro(error);
  Object.assign(c, cambi);
  salvaLocale(); avvisaCambi();
}

/** salva l'elenco degli open day (lo può fare ogni membro della classe) */
export async function salvaOpenDay(id, lista) {
  const c = classe(id);
  if (!c) return;
  if (!PROVA) {
    const { error } = await sb.rpc("volantini_salva_openday", { c: id, lista });
    if (error) throw erroreChiaro(error);
  }
  c.impostazioni = { ...c.impostazioni, openDay: lista };
  salvaLocale(); avvisaCambi();
}

export async function nuovoCodice(id) {
  if (PROVA) { classe(id).codice = "LM-" + String(Math.floor(Math.random() * 10000)).padStart(4, "0"); salvaLocale(); avvisaCambi(); return; }
  const { data, error } = await sb.rpc("volantini_nuovo_codice", { c: id });
  if (error) throw erroreChiaro(error);
  classe(id).codice = data;
  salvaLocale(); avvisaCambi();
}

export async function rinominami(classeId, nome) {
  const m = membri(classeId).find(x => x.user_id === io().id);
  if (!m) return;
  if (!PROVA) {
    const { error } = await sb.from("volantini_membri").update({ nome }).eq("classe_id", classeId).eq("user_id", io().id);
    if (error) throw erroreChiaro(error);
  }
  m.nome = nome;
  salvaLocale(); avvisaCambi();
}

/** togli un membro (o esci tu, se userId è il tuo) */
export async function togliMembro(classeId, userId) {
  if (!PROVA) {
    const { error } = await sb.from("volantini_membri").delete().eq("classe_id", classeId).eq("user_id", userId);
    if (error) throw erroreChiaro(error);
  }
  S.membri = S.membri.filter(m => !(m.classe_id === classeId && m.user_id === userId));
  if (userId === io().id) S.classi = S.classi.filter(c => c.id !== classeId);
  salvaLocale(); avvisaCambi();
}

export async function eliminaClasse(id) {
  if (!PROVA) {
    const { error } = await sb.from("volantini_classi").delete().eq("id", id);
    if (error) throw erroreChiaro(error);
  }
  S.classi = S.classi.filter(c => c.id !== id);
  S.membri = S.membri.filter(m => m.classe_id !== id);
  salvaLocale(); avvisaCambi();
}

// ---------- account ----------
/** all'apertura: true se si può entrare (account già collegato o modalità prova) */
export async function avvia() {
  if (PROVA) { caricaLocale(); return true; }
  const { data } = await sb.auth.getSession();
  utente = data.session?.user || null;
  if (!utente) return false;
  caricaLocale();
  sincronizza();   // non aspetto: si apre subito con i dati del telefono, le novità arrivano dopo
  return true;
}

export async function accedi(email, password, nuovo = false) {
  const { data, error } = nuovo
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (/Invalid login/i.test(error.message)) throw new Error("Email o password sbagliate.");
    if (/already registered/i.test(error.message)) throw new Error("Questa email ha già un account: usa «Accedi».");
    if (/Signups not allowed/i.test(error.message)) throw new Error("Le registrazioni sono chiuse: chiedi a chi organizza.");
    if (/at least 6/i.test(error.message)) throw new Error("La password deve avere almeno 6 caratteri.");
    throw erroreChiaro(error);
  }
  if (!data.session) throw new Error("Controlla la posta: c'è un'email per confermare l'account, poi accedi.");
  utente = data.session.user;
  caricaLocale();
  await sincronizza();
}

export async function esci() {
  await sincronizza();
  await sb.auth.signOut();
  utente = null;
  S = vuoto();
  inAttesa = new Set();
}

// controlli periodici: ogni 20 secondi, quando torni sull'app e quando torna la rete
setInterval(() => { if (!document.hidden) sincronizza(); }, 20000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) sincronizza(); });
addEventListener("online", () => sincronizza());
addEventListener("pagehide", () => { if (inAttesa.size) sincronizza(); });
