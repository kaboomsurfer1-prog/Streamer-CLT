# Bot Streamers CLT

Bot Discord pentru serverul `1505903653079351357`, facut pentru notificari live si video fara sa modifici codul.

## Functii

- Comenzi slash in romana, protejate de roluri autorizate.
- Comanda `/help` cu lista comenzilor si descrierea lor.
- Comenzi separate pentru adaugare: `/live` pentru live si `/video` pentru video. Ambele cer obligatoriu user Discord, platforma, link canal, canal Discord, mesaj custom, tag si mod automat/manual.
- Roluri autorizate initial:
  - `1505905849774641243`
  - `1519377368354132110`
  - `1505906085901504522`
- Configuratie persistenta in JSON.
- Canale implicite separate pentru live si video.
- Surse modificabile din Discord: adauga, modifica, sterge, lista, test, anunta.
- Template-uri globale sau personalizate pentru fiecare sursa.
- Endpoint /health pentru Railway daca exista PORT.
- Dashboard web protejat cu parola pentru adaugare, modificare, test, notificare manuala si stergere surse.

## Platforme

Live automat native:

- Twitch, prin Twitch API.
- YouTube Live, prin YouTube Data API.
- Kick, prin endpoint public Kick.
- TikTok Live, prin TikTools API cu `TIKTOOL_API_KEY`.

Video automat prin feed RSS/Atom:

- YouTube, prin feed oficial daca folosesti channel id `UC...`, sau prin YouTube API daca setezi `YOUTUBE_API_KEY`.
- TikTok, prin RSSHub sau feed introdus manual.
- Facebook, Instagram, Trovo, Rumble, X/Twitter si alte surse RSS, daca introduci un feed valid.

Live fara API stabil:

- Instagram Live, Facebook Live, Trovo, Rumble, X/Twitter si alte platforme fara provider automat pot fi adaugate ca surse manuale si anuntate cu `/streamer anunta`.
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
PORT=8080
TWITCH_CLIENT_ID=client_id_twitch
TWITCH_CLIENT_SECRET=client_secret_twitch
YOUTUBE_API_KEY=api_key_youtube
TIKTOOL_API_KEY=api_key_tiktools
RSSHUB_URL=https://rsshub.app
DASHBOARD_PASSWORD=parola_admin_dashboard
DASHBOARD_URL=https://nome-progetto.up.railway.app
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

## Dashboard web

Pe Railway, dupa deploy, deschide URL-ul serviciului. Prima pagina este dashboard-ul. In `Settings > Networking`, domeniul public trebuie sa aiba target port `8080` daca setezi `PORT=8080`.

Variabila obligatorie:

```bash
DASHBOARD_PASSWORD=parola_admin_dashboard
DASHBOARD_URL=https://nome-progetto.up.railway.app
```

Din dashboard poti:

- adauga live/video fara sa modifici codul;
- alege user Discord, platforma, link canal, canal Discord, mesaj, tag si mod automat/manual;
- modifica o sursa existenta;
- trimite test in canal;
- trimite manual notificarea live;
- activa/dezactiva sau sterge surse;
- vedere ultima eroare pentru fiecare sursa.

Mesaj simplu recomandat pentru live:

```text
{mention} {creator} este LIVE pe {platform}: {url}
```

Pentru TikTok automat ramane necesara `TIKTOOL_API_KEY`. Daca TikTools raspunde HTTP 403, foloseste butonul `Anunta` pentru notificare manuala sau verifica cheia/API quota.
## Comenzi

`/help`
Afiseaza toate comenzile botului si descrierea lor.

`/status`
Afiseaza statusul botului si configuratia.

`/dashboard`
Trimite linkul dashboard-ului web in privat.

`/live user_discord:@user platforma:<...> link:<url> canal:#canal mesaj:<text> tag:<user|everyone|here|role> mod:<auto|manual>`
Adauga o sursa live. Linkul trebuie sa fie valid pentru platforma aleasa. Daca alegi `tag:role`, completeaza si `rol_ping`.

Exemple:

```text
/live user_discord:@User platforma:twitch link:https://www.twitch.tv/nume canal:#live mesaj:{mention} {creator} este LIVE pe {platform}: {url} tag:user mod:auto
/live user_discord:@User platforma:youtube link:https://www.youtube.com/@handle canal:#live mesaj:{mention} {creator} este LIVE pe {platform}: {url} tag:everyone mod:auto
/live user_discord:@User platforma:kick link:https://kick.com/nume canal:#live mesaj:{mention} {creator} este LIVE pe {platform}: {url} tag:here mod:auto
/live user_discord:@User platforma:tiktok link:https://www.tiktok.com/@nume canal:#live mesaj:{mention} {creator} este LIVE pe {platform}: {url} tag:role rol_ping:@Rol mod:auto
```

`/video user_discord:@user platforma:<...> link:<url> canal:#canal mesaj:<text> tag:<user|everyone|here|role> mod:<auto|manual>`
Adauga o sursa video. Linkul trebuie sa fie valid pentru platforma aleasa. Pentru platforme fara feed automat, completeaza si `feed`.

Exemple:

```text
/video user_discord:@User platforma:youtube link:https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxx canal:#video mesaj:{mention} {creator} a publicat un video pe {platform}: {url} tag:user mod:auto
/video user_discord:@User platforma:tiktok link:https://www.tiktok.com/@nume canal:#video mesaj:{mention} video nou pe {platform}: {url} tag:here mod:auto
/video user_discord:@User platforma:instagram link:https://www.instagram.com/nume canal:#video mesaj:{mention} postare noua: {url} tag:role rol_ping:@Rol mod:auto feed:https://rsshub.app/instagram/user/nume
```

`/canal seteaza tip:<live|video> canal:#canal`
Seteaza canalul implicit pentru live sau video.

`/canal arata`
Afiseaza canalele implicite.

`/canal sterge tip:<live|video>`
Sterge canalul implicit.


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
{mention} {discordUser} {creator} {username} {platform} {type} {title} {url} {channel} {publishedAt} {startedAt}
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