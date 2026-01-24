# Enrichissement des questions (100% gratuit)

Ce script enrichit ton `questions.json` en ajoutant automatiquement :
- `wikidataId`
- `illustrationTexte` (une phrase courte)
- `imageUrl` (image Wikimedia Commons, sinon placeholder SVG en `data:` pour garantir 100% d’images)
- `imagePage` (lien vers la page du fichier Commons quand c’est une image Commons)

## Prérequis
- Node.js 18+ (ou 20+) installé

## Utilisation (Windows)
1) Place `enrich_questions_v2.js` dans le même dossier que `questions.json`
2) Ouvre un terminal **dans ce dossier** (Shift + clic droit → Ouvrir dans le terminal)
3) Lance :

```bash
node enrich_questions_v2.js --in questions.json --out questions.enriched.json
```

Options utiles :
- ralentir pour éviter les limites : `--sleep 400`
- tester sur 20 questions : `--limit 20`

## Important (site)
Si tu charges les images depuis `upload.wikimedia.org`, ton `index.html` doit autoriser ces images (CSP):
`img-src 'self' data: https://upload.wikimedia.org https://commons.wikimedia.org;`
