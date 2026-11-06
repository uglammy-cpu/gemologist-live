# Rig di Gemma: contratto

Gemma è la jewelry expert di Uniqaia: l'avatar animato di Elena Goglio, con il suo volto, che parla a nome suo (decisioni di Elena del 6 novembre 2026). **Non si presenta mai come gemmologa GIA**, per motivi legali: si dice «la jewelry expert della piattaforma» / «Uniqaia's jewelry expert».

Questo documento segue la skill *2d-character-rig-animation* (generative-media-skills, licenza MIT; copia nel progetto in `claude/avatar/skills/`). Va letto prima di cambiare pesi, perni, limiti o gesti, e aggiornato insieme a loro. Il funzionamento generale sta in `LEGGIMI.md`.

## Le due versioni

| ID | Versione | Illustrazione | Geometria | Script dei livelli |
| --- | --- | --- | --- | --- |
| `diamante` | lente 10x e diamante in mano | `elena-illustrazione.png` con il volto di `elena-volto.png` | `show/_src/avatar-geometria.json` | `prepara-livelli.py` |
| `libera` | mani libere | `elena-mani-libere.png` | `show/_src/avatar-geometria-libera.json` | `togli-pochette.py`, poi `prepara-livelli-libera.py` |

Una sola vista per versione: frontale per il diamante, tre quarti per le mani libere. Niente giri di testa né cambi di vista. I nomi dei file restano `elena-*`: sono ID stabili, usati da script e documenti.

## Tecnica

