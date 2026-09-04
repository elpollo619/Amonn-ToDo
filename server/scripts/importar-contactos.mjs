// Importa los contactos de obra de las dos listas de Drive (carpeta 06 Kunden):
// la Adressliste (por obra) y la Kontaktliste del proyecto 770-lds Seewer.
//
// Se importa una vez y a partir de ahí la app es la fuente: NO se escribe en
// los Excel originales, porque si alguien los tiene abiertos al mismo tiempo
// se pisan los cambios.
//
// Se puede ejecutar más de una vez: no duplica.
import { query, pool } from '../src/db.js'

const P770 = '770 Bremgarten (Seewer)'
const G60 = 'G60 Muri'
const I16 = 'I16 Gampelen'

const CONTACTOS = [
  // --- Adressliste ---
  { name: 'Aline Jeker', role: 'Bauherrin', project: G60, mobile: '+41 76 307 81 59', email: 'aline.jeker@bewegungszeit.ch', address: 'Gurtenweg 60, 3074 Muri' },
  { name: 'Reto Baumgartner', company: 'R. Baumgartner AG', role: 'Baumeisterarbeiten', bkp: '211', project: G60, mobile: '+41 79 938 50 71', email: 'info@rbaumgartner.ch', address: 'Längacker 21, 3206 Rizenbach' },
  { name: 'Ueli Zihlmann', company: 'Fensterbaumeler AG', role: 'Fensterfront', bkp: '223', project: G60, phone: '+41 41 485 01 70', mobile: '+41 79 604 11 58', email: 'ueli.zihlmann@fensterbaumeler.ch', address: 'Hauptstrasse 36, 6170 Schüpfheim' },
  { name: 'Bruno Neuenschwander', company: 'Bruno Neuenschwander GmbH', role: 'Gipserarbeiten', bkp: '271', project: G60, phone: '+41 31 951 51 70', mobile: '+41 79 652 28 11', email: 'office@malerei-neuenschwander.ch', address: 'Alpenstrasse 14, 3073 Gümligen' },
  { name: 'Serge Gerber', company: 'Gerber AG Münsingen', role: 'Bodenbeläge Holz', bkp: '281.7', project: G60, phone: '+41 31 720 59 95', mobile: '+41 76 802 31 32', email: 'serge.gerber@gerberag.ch', address: 'Bernstrasse 5, 3110 Münsingen' },
  { name: 'Rafael Durband', company: 'GVB', role: 'Gebäudeversicherung', project: G60, mobile: '+41 79 961 74 72', email: 'rafael.durband@gvb.ch', address: 'Papiermühlestrasse 130, 3063 Ittigen' },
  { name: 'Timo Hunziker', company: 'Elektra Ins AG', role: 'Elektr. Installationen', bkp: '230', project: I16, mobile: '+41 79 376 17 07', email: 'timo.hunziker@elektrains.ch', address: 'Dorfstrasse 8, 3232 Ins' },
  { name: 'Rubeli', company: 'Rubelibau', role: 'Baumeisterarbeiten', bkp: '211', project: I16, mobile: '+41 78 770 06 24', email: 'fabienne@rubelibau.ch', address: 'Alte Neuenburgstrasse 7, 3236 Gampelen' },
  { name: 'Scheurer Holzbau AG', company: 'Scheurer Holzbau AG Lyss', role: 'Sanierung', bkp: '273', project: I16, phone: '032 389 22 72', email: 'scheurer@scheurerholzbau.ch', address: 'Bernstrasse 10, 3250 Lyss' },
  { name: 'Andreas Dietrich', role: 'Umgebung', bkp: '421', project: I16, phone: '032 313 44 77', email: 'gartenjoe@bluemail.ch', address: 'Seewald 290, 3236 Gampelen' },

  // --- Kontaktliste 770-lds Seewer ---
  { name: 'Reto Amonn', company: 'HANS AMONN AG', role: 'Architekt und Bauleiter', project: P770, phone: '+41 31 951 85 54', email: 'reto@reto-amonn.ch', address: 'Blümlisalpstrasse 4, 3074 Muri b. Bern', notes: 'Projektleitung' },
  { name: 'Luana und Alexander Seewer', role: 'Bauherrschaft', project: P770, address: 'Schmiedweg 12, 3048 Worblaufen', notes: 'Objekt: Ländlistrasse 123a, 3047 Bremgarten · Parz. 1555 · eBau 2025-8505' },
  { name: 'Markus Hodler', company: 'Gemeinde Bremgarten b. Bern', role: 'Fachbereich Bau und Betriebe', project: P770, phone: '031 306 64 60', notes: 'Baubewilligung; Zähler einbauen' },
  { name: 'Marco Di Geronimo', company: 'KFS', role: 'Bestandesaufnahme', bkp: '113', project: P770, phone: '+41 62 388 32 32', email: 'Marco.DiGeronimo@kfs.ch', status: 'beauftragt', notes: 'Auftrag Nr. 25601205' },
  { name: 'Reto Studer', company: 'Studer Bauingenieur', role: 'Rissprotokolle / Bauingenieur', project: P770, phone: '078 824 93 34', email: 'reto@studer-bauingenieur.com', status: 'in Arbeit' },
  { name: 'P. Meier', company: 'Stämpfli AG Bauunternehmung', role: 'Baugrubensicherung', bkp: '124', project: P770, phone: '034 408 40 40', email: 'p.meier@staempfliag.ch', address: 'Güterstrasse 5, 3550 Langnau i.E.', status: 'Kandidat' },
  { name: 'Nicole Neuhaus', company: 'Böhlen Bagger', role: 'Bauplatzinstallation / Rodung / Aushub', bkp: '201', project: P770, phone: '031 809 22 81', mobile: '079 651 35 73', email: 'info@boehlenbagger.ch', address: 'Moosmattweg 3, 3132 Riggisberg', status: 'vergeben' },
  { name: 'Claudia Messerli', company: 'Huldi + Stucki Strassen- und Tiefbau AG', role: 'Grabarbeiten Werkleitungen', bkp: '201 / 294', project: P770, phone: '031 992 19 39', email: 'info@huldi-stucki.ch', address: 'Pfaffensteig 6, 3018 Bern', status: 'Offerte erhalten', notes: 'Ausführung ab Okt. 2026' },
  { name: 'Wirz AG Bauunternehmung', company: 'Wirz AG', role: 'Baumeisterarbeiten inkl. Kanalisation', bkp: '211', project: P770, phone: '031 990 77 77', email: 't.zuber@wirzag.ch', address: 'Freiburgstrasse 359, 3018 Bern', status: "Offerte CHF 417'616" },
  { name: 'Frau Schüpbach', company: 'Schüpbach Holzbau AG', role: 'Fenster und Aussentüren', bkp: '221', project: P770, phone: '034 496 81 06', email: 'ts@schuepbach-holzbau.ch', address: 'Langnaustrasse 114, 3436 Zollbrück', status: 'Offerte bis 07.08.2026' },
  { name: 'Markus Zaugg', company: 'Guggisberg Dachtechnik AG', role: 'Bedachung / Spenglerei', bkp: '224', project: P770, phone: '031 960 16 16', email: 'm.zaugg@guggisberg-bern.ch', address: 'Seftigenstrasse 312, 3084 Wabern', status: 'Hauptanbieter', notes: 'Gesamtofferte Dach und PV' },
  { name: 'Francesco Barletta', company: 'merz group', role: 'Fassade / Aussenwärmedämmung', bkp: '226', project: P770, phone: '031 301 00 50', email: 'francesco.barletta@merzgroup.ch', address: 'Unterweg 29, 3302 Moosseedorf', status: 'aktiv' },
  { name: 'Beat Moser', company: 'GLM Gipserei Lüthi & Moser GmbH', role: 'Gipser / Fassade', bkp: '226 / 271', project: P770, mobile: '079 370 91 53', email: 'glm@glm-murten.ch', address: 'Vissaulastrasse 10, 3280 Murten', status: 'abgesagt' },
  { name: 'Jean-Marc Zürcher', company: 'eWorks Elektro AG', role: 'Elektroinstallationen', bkp: '230', project: P770, mobile: '079 672 80 00', email: 'info@eworks-elektro.ch', address: 'Postfach, 3280 Murten', status: 'aktiv', notes: 'erstellt Installationsplan' },
  { name: 'Daniela Matti', company: 'Storenservice Griesser AG', role: 'Sonnenstoren', bkp: '228', project: P770, phone: '0848 888 111', email: 'daniela.matti@griesser.ch', address: 'Wangenstrasse 102, 3018 Bern', status: 'Offerte 0-7341226' },
  { name: 'Schenker Storen AG', role: 'Sonnenstoren', bkp: '228', project: P770, phone: '062 858 55 11', email: 'schenker@storen.ch', address: 'Stauwehrstrasse 34, 5012 Schönenwerd', status: 'Empfehlung' },
  { name: 'Bucher Heizungen AG', role: 'Heizung / Wärmepumpe', bkp: '240', project: P770, phone: '032 331 24 89', email: 'info@bucherheizungen.ch', address: 'Hinterdorf 24, 3274 Bühl b. Aarberg', status: 'gemäss WV-Übersicht' },
  { name: 'klimag lüftungs ag', role: 'Komfortlüftung', bkp: '244', project: P770, phone: '031 339 40 40', email: 'lueftung@klimag.ch', address: 'Stauffacherstrasse 72, 3014 Bern', status: 'gemäss WV-Übersicht' },
  { name: 'Andreas Leu', company: 'Leu Haustech AG', role: 'Sanitäre Installationen', bkp: '251.1', project: P770, mobile: '079 247 77 08', email: 'mail@leu-haustech.ch', address: 'Moosseedorf', status: 'Kandidat' },
  { name: 'Veriset AG', role: 'Küche', bkp: '258', project: P770, email: 'info@veriset.ch', address: 'Oberfeld 8, 6037 Root', status: 'gemäss WV-Übersicht' },
  { name: 'Schindler Aufzüge AG', role: 'Aufzug / Lift', bkp: '261', project: P770, phone: '031 340 62 62', address: 'Zentweg 9, 3006 Bern', status: 'Offerte erhalten' },
  { name: 'Thomas Krebs', company: 'Halter + Krebs Metallbau AG', role: 'Metallbau / Treppe', bkp: '272', project: P770, phone: '031 981 08 44', email: 'info@halter-krebs.ch', address: 'Meriedweg 19, 3172 Niederwangen', status: 'keine Antwort' },
  { name: 'Aeschlimann Innenausbau AG', role: 'Innentüren / Schreinerarbeiten', bkp: '273', project: P770, phone: '031 701 12 65', email: 'info@schreinerei-aeschlimann.ch', address: 'Furth 464, 3512 Walkringen', status: 'aktiv' },
  { name: 'Peter Zürcher', company: 'HAZA Schliesstechnik AG', role: 'Schliessanlage', bkp: '275', project: P770, phone: '031 301 25 23', email: 'haza@haza.ch', address: 'Murtenstrasse 266, 3027 Bern', status: 'keine Antwort' },
  { name: 'Gerber AG Münsingen', role: 'Bodenbeläge / Parkett', bkp: '281.1', project: P770, phone: '031 720 59 95', email: 'info@gerberag.ch', address: 'Bernstrasse 5, 3110 Münsingen', status: 'Offerte OF-54348', notes: "CHF 47'167.10 exkl." },
  { name: 'Faro AG Facility Services', role: 'Baureinigung', bkp: '287', project: P770, phone: '031 332 52 51', email: 'info@faro.ch', address: 'Bottigenstrasse 217B, 3019 Bern', status: 'Offerte 10035589', notes: "CHF 4'946.00 exkl." },
  { name: 'Dominik Bähler', company: 'Die Malerei Bähler', role: 'Malerarbeiten', bkp: '285', project: P770, mobile: '078 664 07 07', email: 'diemalerei-baehler@gmx.ch', address: 'Talbodenweg 21, 3700 Spiez', status: 'keine Antwort' },
]

let nuevos = 0, saltados = 0
for (const c of CONTACTOS) {
  const { rows } = await query(
    'select id from contacts where lower(name) = lower($1) and coalesce(lower(project),\'\') = coalesce(lower($2),\'\')',
    [c.name, c.project ?? null],
  )
  if (rows.length) { saltados++; continue }
  await query(
    `insert into contacts (name, company, role, bkp, project, phone, mobile, email, address, status, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [c.name, c.company ?? null, c.role ?? null, c.bkp ?? null, c.project ?? null,
     c.phone ?? null, c.mobile ?? null, c.email ?? null, c.address ?? null, c.status ?? null, c.notes ?? null],
  )
  nuevos++
}
const total = (await query('select count(*) from contacts')).rows[0].count
console.log(`contactos nuevos: ${nuevos} · ya estaban: ${saltados} · total en la base: ${total}`)
await pool.end()
