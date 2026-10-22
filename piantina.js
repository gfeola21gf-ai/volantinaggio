/* piantina.js — la mascotte: una piantina per ogni contatto, disegnata in SVG.
   I 4 traguardi del contatto fanno crescere la piantina:
     0 seme        = contatto preso (disegnato: non esiste un'emoji del seme, 🌰 è una castagna)
     1 🌱 germoglio  = ha risposto (a un messaggio o a una telefonata)
     2 🌿 piantina   = è venuto all'open day
     3 🌸 fiorita    = si è iscritto
   «Non interessato» = piantina grigia che riposa. */

/** il seme (a goccia, come un seme di zucca), da usare nel testo al posto di un'emoji */
export const SEME = `<svg class="seme" viewBox="0 0 20 20" aria-label="seme"><path d="M10 2.5 C14.5 6 15.5 11 13.6 14.6 C12.3 17.1 7.7 17.1 6.4 14.6 C4.5 11 5.5 6 10 2.5 Z" fill="#E3C48F" stroke="#9C6B32" stroke-width="1.3"/><path d="M10 5.5 C11.8 8 12 11.5 10.6 14" stroke="#B8894B" stroke-width="1" fill="none" stroke-linecap="round"/></svg>`;

export const STADI = [
  { nome: "Seme", spiega: "contatto preso", emoji: SEME },
  { nome: "Germoglio", spiega: "ha risposto", emoji: "🌱" },
  { nome: "Piantina", spiega: "è venuto all'open day", emoji: "🌿" },
  { nome: "Fiorita", spiega: "si è iscritto", emoji: "🌸" },
];

/** lo stadio di un contatto (dati = contatto.dati) */
export function stadio(dati) {
  const t = dati?.traguardi || {};
  if (t.iscritto) return 3;
  if (t.openday) return 2;
  if (t.risposto) return 1;
  return 0;
}

const foglia = (x, y, giro) =>
  `<ellipse cx="${x}" cy="${y}" rx="11" ry="5.5" fill="#5DBB63" transform="rotate(${giro} ${x} ${y})"/>`;

/** il disegno: st = 0…3, grigia = non interessato */
export function svgPianta(st, { grigia = false } = {}) {
  let g = "";
  if (st === 0) {
    // il seme appoggiato sulla terra, un po' inclinato
    g = `<g transform="translate(50 74) rotate(-25) scale(.75)"><path d="M0 -9 C5 -5 6 1 4 4.6 C2.7 7.1 -2.7 7.1 -4 4.6 C-6 1 -5 -5 0 -9 Z" fill="#E3C48F" stroke="#9C6B32" stroke-width="1.6"/></g>`;
  } else {
    const alto = [0, 22, 46, 52][st];
    const cima = 82 - alto;
    g += `<path d="M50 82 Q${st > 1 ? 46 : 50} ${82 - alto / 2} 50 ${cima}" stroke="#3E9A4A" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    g += foglia(43, cima + 4, -30) + foglia(57, cima + 4, 30);
    if (st >= 2) g += foglia(41, 66, -30) + foglia(59, 70, 30) + foglia(40, 52, -30) + foglia(60, 56, 30);
    if (st === 3) {
      g += [0, 72, 144, 216, 288].map(a => `<ellipse cx="50" cy="23" rx="5" ry="7" fill="#F28CB1" transform="rotate(${a} 50 30)"/>`).join("");
      g += `<circle cx="50" cy="30" r="4.5" fill="#F7C948"/>`;
    }
  }
  const faccia = grigia
    ? `<path d="M41 94 h6 M53 94 h6" stroke="#2B1B10" stroke-width="1.8" stroke-linecap="round"/><path d="M46 100 h8" stroke="#2B1B10" stroke-width="1.6" stroke-linecap="round"/>`
    : `<circle cx="44" cy="94" r="2" fill="#2B1B10"/><circle cx="56" cy="94" r="2" fill="#2B1B10"/><path d="M46 99 Q50 102 54 99" stroke="#2B1B10" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 100 112" aria-hidden="true"${grigia ? ' class="grigia"' : ""}>` +
    `<path d="M30 84 H70 L65 110 H35 Z" fill="#D9824B"/><rect x="27" y="80" width="46" height="8" rx="3" fill="#C26B38"/>${faccia}${g}</svg>`;
}
