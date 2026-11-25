# Sentinella

Navigatore per telefono con **autovelox, tutor e costo del viaggio**. È una web app: si apre da Safari e si aggiunge alla schermata Home, poi funziona come un'app.

## Cosa fa

- **Navigazione** da A a B con tappe intermedie, ordine delle tappe ottimizzato, fino a 4 alternative, istruzioni vocali in italiano e ricalcolo automatico se esci dal percorso.
- **Costo del viaggio** (come ViaMichelin): carburante calcolato sui consumi della tua auto in città, fuori città e in autostrada, pedaggi stimati, CO₂, spesa divisa tra le persone a bordo. Etichette «Più veloce» e «Più economica».
- **Autovelox**: oltre 5.300 dispositivi in Italia, avviso a voce in anticipo, stato attivo o spento modificabile, segnalazioni tue (fissi e controlli mobili per 4 ore).
- **Tutor**: inizio e fine tratta, velocità media in tempo reale, km mancanti, velocità massima che puoi tenere per chiudere in regola, storico dei passaggi con stima della sanzione (art. 142 CdS).
- **Limiti di velocità** della strada che stai percorrendo, con pioggia e neopatentati.
- **Punti di interesse**: benzinai (con carburanti e orari), colonnine, ristoranti, bar, parcheggi, supermercati, farmacie, ospedali, hotel, bancomat, officine, aree di servizio e altro, vicino a te o **lungo il percorso**.
- Ricerca di indirizzi e luoghi, preferiti (Casa, Lavoro), recenti, segnaposto con pressione prolungata, parcheggio salvato, condivisione dell'orario di arrivo.
- Mappa vettoriale con edifici 3D, tema chiaro, scuro e satellite. Funziona anche con connessione scarsa grazie alla cache.
- **Schede dei luoghi complete**: aperto/chiuso adesso con gli orari della settimana, telefono, sito, Wikipedia e meteo sul posto. Con la chiave Google Places (facoltativa) anche voto, recensioni e foto.
- **Meteo dal vivo** (Open-Meteo): condizioni attuali, pioggia nelle prossime 2 ore, prossime ore e giorni. **Meteo sul percorso all'ora in cui passi**: pioggia, neve, nebbia, ghiaccio, temporali, vento. Con pioggia vera applica da solo i limiti ridotti.
- **Incidenti e code** in tempo reale con la chiave TomTom (gratuita), sulla mappa e lungo il percorso, con il ritardo stimato.
- **La strada**: dossi, semafori, passaggi a livello, strade dissestate o sterrate, pericoli segnalati (OpenStreetMap); **curve pericolose** calcolate dalla forma del percorso con la velocità consigliata; belvedere e strade panoramiche.
- **Copilota** da A a B per una guida più sportiva: note vocali in stile rally (direzione, grado 1–6, «lunga», «si stringe», distanze), accelerazione laterale, cronometro con record per percorso. **Percorso divertente** e **Strade da guidare** vicino a te, classificate per quantità di curve.
- **Posizione live**: link da mandare su WhatsApp, chi lo apre ti vede muovere; si ferma da solo all'arrivo o dopo il tempo scelto.
- **Carovana**: più auto con un codice, posizioni sulla mappa, chi è davanti o dietro, messaggi rapidi letti a voce, destinazione comune.
- **Segnalazioni stile Waze**: traffico, polizia, incidenti, pericoli, buche, strade dissestate, dossi, strade chiuse; le vedono anche gli altri utenti di Sentinella in zona, con «Grazie» e «Non c'è più». Puoi registrare i **tratti belli** (panoramici o da guidare).
- **Musica**: Spotify (telecomando dell'app, account Premium e Client ID gratuito) e Apple Music (apertura rapida, oppure riproduzione dentro l'app con token sviluppatore).
- Animazioni in stile Waze: faro sulla mappa oscurata con scheda dall'alto, fumetti che saltano fuori dai marcatori, «Sei qui» toccando la tua posizione.

