/* prova.js — dati finti per la modalità prova (?prova): nessun account, niente viene inviato. */

export const IMPOSTAZIONI_INIZIALI = {
  tappe: ["Richiamare", "Invito all'open day", "Messaggio il giorno prima"],
  domande: [
    "Perché hai scelto di partecipare a questo volantinaggio?",
    "Quale caratteristica di te vuoi allenare mentre volantini?",
    "Cosa vuoi lasciare alle persone che incontri?",
    "Cosa vuoi mettere nel volantinare?",
  ],
  openDay: [],
  privacy: "Acconsento a essere ricontattato/a dallo staff di LEARNIS Mind (telefono, messaggio o email) per ricevere informazioni sul corso e sugli open day. I miei dati non saranno ceduti a terzi e posso chiederne la cancellazione in qualsiasi momento.",
};

export function datiDiProva() {
  const ora = Date.now(), giorno = 86400000;
  const iso = ms => new Date(ms).toISOString();
  const alle18 = gg => { const d = new Date(ora + gg * giorno); d.setHours(18, 0, 0, 0); return d.toISOString(); };
  const C = "prova-classe";
  const openDay = [
    { id: "od1", quando: alle18(16), citta: "Roma (RM)", luogo: "Sede LEARNIS", indirizzo: "Via Nazionale 12" },
    { id: "od2", quando: alle18(23), citta: "Latina (LT)", luogo: "Biblioteca comunale", indirizzo: "Piazza del Popolo 1" },
  ];
  const k = (id, user_id, dati) => [id, { id, classe_id: C, user_id, eliminato: false, aggiornato_il: iso(ora), dati: {
    traguardi: {}, tappe: [], persone: 1, consenso: { quando: iso(ora - giorno), testo: IMPOSTAZIONI_INIZIALI.privacy }, ...dati } }];
  return {
    classi: [{ id: C, nome: "Volantinaggio novembre", codice: "LM-0001", creata_da: "io",
      impostazioni: { ...IMPOSTAZIONI_INIZIALI, openDay } }],
    membri: [
      { classe_id: C, user_id: "io", nome: "Gianluigi", chiave_qr: "prova" },
      { classe_id: C, user_id: "chiara", nome: "Chiara" },
      { classe_id: C, user_id: "marco", nome: "Marco" },
    ],
    k: Object.fromEntries([
      k("k1", "io", { citta: "Frosinone (FR)", nome: "Giulia Rossi", telefono: "333 123 4567", eta: "21", fascia: "Università", interesse: 3,
        bisogno: "Studia tante ore ma non ricorda; esami a gennaio.", motivazione: "Vuole studiare meno ore e meglio.", quando: iso(ora - 2 * giorno),
        tappe: [{ id: "t1", titolo: "Richiamare", quando: iso(ora - 3600000), fatta: null },
                { id: "t2", titolo: "Invito all'open day", quando: null, fatta: null }] }),
      k("k2", "io", { nome: "Marco Bianchi", telefono: "347 765 4321", fascia: "Genitore", interesse: 2, persone: 3, gruppo: "g1",
        altri: "Moglie Anna, figlio Luca (15 anni, liceo)", bisogno: "Il figlio fa fatica in matematica.", quando: iso(ora - giorno), traguardi: { risposto: iso(ora - 3600000) },
        tappe: [{ id: "t3", titolo: "Messaggio di conferma", quando: alle18(0), fatta: null }] }),
      k("k3", "io", { citta: "Napoli (NA)", nome: "Paolo Ferri", telefono: "320 111 2222", fascia: "Lavoro", interesse: 3, quando: iso(ora - 9 * giorno),
        traguardi: { risposto: iso(ora - 8 * giorno), openday: iso(ora - 4 * giorno), iscritto: iso(ora - 3 * giorno) } }),
      k("k4", "io", { nome: "Sara Lodi", telefono: "339 000 1111", fascia: "Superiori", interesse: 2, persone: 5, gruppo: "g2",
        altri: "Quattro amiche di classe", quando: iso(ora - 3 * giorno),
        traguardi: { risposto: iso(ora - 2 * giorno), openday: iso(ora - giorno) } }),
      k("k5", "io", { nome: "Elena Neri", telefono: "345 222 3333", fascia: "Superiori", interesse: 1, persone: 5, gruppo: "g2", quando: iso(ora - 3 * giorno) }),
      k("k6", "chiara", { nome: "Luca Verdi", telefono: "348 444 5555", fascia: "Università", interesse: 3, quando: iso(ora - 2 * giorno), traguardi: { risposto: iso(ora - giorno), openday: iso(ora) } }),
      k("k7", "chiara", { nome: "Anna Galli", telefono: "331 666 7777", fascia: "Lavoro", interesse: 1, nonInteressato: true, quando: iso(ora - 2 * giorno) }),
      k("k8", "marco", { nome: "Rita Costa", telefono: "334 888 9999", fascia: "Genitore", interesse: 2, persone: 2, quando: iso(ora - giorno) }),
    ]),
    p: {
      [`perche:${C}`]: { risposte: [
        "Voglio portare a più persone possibile quello che il metodo ha dato a me.",
        "Il coraggio di fermare chi non conosco, senza paura del «no».",
        "La voglia di studiare meglio, non di più.",
        "Sorriso, ascolto e curiosità per chi ho davanti.",
      ] },
      [`diario:${C}:d1`]: { quando: iso(ora - 3 * 3600000), umore: "carico", testo: "Al terzo «no» volevo smettere. Poi Giulia si è fermata 10 minuti: mi ha ricordato perché lo faccio." },
      [`diario:${C}:d2`]: { quando: iso(ora - 2 * giorno), umore: "sereno", testo: "Prima uscita! 40 volantini, 3 contatti." },
    },
  };
}
