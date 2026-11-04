# Avatar di Elena · pagina /join

Elena, in versione illustrata, entra nella sezione «Trasmetti con noi» e spiega in sei passi come si entra in Uniqaia: account, candidatura, valutazione entro 24 ore, link di pagamento, palinsesto, diretta. Alla fine il pulsante «Crea il tuo account» porta al modulo.

Stato al 4 novembre 2026: **in anteprima**, visibile solo con `uniqaia.com/join/?avatar=preview`. **Non parla ancora**: il fumetto mostra il testo, la bocca resta chiusa. La voce è predisposta.

## I pezzi

| Pezzo | Dove |
| --- | --- |
| Motore, fumetto, comandi | `show/_src/avatar.js` (incluso da `build.mjs` nella pagina /join al posto di `{{AVATAR}}`) |
| Testi in 5 lingue | `show/_src/avatar-copione.json` — unica fonte, la usano sia il fumetto sia la voce |
| Immagini | `show/img/avatar/elena.webp` (figura scontornata, 140 KB), `elena-fx.webp` (occhi chiusi e tre aperture della bocca, 16 KB) |
| Preparazione delle immagini | `ops/avatar/prepara-livelli.py` da `elena-originale.png` (riproduce i due file identici) |
| Voce | `ops/avatar/genera-voce.mjs` → `show/img/avatar/voce/<lingua>/<passo>.mp3` |

## Come si muove

Un'unica immagine deformata in WebGL da una griglia: respiro, piccoli movimenti della testa, punte dei capelli che seguono il movimento, leggera oscillazione sui piedi, battito di ciglia (la palpebra scende, non dissolve). Entra di lato nella nicchia con due passi accennati, saluta inclinando la testa, accompagna con un cenno ogni passo e le pause del discorso.

- **Riduci animazioni** attivo o WebGL assente: immagine ferma, testo intero, si avanza a mano.
- Si ferma quando la sezione non è sullo schermo o la scheda è in secondo piano (batteria).
- Aspetta che la ruota di benvenuto sia chiusa prima di entrare.
- Arabo: la nicchia passa a destra, frecce e punti si specchiano; la figura no.
- Passa da solo al passo successivo; si mette in pausa con il pulsante o tenendo il mouse sul fumetto. Il lettore di schermo legge ogni passo intero.

## Accendere per tutti

In `show/_src/avatar.js`: `var MODE = "anteprima";` → `"pubblico"`. Poi `node show/_src/build.mjs`, commit e push. `"spento"` lo toglie del tutto. Con `?avatar=off` lo si nasconde per la sessione.

## Dare la voce

1. Audio, un file per passo con il nome dell'`id` del copione: `saluto`, `account`, `candidatura`, `valutazione`, `attivazione`, `palinsesto`, `in-onda`, `fine` (`.mp3`), nella cartella `show/img/avatar/voce/<lingua>/`.
   - **Registrazione di Elena**: la via più autentica per italiano, inglese e francese.
   - **Voce sintetica**: `ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… node ops/avatar/genera-voce.mjs --lingue it,en,fr,ru,ar`.
2. `node ops/avatar/genera-voce.mjs --controlla` — verifica i file e aggiorna `VOICE_LANGS` con le lingue complete.
3. `node show/_src/build.mjs`, commit e push.

Da quel momento compare **Ascolta**: la voce parte solo con un clic (i browser bloccano l'audio automatico), la bocca segue l'ampiezza dell'audio con tre aperture, il testo del fumetto avanza con la voce, e a fine frase si passa al passo successivo.

Prova senza file audio: `?avatar=voce` usa la voce del browser e muove la bocca seguendo le sillabe del testo (solo anteprima; se il browser non ha voci, la bocca si muove in silenzio).

## Se cambia il percorso

I testi descrivono il percorso seller del 4 novembre 2026 (`claude/percorso-seller.md`): 149 €/mese, 4 dirette da 60 minuti, serate alle 18/19/20, valutazione entro 24 ore, nessuna commissione. Se cambia uno di questi punti va aggiornato `avatar-copione.json` (e, se c'è la voce, rigenerato l'audio del passo). Russo e arabo vanno rivisti da un madrelingua.
