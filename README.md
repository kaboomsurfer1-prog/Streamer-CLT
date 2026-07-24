# Bot Streamers CLT

Bot Discord per il server `1505903653079351357`, pensato per notificare live e nuovi video senza modificare il codice.

## Funzioni

- Comandi slash protetti da ruoli autorizzati.
- Ruoli autorizzati iniziali:
  - `1505905849774641243`
  - `1519377368354132110`
  - `1505906085901504522`
- Configurazione persistente in JSON.
- Canali default separati per live e video.
- Sorgenti modificabili da Discord: aggiungi, modifica, rimuovi, lista, test, annuncia.
- Template messaggi globali o personalizzati per singola sorgente.
- Endpoint `/health` per Railway se e' presente `PORT`.

## Piattaforme

Live automatiche native:

- Twitch, tramite Twitch API.
- YouTube Live, tramite YouTube Data API.
- Kick, tramite endpoint pubblico Kick.

Video automatici tramite feed RSS/Atom:

- YouTube, tramite feed ufficiale se usi il channel id `UC...`, oppure tramite YouTube API se imposti `YOUTUBE_API_KEY`.
- TikTok, tramite RSSHub o feed inserito.
- Facebook, Instagram, Trovo, Rumble, X/Twitter e altre sorgenti RSS, se inserisci un feed supportato.

Live senza API stabile:

- TikTok Live, Instagram Live, Facebook Live, Trovo, Rumble, X/Twitter e altre piattaforme possono essere aggiunte come sorgenti manuali e annunciate con `/streamer annuncia`.
- Il bot non accetta controlli URL arbitrari per le live, per evitare che un comando Discord possa far chiamare al bot endpoint interni o non sicuri.

## Setup locale

1. Installa Node.js 20 o superiore.
2. Installa dipendenze:

```bash
npm install
```

3. Copia `.env.example` in `.env` e imposta almeno:

```bash
DISCORD_TOKEN=token_del_bot
DISCORD_GUILD_ID=1505903653079351357
```

4. Avvia:

```bash
npm start
```

## Variabili Railway

Imposta su Railway:

```bash
DISCORD_TOKEN=token_del_bot
DISCORD_GUILD_ID=1505903653079351357
ALLOWED_ROLE_IDS=1505905849774641243,1519377368354132110,1505906085901504522
DATA_DIR=/data
CHECK_INTERVAL_SECONDS=120
TWITCH_CLIENT_ID=client_id_twitch
TWITCH_CLIENT_SECRET=client_secret_twitch
YOUTUBE_API_KEY=api_key_youtube
RSSHUB_URL=https://rsshub.app
```

Consiglio: crea un Railway Volume montato su `/data`, cosi il file di configurazione resta salvato anche dopo i restart.

## Permessi Discord

Invita il bot con scope:

- `bot`
- `applications.commands`

Permessi consigliati:

- View Channels
- Send Messages
- Read Message History
- Mention Roles, solo se vuoi usare `ruolo_ping`

## Comandi

`/stato`
Mostra lo stato del bot, sorgenti configurate e canali default.

`/canale imposta tipo:<live|video> canale:#canale`
Imposta il canale default per live o video.

`/canale mostra`
Mostra i canali default.

`/canale rimuovi tipo:<live|video>`
Rimuove il canale default.

`/streamer aggiungi tipo:<live|video> piattaforma:<...> utente:<nome>`
Aggiunge una sorgente. Puoi indicare anche `canale`, `nome`, `url`, `feed`, `messaggio`, `ruolo_ping`, `notifica_subito`.

Esempi:

```text
/streamer aggiungi tipo:live piattaforma:twitch utente:nome_twitch canale:#live
/streamer aggiungi tipo:live piattaforma:youtube utente:@handle_youtube canale:#live
/streamer aggiungi tipo:live piattaforma:kick utente:nome_kick canale:#live
/streamer aggiungi tipo:video piattaforma:youtube utente:UCxxxxxxxxxxxxxxxxxxxx canale:#video
/streamer aggiungi tipo:video piattaforma:tiktok utente:@nome_tiktok canale:#video
/streamer aggiungi tipo:video piattaforma:instagram utente:nome feed:https://rsshub.app/instagram/user/nome canale:#video
```

`/streamer lista`
Lista tutte le sorgenti.

`/streamer modifica id:<id>`
Modifica canale, messaggio, feed, nome, url, ping o stato automatico.

`/streamer rimuovi id:<id>`
Rimuove una sorgente.

`/streamer test id:<id>`
Mostra una preview. Con `invia:true` manda davvero il test nel canale configurato.

`/streamer annuncia id:<id> titolo:<testo> url:<link>`
Invia manualmente una notifica usando la sorgente, il canale, il ruolo ping e il template configurati. Serve per live su piattaforme senza API affidabile.

`/messaggio imposta tipo:<live|video> testo:<template>`
Modifica il messaggio globale.

Placeholder disponibili:

```text
{mention} {creator} {username} {platform} {type} {title} {url} {channel} {publishedAt} {startedAt}
```

Template default:

```text
live: {mention} {creator} este LIVE pe {platform}: {url}
video: {mention} {creator} a publicat un video nou pe {platform}: {title} {url}
```

`/ruoli aggiungi ruolo:@ruolo`
Aggiunge un ruolo autorizzato.

`/ruoli rimuovi ruolo:@ruolo`
Rimuove un ruolo autorizzato.

`/ruoli lista`
Mostra i ruoli autorizzati.

## Feed sicuri

I feed inseriti via comando devono essere `https` e su domini consentiti, ad esempio:

- `www.youtube.com`
- `rsshub.app`
- `rss.app`
- domini ufficiali delle piattaforme elencate
- il dominio configurato in `RSSHUB_URL`

Questo evita che il bot venga usato come proxy verso IP locali o servizi privati.