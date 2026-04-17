# ExoMaintenance

Site marketing pour **ExoMaintenance** — bureau d'étude mécanique & maintenance industrielle.

## Stack

- HTML / CSS / vanilla JS (zero build step)
- Scroll-sequence hero sur 240 frames (canvas 2D, parallax, lerp)
- Partials `partials/header.html` + `partials/footer.html` injectées via `includes.js`
- Formulaire de contact relayé par une **Supabase Edge Function** → **Resend** → `contact@exomaintenance.fr`

## Structure

```
index.html                 # Accueil (scroll sequence)
a-propos.html              # À propos
services.html              # Listing services
services/*.html            # 6 pages services
secteurs.html              # Listing secteurs
secteurs/*.html            # 5 pages secteurs
projets.html blog.html presse.html contact.html
partials/                  # Nav + footer partagés
styles.css main.js includes.js
favicon.svg
ezgif-frame-001..240.jpg   # Frames du chassis (hero)
```

## Développement local

```powershell
# Depuis la racine du repo
python -m http.server 5500
# → http://localhost:5500
```

## Contact form — pipeline

```
[contact.html] ─POST JSON─▶ Supabase Edge Function /send-contact
                             └─ Resend API ─▶ contact@exomaintenance.fr
```

La clé `RESEND_API_KEY` doit être configurée dans **Supabase → Edge Functions → send-contact → Secrets**. Ne jamais committer la clé dans ce repo.

## Déploiement

Site 100 % statique — déployable sur Netlify, Vercel, Cloudflare Pages, ou n'importe quel hébergeur statique.
