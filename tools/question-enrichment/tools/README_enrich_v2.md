# Enrichissement des questions (100% gratuit)

Ce script enrichit ton `questions.json` en ajoutant automatiquement :
- `wikidataId`
- `illustrationTexte` (une phrase courte)
- `imageUrl` (image Wikimedia Commons, sinon placeholder SVG en `data:` pour garantir 100% d’images)
- `imagePage` (lien vers la page du fichier Commons quand c’est une image Commons)

## Prérequis
- Node.js 18+ (ou 20+) installé

## Utilisation (Windows)
1) Ouvre un terminal dans `tools/question-enrichment/tools`.
2) Choisis le JSON à enrichir (`../../../frontend/data/questions.json` ou `../../../backend/data/questions.json`).
3) Lance :

```bash
node enrich_questions.js --in ../../../frontend/data/questions.json --out ../../../frontend/data/questions.json
```

Options utiles :
- ralentir pour éviter les limites : `--sleep 400`
- tester sur 20 questions : `--limit 20`

## Important (site)
Après génération, copie le JSON final vers `frontend/data/questions.json` pour le mode local ou `backend/data/questions.json` pour le fallback serveur.

Si tu charges les images depuis `upload.wikimedia.org`, ton `index.html` doit autoriser ces images (CSP):
`img-src 'self' data: https://upload.wikimedia.org https://commons.wikimedia.org;`
