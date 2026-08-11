# NovaOS Mail — configurare il primo account

Guida rapida per collegare un account email reale (invio SMTP + ricezione IMAP).
Funziona solo con l'**app NovaOS installata** (il bridge nativo non esiste nel
browser desktop, dove la Mail resta una simulazione locale).

## 1. Apri le impostazioni Mail
App **Mail** → icona **⚙️** in alto a destra → sezione **Account posta (IMAP/SMTP)**.

## 2. Inserisci i dati
- **Indirizzo email**: il tuo indirizzo completo (es. `mario.rossi@gmail.com`).
  Appena esci dal campo, NovaOS **precompila da solo** i server per i provider
  più comuni (Gmail, Outlook, Yahoo, iCloud, Libero, Aruba).
- **Server IMAP** (posta in arrivo) e **porta** — di norma **993**.
- **Server SMTP** (posta in uscita) e **porta** — di norma **465** (SSL) o **587** (STARTTLS).
- **Nome utente**: quasi sempre l'email intera.
- **Password**: vedi sotto. È **cifrata nel dispositivo** (Android Keystore) e non
  viene mai salvata in chiaro.

Poi tocca **Collega account**: NovaOS salva e avvia subito la sincronizzazione.

## 3. La password: attenzione alla verifica in due passaggi
Se sull'account hai la **2FA** (Google, Microsoft, Yahoo, iCloud), la tua password
normale **non funziona** da un client IMAP: devi generare una **password per app**.

| Provider | Dove generarla |
|----------|----------------|
| **Gmail** | Account Google → Sicurezza → *Password per le app* (richiede 2FA attiva) |
| **Outlook/Hotmail** | account.microsoft.com → Sicurezza → *Password per le app* |
| **Yahoo** | Account → Sicurezza account → *Genera password per app* |
| **iCloud** | appleid.apple.com → Accesso e sicurezza → *Password specifiche per app* |

Incolla quella password (16 caratteri) nel campo Password.

## 4. Parametri pronti dei provider più usati

| Provider | IMAP | porta | SMTP | porta |
|----------|------|-------|------|-------|
| Gmail | imap.gmail.com | 993 | smtp.gmail.com | 465 |
| Outlook/Hotmail | outlook.office365.com | 993 | smtp.office365.com | 587 |
| Yahoo | imap.mail.yahoo.com | 993 | smtp.mail.yahoo.com | 465 |
| iCloud | imap.mail.me.com | 993 | smtp.mail.me.com | 587 |
| Libero | imapmail.libero.it | 993 | smtp.libero.it | 465 |
| Aruba | imaps.aruba.it | 993 | smtps.aruba.it | 465 |

> Gmail: assicurati che **IMAP sia abilitato** (Gmail web → Impostazioni → *Inoltro
> e POP/IMAP* → Abilita IMAP).

## 5. Usare la posta
- **🔄 Sincronizza** (in alto) scarica gli ultimi messaggi dalla casella.
- **✍️ Scrivi** → l'invio passa dal tuo SMTP reale; ricevi conferma "Email inviata".
- Rispondi, inoltra, allegati e ricerca funzionano come in un normale client.

## 6. Problemi comuni
- **"Invio non riuscito" / "Errore posta"**: quasi sempre password sbagliata
  (serve la *password per app* con 2FA) o server/porta errati.
- **Timeout**: controlla la connessione e che le porte non siano bloccate dalla rete.
- **Nessun messaggio dopo la sync**: verifica IMAP abilitato lato provider e che la
  cartella sia `INBOX`.
- Per rimuovere tutto: Impostazioni Mail → **Scollega account** (cancella anche la
  password cifrata).