- **ZTL**: zone a traffico limitato sulla mappa, avviso se il percorso ci entra (con orari) e ricalcolo che le evita, avviso a voce prima del varco.
- **Prezzi carburanti ufficiali** (MIMIT Osservaprezzi, aggiornati ogni mattina): prezzi sulla mappa, il distributore più conveniente lungo il percorso, media nazionale usata per il costo del viaggio.
- **Salite e discese**: profilo altimetrico del percorso, dislivello, pendenze massime, avviso prima delle discese ripide, consumo extra stimato.
- **Corsie** da prendere agli incroci (con la chiave TomTom).
- **Dove ho parcheggiato**: salvato da solo quando scendi dall'auto, con foto, nota, scadenza della sosta e promemoria.
- **Diario di guida**: ogni tragitto registrato da solo, km e costi del mese, tragitti abituali con il tempo migliore, esportazione CSV e GPX.
- **Comandi vocali**: «portami a casa», «segnala polizia», «quanto manca?», «che limite c'è?», «prossima canzone», «dov'è la macchina?».
- **Mappe offline**: scarichi una zona o il corridoio del percorso prima di partire.
- **Backup** di tutti i dati in un file, da esportare e reimportare.
- **Modalità pista**: cronometro sul giro con traguardo e settori fissati da te, delta in tempo reale sul miglior giro, giro ideale, g stimati dal GPS, telemetria CSV per ogni giro.
- **HUD**: velocità e limite enormi su schermo nero, con modalità specchio per il parabrezza.
- **Siri e Comandi rapidi**: link pronti come «Ehi Siri, Sentinella casa», che aprono l'app con il percorso già calcolato.
- **Conferme delle segnalazioni**: passando accanto a una segnalazione l'app chiede «c'è ancora?» con un tocco.
- **Mappa TomTom** e **colori del traffico sulle strade** (facoltativi, con la chiave TomTom).

## Pubblicarla su GitHub Pages (5 minuti)

1. Crea un repository su GitHub (anche privato va bene se hai GitHub Pro; altrimenti pubblico).
2. Carica **tutto il contenuto** di questa cartella nella radice del repository, cartella `.github` compresa. Dal sito: *Add file → Upload files*, trascina i file e le cartelle, poi *Commit changes*.
3. *Settings → Pages*: in **Source** scegli *Deploy from a branch*, ramo `main`, cartella `/ (root)`, *Save*.
4. Dopo un minuto l'indirizzo è `https://TUONOME.github.io/NOMEREPO/`. Aprilo in **Safari sull'iPhone**, tocca Condividi → **Aggiungi alla schermata Home**.
5. Al primo avvio consenti la posizione («Durante l'uso» con «Posizione esatta»).

### Dati aggiornati da soli

I prezzi dei carburanti li prepara la GitHub Action **Prezzi carburanti** (cartella `.github/workflows`): dopo il primo caricamento aprila dalla scheda **Actions** e premi **Run workflow** una volta; poi gira da sola ogni mattina.


Nella scheda **Actions** del repository trovi «Aggiorna dati autovelox e tutor». Avvialo una volta a mano (*Run workflow*): scarica gli autovelox aggiornati da OpenStreetMap e **ricostruisce sulla mappa tutte le tratte tutor ufficiali** (elenco Polizia di Stato in `tools/tutor-ufficiali.csv`). Poi gira da solo ogni lunedì. Se in *Settings → Actions → General* i permessi del workflow sono in sola lettura, imposta *Read and write permissions*.

Quando l'elenco ufficiale dei tutor cambia, aggiorna `tools/tutor-ufficiali.csv`: il workflow riparte da solo.

## Traffico in tempo reale (facoltativo)

I servizi gratuiti di percorso non hanno il traffico in tempo reale. Se vuoi vederlo sulla mappa crea una chiave gratuita su developer.tomtom.com e incollala in *Impostazioni → Traffico in tempo reale*.

## Collegamenti tra telefoni (posizione live, carovana, segnalazioni)

Non serve un server tuo: Sentinella usa broker MQTT pubblici e gratuiti (HiveMQ, con EMQX e Mosquitto di riserva). Posizione live e carovana viaggiano **cifrate** (AES-GCM): la chiave sta nel link o deriva dal codice della carovana, il server vede solo byte illeggibili. Le segnalazioni della community invece sono pubbliche per chi passa nella zona. I broker pubblici non garantiscono il servizio: se uno non risponde l'app passa al successivo.

## Limiti da conoscere

- Su iPhone il GPS funziona solo con l'app **aperta in primo piano**: lo schermo resta acceso da solo durante la guida.
- I dati vengono da OpenStreetMap e dall'elenco ufficiale dei tutor: sono buoni ma non perfetti. **I cartelli stradali prevalgono sempre.** L'elenco ufficiale dei dispositivi autorizzati è su velox.mit.gov.it.
- Pedaggi stimati con la tariffa media (circa 8 centesimi al km in classe A): l'importo reale può variare del 10–15%.
- La media del tutor è calcolata dal GPS del telefono: è una stima, non una prova.

## Fonti

Mappa © OpenFreeMap e contributori OpenStreetMap · Meteo: Open-Meteo · Traffico: TomTom (facoltativo) · Recensioni: Google Places (facoltativo) · Percorsi: Valhalla su server FOSSGIS · Ricerca: Photon (komoot) · Punti di interesse: Overpass API · Satellite: Esri · Elenco tutor: Polizia di Stato / Autostrade per l'Italia · Prezzi carburante: medie MIMIT.

Nessun dato personale lascia il telefono: preferiti, storico e impostazioni restano nella memoria del browser.
