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

## Pubblicarla su GitHub Pages (5 minuti)

1. Crea un repository su GitHub (anche privato va bene se hai GitHub Pro; altrimenti pubblico).
2. Carica **tutto il contenuto** di questa cartella nella radice del repository, cartella `.github` compresa. Dal sito: *Add file → Upload files*, trascina i file e le cartelle, poi *Commit changes*.
3. *Settings → Pages*: in **Source** scegli *Deploy from a branch*, ramo `main`, cartella `/ (root)`, *Save*.
4. Dopo un minuto l'indirizzo è `https://TUONOME.github.io/NOMEREPO/`. Aprilo in **Safari sull'iPhone**, tocca Condividi → **Aggiungi alla schermata Home**.
5. Al primo avvio consenti la posizione («Durante l'uso» con «Posizione esatta»).

### Dati aggiornati da soli

Nella scheda **Actions** del repository trovi «Aggiorna dati autovelox e tutor». Avvialo una volta a mano (*Run workflow*): scarica gli autovelox aggiornati da OpenStreetMap e **ricostruisce sulla mappa tutte le tratte tutor ufficiali** (elenco Polizia di Stato in `tools/tutor-ufficiali.csv`). Poi gira da solo ogni lunedì. Se in *Settings → Actions → General* i permessi del workflow sono in sola lettura, imposta *Read and write permissions*.

Quando l'elenco ufficiale dei tutor cambia, aggiorna `tools/tutor-ufficiali.csv`: il workflow riparte da solo.

## Traffico in tempo reale (facoltativo)

I servizi gratuiti di percorso non hanno il traffico in tempo reale. Se vuoi vederlo sulla mappa crea una chiave gratuita su developer.tomtom.com e incollala in *Impostazioni → Traffico in tempo reale*.

## Limiti da conoscere

- Su iPhone il GPS funziona solo con l'app **aperta in primo piano**: lo schermo resta acceso da solo durante la guida.
- I dati vengono da OpenStreetMap e dall'elenco ufficiale dei tutor: sono buoni ma non perfetti. **I cartelli stradali prevalgono sempre.** L'elenco ufficiale dei dispositivi autorizzati è su velox.mit.gov.it.
- Pedaggi stimati con la tariffa media (circa 8 centesimi al km in classe A): l'importo reale può variare del 10–15%.
- La media del tutor è calcolata dal GPS del telefono: è una stima, non una prova.

## Fonti

Mappa © OpenFreeMap e contributori OpenStreetMap · Percorsi: Valhalla su server FOSSGIS · Ricerca: Photon (komoot) · Punti di interesse: Overpass API · Satellite: Esri · Elenco tutor: Polizia di Stato / Autostrade per l'Italia · Prezzi carburante: medie MIMIT.

Nessun dato personale lascia il telefono: preferiti, storico e impostazioni restano nella memoria del browser.
