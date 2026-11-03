# Agent di traduzione per le dirette Uniqaia.
#
# Entra nella stanza LiveKit come partecipante invisibile, ascolta l'italiano
# della presentatrice, e pubblica il testo tradotto su un canale per lingua:
#   sub.it  sub.en  sub.fr  sub.ru  sub.ar
# La pagina della diretta si iscrive al canale della lingua scelta dallo
# spettatore e mostra il testo nella fascia sotto il video.
#
# L'audio viene trascritto UNA volta sola e la traduzione parte in parallelo
# su tutte le lingue: il costo dipende dai minuti e dalle lingue, non da
# quanti spettatori stanno guardando.

import asyncio
import logging
import os

import httpx
from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    RoomInputOptions,
    cli,
    inference,
)
from livekit.agents.llm import ChatContext

load_dotenv(".env.local")
log = logging.getLogger("traduzione")

LINGUE = {
    "en": "inglese",
    "fr": "francese",
    "ru": "russo",
    "ar": "arabo",
}

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_ANON_KEY"]

# Traduzione e trascrizione passano dai modelli fatturati da LiveKit:
# nessun secondo contratto, tutto sulla bolletta che c'è già.
traduttore = inference.LLM(model="openai/gpt-5-nano")
server = AgentServer()


async def carica_glossario() -> str:
    """Legge i termini gemmologici da Supabase e li prepara per il traduttore."""
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.get(
                f"{SUPABASE_URL}/rest/v1/glossary",
                params={"select": "term,en,fr,ru,ar,note", "active": "eq.true"},
                headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
            )
            r.raise_for_status()
            righe = r.json()
    except Exception as e:  # il glossario è un miglioramento, non un requisito
        log.warning("glossario non caricato: %s", e)
        return ""

    voci = []
    for v in righe:
        rese = ", ".join(f"{k}: {v[k]}" for k in ("en", "fr", "ru", "ar") if v.get(k))
        nota = f" ({v['note']})" if v.get("note") else ""
        voci.append(f"- {v['term']} -> {rese}{nota}")
    log.info("glossario: %d termini", len(voci))
    return "\n".join(voci)


def istruzioni(lingua: str, glossario: str) -> str:
    testo = (
        f"Traduci in {lingua} il testo italiano che ricevi. È il parlato di una "
        "gemmologa GIA che presenta gioielli e pietre preziose in diretta.\n"
        "Rispondi SOLO con la traduzione, senza virgolette, commenti o spiegazioni.\n"
        "Mantieni il registro parlato e la lunghezza simile all'originale: è un "
        "sottotitolo che qualcuno legge mentre guarda.\n"
        "Lascia invariati i nomi propri, i marchi, le sigle (GIA, IGI) e i numeri "
        "con la loro unità (carati, millimetri).\n"
        "Se una frase è troncata a metà, traduci quel che c'è senza completarla."
    )
    if glossario:
        testo += "\n\nUsa obbligatoriamente queste rese per i termini tecnici:\n" + glossario
    return testo


async def traduci(testo: str, lingua: str, glossario: str) -> str:
    ctx = ChatContext.empty()
    ctx.add_message(role="system", content=istruzioni(lingua, glossario))
    ctx.add_message(role="user", content=testo)
    fuori = ""
    async for pezzo in traduttore.chat(chat_ctx=ctx):
        if pezzo.delta and pezzo.delta.content:
            fuori += pezzo.delta.content
    return fuori.strip()


async def attendi_regia(ctx: JobContext) -> str:
    """Aspetta chi conduce la diretta, ignorando gli spettatori."""

    def cerca():
        for p in ctx.room.remote_participants.values():
            if p.identity.startswith("staff:"):
                return p.identity
        return None

    trovato = cerca()
    if trovato:
        return trovato

    atteso: asyncio.Future = asyncio.get_running_loop().create_future()

    @ctx.room.on("participant_connected")
    def _(p):
        if p.identity.startswith("staff:") and not atteso.done():
            atteso.set_result(p.identity)

    log.info("in attesa che la regia entri nella stanza")
    return await atteso


# Senza agent_name l'agent entra da solo in ogni diretta che si apre:
# nessuna configurazione da ricordare quando si va in onda.
@server.rtc_session()
async def entrypoint(ctx: JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}
    glossario = await carica_glossario()

    async def pubblica(lingua: str, testo: str):
        if not testo:
            return
        try:
            await ctx.room.local_participant.send_text(testo, topic=f"sub.{lingua}")
        except Exception as e:
            log.warning("invio %s fallito: %s", lingua, e)

    async def traduci_e_pubblica(lingua: str, testo: str):
        try:
            await pubblica(lingua, await traduci(testo, LINGUE[lingua], glossario))
        except Exception as e:
            log.warning("traduzione %s fallita: %s", lingua, e)

    session = AgentSession(
        # Una sola trascrizione per tutta la stanza, qualunque sia il pubblico.
        stt=inference.STT(model="deepgram/nova-3-general", language="it"),
    )

    @session.on("user_input_transcribed")
    def _(ev):
        if not ev.is_final or not ev.transcript.strip():
            return
        testo = ev.transcript.strip()
        # L'originale esce subito; le traduzioni partono tutte insieme.
        asyncio.create_task(pubblica("it", testo))
        for lingua in LINGUE:
            asyncio.create_task(traduci_e_pubblica(lingua, testo))

    await ctx.connect()

    # Chi conduce entra con identità "staff:...", il pubblico con "viewer:...".
    # Senza questa scelta l'agent si aggancia al primo che trova — di solito uno
    # spettatore, che non ha microfono — e resta in ascolto del nulla.
    regia = await attendi_regia(ctx)
    log.info("ascolto la regia: %s", regia)

    await session.start(
        agent=Agent(instructions=""),
        room=ctx.room,
        room_input_options=RoomInputOptions(
            participant_identity=regia,
            # Uno spettatore che chiude la pagina non deve spegnere i sottotitoli.
            close_on_disconnect=False,
        ),
    )


if __name__ == "__main__":
    cli.run_app(server)
