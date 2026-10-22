/* modulo.js — il modulo pubblico del QR (modulo.html?k=<chiave del volantinatore>).
   La persona scrive nome, telefono, email, sceglie l'open day e dà il consenso:
   il contatto arriva nell'app di chi le ha mostrato il QR. Niente account. */
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";
import { SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA } from "./config.js";
import { svgPianta } from "./piantina.js";
import { ic } from "./icone.js";

const sb = createClient(SUPABASE_URL, SUPABASE_CHIAVE_PUBBLICA, { auth: { persistSession: false } });
const $app = document.getElementById("app");
const chiave = new URLSearchParams(location.search).get("k") || "";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let M = null;                                   // cosa dice il modulo (classe, volantinatore, open day, privacy)
let B = { nome: "", telefono: "", email: "", citta: "", consenso: false };

function disegnaModulo(errore = "") {
  $app.innerHTML = `<header class="barra"><h1><span class="piccolo">LEARNIS Mind · <i>Find your method</i></span>Restiamo in contatto</h1></header>
    <div class="corpo modulo nuovo">
      <p class="tenue">Hai incontrato <b>${esc(M.volantinatore)}</b>: lascia qui i tuoi contatti per ricevere informazioni sul corso e sugli open day.</p>
      <label>Nome e cognome<input data-b="nome" value="${esc(B.nome)}" autocomplete="name" autocapitalize="words"></label>
      <label>Telefono<input data-b="telefono" value="${esc(B.telefono)}" type="tel" inputmode="tel" autocomplete="tel"></label>
      <label>Email <span class="facolt">(facoltativa)</span><input data-b="email" value="${esc(B.email)}" type="email" inputmode="email" autocomplete="email" autocapitalize="off"></label>
      <label>Di dove sei? <span class="facolt">(facoltativo)</span><input data-b="citta" value="${esc(B.citta)}" autocomplete="address-level2" autocapitalize="words" placeholder="es. Roma, Latina, Napoli"></label>
      <button class="consenso ${B.consenso ? "on" : ""}" data-consenso role="checkbox" aria-checked="${B.consenso}">
        <span class="spunta">${B.consenso ? ic("spunta") : ""}</span><span>${esc(M.privacy || "")}</span>
      </button>
      <p class="errore">${esc(errore)}</p>
      <button class="primario largo" data-invia>Invia</button>
    </div>`;
}

function disegnaGrazie() {
  $app.innerHTML = `<div class="corpo accesso">
      <div class="logo nuova">${svgPianta(0)}</div>
      <h1>Grazie, ${esc(B.nome.split(" ")[0])}!</h1>
      <p class="marchio">${esc(M.volantinatore)} ti contatterà presto.</p>
      <p class="tenue">Studiare di più non è studiare meglio.</p>
      <button class="secondario largo" data-ancora>Lascia il contatto di un'altra persona</button>
    </div>`;
}

$app.addEventListener("input", e => { if (e.target.dataset.b) B[e.target.dataset.b] = e.target.value; });
$app.addEventListener("click", async e => {
  const el = e.target.closest("button");
  if (!el) return;
  if ("consenso" in el.dataset) { B.consenso = !B.consenso; return disegnaModulo(); }
  if ("ancora" in el.dataset) { B = { nome: "", telefono: "", email: "", citta: B.citta, consenso: false }; return disegnaModulo(); }
  if ("invia" in el.dataset) {
    if (B.nome.trim().length < 2) return disegnaModulo("Scrivi il tuo nome.");
    if (B.telefono.trim().length < 6 && !B.email.includes("@")) return disegnaModulo("Serve il telefono o l'email.");
    if (!B.consenso) return disegnaModulo("Serve la spunta del consenso.");
    el.disabled = true; el.textContent = "Invio…";
    const { error } = await sb.rpc("volantini_lascia_contatto", { p_chiave: chiave, p_nome: B.nome, p_telefono: B.telefono,
      p_email: B.email, p_openday: null, p_consenso: true, p_citta: B.citta });
    if (error) return disegnaModulo(/fetch|network|load failed/i.test(error.message) ? "Manca la connessione: riprova." : error.message);
    disegnaGrazie();
  }
});

(async () => {
  const { data, error } = chiave ? await sb.rpc("volantini_modulo", { p_chiave: chiave }) : { error: { message: "" } };
  if (error) {
    $app.innerHTML = `<div class="corpo accesso"><div class="logo">${svgPianta(0)}</div><h1>Modulo non trovato</h1>
      <p class="tenue">Il QR potrebbe essere vecchio: chiedi a chi te l'ha mostrato di aprirlo di nuovo.</p></div>`;
    return;
  }
  M = data;
  disegnaModulo();
})();
