/* icone.js — le icone dell'app, disegnate apposta (al posto delle emoji).
   Tutte su una griglia 24×24, tratto di 2 px con estremità arrotondate, colore = colore del testo
   (currentColor), così seguono da sole il tema chiaro/scuro.
   Uso: ic("telefono") → stringa <svg>. */

const P = {
  // schede in basso
  persona: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/>',
  personaPiu: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c0-3.9 2.9-6 6.5-6 1.4 0 2.7.3 3.7.9"/><path d="M18 13.5v7M14.5 17h7"/>',   // aggiungi persona
  calendario: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/><path d="M8 14h2M12 14h2M8 17h2"/>',
  squadra: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c0-3.3 2.5-5.2 5.5-5.2s5.5 1.9 5.5 5.2"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M16 14.4c2.8.1 4.8 1.8 4.8 4.6"/>',
  diario: '<path d="M6 3.5h11a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6z"/><path d="M9.5 3.5v17M12.5 8.5h3.5M12.5 12h3.5"/>',
  impostazioni: '<path d="M4 7h8.5M16.5 7H20M4 17h3M11 17h9"/><circle cx="14.5" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  // contatto
  telefono: '<path d="M6.6 3.5h2.8l1.6 4.1-2.1 1.4a11 11 0 0 0 6.1 6.1l1.4-2.1 4.1 1.6v2.8a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  messaggio: '<path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 19.8l1.2-4.1A8 8 0 1 1 20 11.5z"/><path d="M9 10.5h6M9 13.5h4"/>',
  email: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  campanella: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  citta: '<path d="M3 21h18"/><path d="M5 21V10l5-3v14"/><path d="M10 21V4h9v17"/><path d="M13 8h3M13 12h3M13 16h3M7 13h1M7 17h1"/>',   // palazzi
  via: '<path d="M12 3v18"/><path d="M5 6h11l3 2.5-3 2.5H5z"/><path d="M19 13H8l-3 2.5L8 18h11z"/>',   // cartello stradale = via
  sede: '<path d="M4 20V9l8-5 8 5v11"/><path d="M9.5 20v-6h5v6"/><path d="M2.5 20h19"/>',   // casetta = in presenza
  video: '<rect x="3" y="6.5" width="12" height="11" rx="2.5"/><path d="M15 10.5l6-3.5v10l-6-3.5z"/>',   // Zoom / online
  mondo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',   // nazionale
  luogo: '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  gruppo: '<circle cx="7" cy="9" r="2.3"/><circle cx="12" cy="7" r="2.3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 17.5c.5-2.3 2-3.5 4-3.5M21 17.5c-.5-2.3-2-3.5-4-3.5M8 19c.4-3 1.9-4.5 4-4.5s3.6 1.5 4 4.5"/>',
  // proposte per «non interessato»
  noX: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  noMeno: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  noMano: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 7-6 7-2.6 0-4-1.3-5.2-3.3L4.3 13.6a1.4 1.4 0 0 1 2.3-1.5L8 14"/>',
  noFoglia: '<path d="M6 18c0-7 4.5-11.5 12-12-.4 7.5-5 12-12 12z"/><path d="M6 18l6-6"/><path d="M4 21l2.5-3"/>',
  noVaso: '<path d="M6.5 12.5h11l-1.4 7.5H7.9z"/><path d="M9.5 9.5l5-5M14.5 9.5l-5-5"/>',
  // proposte per «squadra»: la coppa
  coppa: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.5M16.5 6H19a2.5 2.5 0 0 1-2.6 3.5"/><path d="M12 13.5v3.5M8.5 20.5h7M9.5 20.5l.5-3.5h4l.5 3.5"/>',
  coppaStella: '<path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 6H5a2.5 2.5 0 0 0 2.6 3.5M16.5 6H19a2.5 2.5 0 0 1-2.6 3.5"/><path d="M12 13.5V17M8 20.5h8"/><path d="M12 6.2l.8 1.5 1.6.2-1.2 1.1.3 1.6-1.5-.8-1.5.8.3-1.6-1.2-1.1 1.6-.2z"/>',
  coppaAlta: '<path d="M8 3.5h8v4.5a4 4 0 0 1-8 0z"/><path d="M12 12v4"/><path d="M9 20.5h6v-4.5H9z"/><path d="M8 5H5.5c0 2.2 1 3.5 2.8 3.8M16 5h2.5c0 2.2-1 3.5-2.8 3.8"/>',
  riposo: '<path d="M19.5 14.5A7.8 7.8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"/>',
  spunta: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  matita: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
  cestino: '<path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10.5 11v5M13.5 11v5"/>',
  lucchetto: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  // navigazione e azioni
  indietro: '<path d="M15 5l-7 7 7 7"/>',
  avanti: '<path d="M9 5l7 7-7 7"/>',
  chiudi: '<path d="M6 6l12 12M18 6L6 18"/>',
  piu: '<path d="M12 5v14M5 12h14"/>',
  annulla: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  cerca: '<circle cx="10.5" cy="10.5" r="6"/><path d="M20 20l-5-5"/>',
  lista: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="17.5" r=".6"/>',
  orto: '<path d="M6.5 13.5h11l-1.4 6.5H7.9z"/><path d="M12 13.5V9"/><path d="M12 10c-3 0-4.5-1.6-4.5-4.2 2.6 0 4.5 1.6 4.5 4.2zM12 10.5c2.6 0 4.2-1.4 4.2-3.7-2.3 0-4.2 1.4-4.2 3.7z"/>',
  condividi: '<path d="M12 3.5v11M7.5 8L12 3.5 16.5 8"/><path d="M5.5 12v6.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V12"/>',
  copia: '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V5.5a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3"/>',
  esporta: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2.5v2.5M20 14v.01M14 20h.01M17 17.5V20h3v-3"/>',
  statistiche: '<path d="M5 20v-7M12 20V5M19 20v-10"/>',
  nuvola: '<path d="M7.5 18.5a4 4 0 0 1-.6-8A5.8 5.8 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z"/>',
  aggiorna: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  // umori del diario
  sereno: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 13.5a4 4 0 0 0 7 0"/><path d="M9 9.5v.5M15 9.5v.5"/>',
  carico: '<path d="M13.5 3L5.5 13.5h6l-1 7.5 8-10.5h-6z"/>',
  pensieroso: '<circle cx="12" cy="12" r="8.5"/><path d="M9 15.5h6"/><path d="M9 10v.5M15 10v.5M8 7.5l2-.8"/>',
  stanco: '<circle cx="12" cy="12" r="8.5"/><path d="M7.8 10.5h2.6M13.6 10.5h2.6"/><path d="M8.7 16c1.1-1 2.2-1 3.3 0s2.2 1 3.3 0"/>',
  grato: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
};

/** un'icona come stringa <svg>; cls = classi CSS in più */
export function ic(nome, cls = "") {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[nome] || ""}</svg>`;
}
export const NOMI_ICONE = Object.keys(P);

/** gli umori del diario: chiave salvata → icona e parola */
export const UMORI = [
  { k: "sereno", testo: "Sereno" },
  { k: "carico", testo: "Carico" },
  { k: "pensieroso", testo: "Pensieroso" },
  { k: "stanco", testo: "Stanco" },
  { k: "grato", testo: "Grato" },
];
/** le note vecchie avevano un'emoji: la traduco nella chiave nuova */
export const DA_EMOJI = { "😊": "sereno", "💪": "carico", "🤔": "pensieroso", "😓": "stanco", "🙏": "grato" };
