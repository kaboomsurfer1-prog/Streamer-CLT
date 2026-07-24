# Logo dashboard

Metti qui il logo del bot con **esattamente** questo nome:

```
src/assets/logo.png
```

La dashboard lo serve su `/logo.png` e lo mostra nell'header, nella pagina di login e in quella di setup.

## Come attivarlo
1. Salva l'immagine del logo come `src/assets/logo.png` (PNG consigliato; vanno bene anche jpg/webp/svg se aggiorni il nome — vedi sotto).
2. `git add src/assets/logo.png` + commit + push → Railway lo include nel deploy.

## Alternative (senza committare il file)
Nelle variabili d'ambiente su Railway:

- `DASHBOARD_LOGO_URL` = URL pubblico dell'immagine (es. un link diretto). Ha la priorità su tutto.
- `DASHBOARD_LOGO_FILE` = percorso a un file logo diverso da `src/assets/logo.png`.

Se non c'è né il file né l'URL, la dashboard mostra solo il testo (nessuna immagine rotta).
