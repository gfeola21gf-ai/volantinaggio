/* comuni.js — i comuni d'Italia, per scrivere «di dove sei» e la città degli open day, e per le distanze.
   comuni.json = [[nome, sigla provincia, lat, lon], …] (7904 comuni; unito il 2026-10-28 da due elenchi pubblici:
   matteocontrini/comuni-json e Comuni-Italiani-2018 per le coordinate; 52 comuni nati da fusioni recenti non hanno coordinate).
   Si salva il testo «Latina (LT)»: il comune (e le sue coordinate) si ritrova con trova().

   Uso: campoComune('data-bozza="citta"', valore) nel markup, e attivaComuni(radice) una volta:
   mentre scrivi compaiono i suggerimenti; toccandone uno il campo riceve «Nome (SG)» e un evento "input". */
let elenco = null, inArrivo = null;
const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’\-]/g, " ").replace(/\s+/g, " ").trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function caricaComuni() {
  inArrivo ??= fetch(new URL("./comuni.json", import.meta.url))
    .then(r => r.json())
    .then(l => (elenco = l.map(([nome, sigla, lat, lon]) => ({ nome, sigla, lat, lon, n: norm(nome) }))))
    .catch(e => { inArrivo = null; throw e; });
  return inArrivo;
}
export const etichetta = c => `${c.nome} (${c.sigla})`;

/** i comuni che corrispondono a quello che scrivi: prima quelli che iniziano così (i nomi più corti prima) */
export function cerca(q, max = 7) {
  const n = norm(q);
  if (!elenco || n.length < 2) return [];
  const inizio = [], dentro = [];
  for (const c of elenco) {
    if (c.n.startsWith(n)) inizio.push(c);
    else if (c.n.includes(n)) dentro.push(c);
  }
  inizio.sort((a, b) => a.n.length - b.n.length);
  return [...inizio, ...dentro].slice(0, max);
}

/** dal testo salvato («Latina (LT)» oppure «Latina») al comune; null se non lo trovo (o l'elenco non è ancora caricato) */
export function trova(testo) {
  if (!elenco || !testo) return null;
  const m = String(testo).match(/^(.*?)\s*\(([A-Za-z]{2})\)\s*$/);
  const n = norm(m ? m[1] : testo);
  return elenco.find(c => c.n === n && (!m || c.sigla === m[2].toUpperCase())) || null;
}

/** il testo «pulito» da salvare: se è un comune lo scrivo sempre «Roma (RM)» (anche se hai scritto solo «roma») */
export function normalizzaCitta(testo) {
  const c = trova(testo);
  return c ? etichetta(c) : String(testo || "").trim();
}

/** distanza in linea d'aria, in km (null se manca una coordinata) */
export function km(a, b) {
  if (a?.lat == null || b?.lat == null) return null;
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

/** il campo con i suggerimenti sotto; attributi = es. 'data-bozza="citta"' */
export function campoComune(attributi, valore = "", segnaposto = "Scrivi il comune…") {
  return `<span class="campo-comune"><input ${attributi} data-comune value="${esc(valore)}" autocomplete="off" autocapitalize="words" placeholder="${esc(segnaposto)}"><span class="suggerimenti" role="listbox"></span></span>`;
}

/** i suggerimenti, una volta per pagina (ascolta gli eventi dentro radice) */
export function attivaComuni(radice) {
  radice.addEventListener("input", e => {
    const el = e.target;
    if (!("comune" in (el.dataset || {}))) return;
    const box = el.parentElement.querySelector(".suggerimenti");
    caricaComuni().then(() => {
      const c = trova(el.value), l = c && el.value === etichetta(c) ? [] : cerca(el.value);   // già scelto dalla lista? niente lista
      box.innerHTML = l.map(c => `<button type="button" role="option" data-comune-scelto="${esc(etichetta(c))}">${esc(c.nome)} <small>${esc(c.sigla)}</small></button>`).join("");
    }).catch(() => { box.innerHTML = ""; });
  });
  // il tocco su un suggerimento non deve togliere la tastiera prima del clic
  radice.addEventListener("pointerdown", e => { if (e.target.closest("[data-comune-scelto]")) e.preventDefault(); });
  radice.addEventListener("click", e => {
    const b = e.target.closest("[data-comune-scelto]");
    if (!b) return;
    const input = b.closest(".campo-comune").querySelector("input");
    input.value = b.dataset.comuneScelto;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    b.parentElement.innerHTML = "";
    input.blur();
  });
  radice.addEventListener("focusout", e => {
    if (!("comune" in (e.target.dataset || {}))) return;
    setTimeout(() => { const box = e.target.parentElement?.querySelector(".suggerimenti"); if (box) box.innerHTML = ""; }, 200);
  });
}