Rig **ibrido**, scelto in base al disegno (un'illustrazione 3D in un solo pezzo, senza livelli separati):

- **deformazione**: una sola immagine scontornata, deformata in WebGL da una griglia di circa 10 px. Corpo, braccia, capelli e gambe si muovono con mappe di pesi;
- **sostituzioni**: occhi chiusi e tre aperture della bocca, in un atlante (`elena[-libera]-fx.webp`);
- **niente parti rigide separate**, quindi niente ordine di disegno da cambiare. Una mano non può passare davanti al corpo, e un avambraccio non può venire verso chi guarda (non c'è prospettiva). I limiti degli avambracci vengono da qui.

## Coordinate e convenzioni

- Pixel dell'illustrazione, 1254 × 1254, origine in alto a sinistra, **y verso il basso**.
- Angoli in **radianti**, positivo = senso orario sullo schermo. Spostamenti in pixel dell'illustrazione.
- **Destra e sinistra si riferiscono all'immagine**, cioè a chi guarda, non al personaggio: `armR` è il braccio a destra nell'immagine, cioè il sinistro di Gemma. La skill consiglia la prospettiva del personaggio; qui si tiene quella dell'immagine perché è già nel motore e nelle mappe, e ogni documento la dichiara.
- Tempo: millisecondi virtuali nel motore; video a 25 fps (il 9:16 esce a 30 fps).

## Gerarchia (figura a mani libere)

```text
radice: oscillazione sui piedi (sway, perno fra i piedi 622,1252)
└─ fianchi: hip (di lato, piedi fermi, gambe dritte) · drop (fianco della gamba libera) · knee (ginocchio libero)
   ├─ gamba a sinistra nell'immagine ─┐ divise a x = 612
   ├─ gamba a destra nell'immagine  ──┘
   └─ busto: lean (sui fianchi 640,790, che seguono hip) · twist · breath
      ├─ collo (639,468) → testa: roll, dx, dy, nod → capelli: punte con molla (hairL, hairR)
      ├─ spalle: shrugL, shrugR (le braccia salgono con loro)
      ├─ spalla a dx img (752,545): arm → gomito (804,668): foreR → mano
      └─ spalla a sx img (522,545): loupe → gomito (475,668): foreL → mano
viso: occhi chiusi (blink 0–1, sostituzione) · bocca (mouth 0–3, sostituzione)
```

Catene tutte in **FK**: il gomito segue la spalla, poi l'avambraccio gira sul gomito spostato. **Niente IK**, perché non ci sono contatti da tenere: i piedi restano fermi per costruzione (peso zero ai piedi, taglio lineare delle gambe). Con il diamante, lente e diamante sono disegnati nella mano e si muovono con lei.

## Controlli

Figura a mani libere (limiti in `avatar-geometria-libera.json`, molle in `avatar.js`, `FM_SPRING`):

| ID | Cosa muove | Perno | Unità | Limiti | Neutro | Verso |
| --- | --- | --- | --- | --- | --- | --- |
| `arm` | braccio a dx img, dalla spalla | 752,545 | rad | −0,17 … 0,04 | ≈ −0,01 (cambia con la postura) | negativo = si apre verso l'esterno |
| `loupe` | braccio a sx img, dalla spalla | 522,545 | rad | −0,04 … 0,17 | ≈ +0,01 | positivo = si apre |
| `foreR` | avambraccio e mano a dx img | gomito 804,668 | rad | −0,27 … 0,05 | 0 … −0,07 | negativo = la mano sale verso l'esterno |
| `foreL` | avambraccio e mano a sx img | gomito 475,668 | rad | −0,05 … 0,27 | 0 … 0,07 | positivo = sale verso l'esterno |
| `shrugL`, `shrugR` | spalle e braccia, metà sinistra e destra | — | px | −2,5 … 4 | ±0,8 | positivo = su |
| `hip` | tutto sopra i piedi, a taglio | — | px | ±11 | 0 o ±5–10 (peso) | positivo = a destra |
| `knee` | ginocchio della gamba libera, verso l'interno | — | px | ±5 | 0 | il segno dice la gamba: > 0 gamba a destra |
| `drop` | fianco e coscia della gamba libera, in giù | — | px | 0 … 3,5 | 0 | — |
| `twist` | centro del petto di lato (il contorno resta) | — | px | ±5 | ±2,6 | positivo = a destra |
| `lean` | busto sui fianchi | 640,790 + hip | rad | ±0,035 | ±0,008 (contrapposto) | positivo = spalla destra giù |
| `roll`, `dx`, `dy`, `nod` | testa con i capelli alti | collo 639,468 | rad, px | piccoli | 0 | — |
| `hairL`, `hairR` | punte dei capelli | — | px | ±9 | onda lenta | — |
| `sway` | corpo intero | piedi | rad | ≈ ±0,002 | 0 | — |
| `blink` | palpebre (sostituzione) | — | 0–1 | — | 0 | — |
| `mouth` | bocca (sostituzione) | — | 0–3 | — | 0 | — |

Figura con il diamante (geometria `avatar-geometria.json`, invariata dal 4 novembre): `arm` = avambraccio con il diamante sul gomito (925,545), da −0,10 a 0,08; `loupe` = mano con la lente sul polso (450,705), da −0,06 a 0,16; `lean`, testa, capelli, respiro, `sway` e riflesso sul diamante (`glints`). Non ha avambracci, spalle, fianchi né ginocchia.

## Libreria dei gesti

| Gesto | Versione | Intenzione | Come | Tenuta |
| --- | --- | --- | --- | --- |
| `hello` | tutte e due | saluta | mani libere: anticipazione, poi la mano verso il fumetto si alza e fa due cenni; testa inclinata, cenno. Diamante: testa, diamante, riflesso | ~2 s |
| `open` | mani libere | «eccoci», accoglie | anticipazione, apre tutte e due le braccia, spalle su | ~2 s |
| `present` | mani libere | indica il fumetto o lo schermo | anticipazione, mano aperta verso il fumetto, busto che si gira appena | ~2,3 s |
| `listen` | mani libere | ascolta | si sporge, testa inclinata, mani ferme, micro-movimenti quasi spenti | ~3,5 s, regge anche più a lungo |
| `think` | mani libere | ci pensa | testa dall'altra parte, una spalla su, peso indietro | ~3 s |
| `beat` / accento | mani libere | sottolinea una parola | una mano sale e torna (forza 0–1); i forti con tutte e due e un cenno | ~0,6 s |
| `show`, `loupe` | diamante | mostra il diamante, alza la lente | (sulle mani libere diventano `open` e `present`) | ~1,5 s |
| `lean`, `nod`, `tilt` | tutte e due | si sporge, assente, inclina la testa | — | breve |

Ogni gesto ha attacco, tenuta e rilascio con curve morbide, ampiezze e tempi un po' diversi ogni volta, e passa dalle molle dei controlli. Gli avambracci arrivano dopo le spalle, e l'assestamento lo fanno le molle. Tra un gesto e l'altro la postura cambia da sola ogni 3–6 secondi, con il peso che passa da un piede all'altro. Durante `listen` e `think` resta ferma: anche l'immobilità recita.

## Parlato

- **Bocca**: chiusa e tre aperture. In silenzio segue le sillabe del testo (a → 3, e/o → 2, le altre vocali → 1, chiusa fra una sillaba e l'altra); con la voce segue l'ampiezza della registrazione, con controllo automatico del livello. Niente visemi per fonema: le bilabiali (m, b, p) chiudono solo perché la bocca chiude fra le sillabe.
- **Lingue provate**: italiano e inglese, guardando i fotogrammi. Francese, russo e arabo non sono stati verificati sulla leggibilità del labiale.
- **Mani sul parlato** (mani libere): al massimo una parola sottolineata ogni uno o due secondi. Dal fumetto: numeri, nomi con la maiuscola, parole lunghe, inizio della frase. Dalla voce: l'inizio di ogni frase dopo una pausa e gli attacchi forti. Non si muove tutto a ogni sillaba.
- Lo stato d'animo non si ricava dal testo: lo decide lo script approvato da Elena.

## Ripetibilità

- Ogni scena ha un **seme**: `?seme=` nella pagina, `UQAvatar.seed(n)`, `--seme` o `"seme"` in `gira-video.mjs`. Senza seme, `gira-video.mjs` lo ricava dal nome della scena. Battiti di ciglia, postura e variazioni dei gesti vengono tutti da quel seme.
- **Orologio virtuale dall'inizio**: con `window.UQA_TEMPO_VIRTUALE` il motore parte da 0 e avanza solo con `UQAvatar._step(ms)`, ingresso compreso.
- **Stesso seme, stessa scena: fotogrammi identici byte per byte** (verificato il 6 novembre 2026 e ricontrollato da `collaudo-rig.mjs`).
- Limite: il motore integra molle nel tempo, quindi non si chiede un fotogramma isolato o all'indietro. Un fotogramma si ottiene rigirando la scena da 0 fino a quel punto, con lo stesso risultato.

## Scena in un file

```json
{ "id": "smm-012-gemma", "figura": "libera", "lingua": "en", "passo": 0, "secondi": 12, "parla": false,
  "gesti": [[0.3, "hello"], [4.0, "open"], [9.0, "present"]], "accenti": [[6.2, 0.8]],
  "audio": "smm-012-voce.m4a", "seme": 12, "loop": false }
```

`node ops/avatar/gira-video.mjs --scena smm-012.json --out <cartella>`. Tempi in secondi; `gesti` con i nomi della libreria; `accenti` = mani sul parlato in più (forza 0–1); `audio` relativo al file; `parla` = la bocca dice il testo del passo `passo` del copione (solo senza audio); `loop` = l'ultimo secondo sfuma nel primo.

## Formati

- Ripresa: 1076 × 1756 (nicchia 540 × 880 a doppia densità), trasparente e su avorio; 9:16: 1080 × 1920, figura in basso.
- I gesti restano dentro l'inquadratura (verificato sui fotogrammi). Titoli e sottotitoli fuori da viso e mani, nelle aree sicure dell'Editor.
- In arabo (fumetto a sinistra) saluta e indica con l'altro braccio. La figura non si specchia mai.

## Collaudo

`node ops/avatar/collaudo-rig.mjs` → `ops/avatar/qa/rig-libera.png` e `rig-diamante.png`, più il resoconto (errori nella pagina, ripetibilità). Da rifare dopo ogni modifica al rig. Rispetto ai dieci punti della skill:

| Prova | Stato |
| --- | --- |
| posa di riposo, andata e ritorno | sì: «riposo» e ritorno dopo ogni prova |
| estremi delle articolazioni | sì: spalle, gomiti, braccia dentro, peso a destra e a sinistra, busto ruotato |
| pose specchiate | non si applica: la figura non si specchia |
| contatti di mani e piedi | piedi fermi per costruzione; contatti delle mani non ce ne sono |
| FK/IK | non si applica: solo FK |
| volto: occhi e bocca | sì: occhi chiusi, tre aperture |
| ciglia e sguardo | ciglia sì; lo sguardo non ha un controllo |
| bordi dei loop | sì: le scene d'attesa sfumano l'ultimo secondo nel primo |
| viste | una per versione |
| formati e ripetizione | sì: 9:16 controllato, ripetibilità automatica |

**Difetti noti** (classi della skill):

- *Cucitura*, piccola: quando il braccio a destra si apre, sull'angolo basso della giacca accanto al polsino compaiono pochi pixel sfrangiati; a dimensione reale non si vedono.
- *Collasso*, contenuto: oltre circa 0,27 rad la mano si schiaccerebbe, quindi i limiti degli avambracci stanno lì.
- *Trascinamento*, leggero: le ciocche appoggiate sulle braccia le seguono in parte.

## Accessibilità

- Con «riduci animazioni» resta l'immagine ferma.
- Niente lampi: il riflesso sul diamante è piccolo e arriva ogni 3–7 secondi.
- Nei video, sottotitoli o testi a schermo.

## Diritti e provenienza

| Cosa | Stato |
| --- | --- |
| Personaggio | Gemma, avatar di Elena Goglio. Gli usi li decide Elena |
| Volto e figura | quelli di Elena Goglio: è lei a darli e a decidere dove si usano |
| Voce | solo quella di Elena, o una voce sintetica che lei ha approvato |
| Illustrazioni di partenza | `elena-volto.png`, `elena-illustrazione.png`, approvate da Elena il 4 novembre 2026. **Origine, autore e licenza da scrivere qui** (le ha fornite Elena) |
| Ritocchi | `volto.py` (trapianto del volto), `togli-pochette.py` (ritocco classico, senza IA generativa) |
| Scontorno | modello `isnet-general-use.onnx` dei rilasci di rembg: licenza da verificare prima di usi commerciali fuori da Uniqaia |
| Motore e script | scritti per Uniqaia in questo repository (sessioni di lavoro con Claude) |
| Skill | *2d-character-rig-animation*, generative-media-skills, commit `8c85352` (14 luglio 2026), licenza MIT |
| Regole legali | mai «gemmologa GIA» né logo GIA per Gemma; sempre dichiarata come avatar animato (scheda `claude/avatar/elena.md` nel progetto) |
