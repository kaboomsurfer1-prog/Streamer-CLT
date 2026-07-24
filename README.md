# Bot Streamers CLT

Bot Discord pentru serverul `1505903653079351357`, facut pentru notificari live si video fara sa modifici codul.

## Functii

- Comenzi slash in romana, protejate de roluri autorizate.
- Comanda `/help` cu lista comenzilor si descrierea lor.
- Comenzi separate pentru adaugare: `/live` pentru live si `/video` pentru video, ambele cu selectie obligatorie de canal.
- Roluri autorizate initial:
  - `1505905849774641243`
  - `1519377368354132110`
  - `1505906085901504522`
- Configuratie persistenta in JSON.
- Canale implicite separate pentru live si video.
- Surse modificabile din Discord: adauga, modifica, sterge, lista, test, anunta.
- Template-uri globale sau personalizate pentru fiecare sursa.
- Endpoint `/health` pentru Railway daca exista `PORT`.

## Platforme

Live automat native:

- Twitch, prin Twitch API.
- YouTube Live, prin YouTube Data API.
- Kick, prin endpoint public Kick.

Video automat prin feed RSS/Atom:

- YouTube, prin feed oficial daca folosesti channel id `UC...`, sau prin YouTube API daca setezi `YOUTUBE_API_KEY`.
- TikTok, prin RSSHub sau feed introdus manual.
- Facebook, Instagram, Trovo, Rumble, X/Twitter si alte surse RSS, daca introduci un feed valid.

Live fara API stabil:

- TikTok Live, Instagram Live, Facebook Live, Trovo, Rumble, X/Twitter si alte platforme pot fi adaugate ca surse manuale si anuntate cu `/streamer anunta`.
- Botul nu accepta verificari URL arbitrare pentru live, ca sa nu poata fi folosit ca proxy spre servicii interne.

## Setup local

1. Instaleaza Node.js 20 sau mai nou.
2. Instaleaza dependintele:

```bash
npm install
```

3. Copiaza `.env.example` in `.env` si seteaza cel putin:

```bash
DISCORD_TOKEN=token_bot
DISCORD_GUILD_ID=1505903653079351357
```

4. Porneste botul:

```bash
npm start
```

## Variabile Railway

Seteaza pe Railway:

```bash
DISCORD_TOKEN=token_bot
DISCORD_GUILD_ID=1505903653079351357
ALLOWED_ROLE_IDS=1505905849774641243,1519377368354132110,1505906085901504522
DATA_DIR=/data
CHECK_INTERVAL_SECONDS=120
TWITCH_CLIENT_ID=client_id_twitch
TWITCH_CLIENT_SECRET=client_secret_twitch
YOUTUBE_API_KEY=api_key_youtube
RSSHUB_URL=https://rsshub.app
```

Recomandare: creeaza un Railway Volume montat pe `/data`, ca fisierul de configuratie sa ramana salvat dupa restart.

## Permisiuni Discord

Invita botul cu scope:

- `bot`
- `applications.commands`

Permisiuni recomandate:

- View Channels
- Send Messages
- Read Message History
- Mention Roles, doar daca folosesti `rol_ping`

## Comenzi

`/help`
Afiseaza toate comenzile botului si descrierea lor.

`/status`
Afiseaza statusul botului si configuratia.

`/live platforma:<...> utilizator:<nume> canal:#canal`
Adauga o sursa live si selecteaza direct canalul unde se trimit notificarile.

Exemple:

```text
/live platforma:twitch utilizator:nume_twitch canal:#live
/live platforma:youtube utilizator:@handle_youtube canal:#live
/live platforma:kick utilizator:nume_kick canal:#live
```

`/video platforma:<...> utilizator:<nume> canal:#canal`
Adauga o sursa video si selecteaza direct canalul unde se trimit notificarile. Pentru platforme fara feed automat, completeaza si `feed`.

Exemple:

```text
/video platforma:youtube utilizator:UCxxxxxxxxxxxxxxxxxxxx canal:#video
/video platforma:tiktok utilizator:@nume_tiktok canal:#video
/video platforma:instagram utilizator:nume feed:https://rsshub.app/instagram/user/nume canal:#video
```

`/canal seteaza tip:<live|video> canal:#canal`
Seteaza canalul implicit pentru live sau video.

`/canal arata`
Afiseaza canalele implicite.

`/canal sterge tip:<live|video>`
Sterge canalul implicit.

`/streamer adauga tip:<live|video> platforma:<...> utilizator:<nume>`
Comanda avansata pentru adaugare. Pentru adaugare rapida foloseste mai simplu `/live` sau `/video`.

`/streamer lista`
Afiseaza toate sursele.

`/streamer modifica id:<id>`
Modifica o sursa existenta.

`/streamer sterge id:<id>`
Sterge o sursa.

`/streamer test id:<id>`
Afiseaza un preview. Cu `trimite:true` trimite testul in canalul configurat.

`/streamer anunta id:<id> titlu:<text> url:<link>`
Trimite manual o notificare folosind sursa, canalul, rolul ping si template-ul configurat.

`/mesaj seteaza tip:<live|video> text:<template>`
Modifica mesajul global.

Placeholder disponibile:

```text
{mention} {creator} {username} {platform} {type} {title} {url} {channel} {publishedAt} {startedAt}
```

Template default:

```text
live: {mention} {creator} este LIVE pe {platform}: {url}
video: {mention} {creator} a publicat un video nou pe {platform}: {title} {url}
```

`/roluri adauga rol:@rol`
Adauga un rol autorizat.

`/roluri sterge rol:@rol`
Sterge un rol autorizat.

`/roluri lista`
Afiseaza rolurile autorizate.

## Feed-uri sigure

Feed-urile introduse prin comenzi trebuie sa fie `https` si pe domenii permise, de exemplu:

- `www.youtube.com`
- `rsshub.app`
- `rss.app`
- domenii oficiale ale platformelor listate
- domeniul configurat in `RSSHUB_URL`