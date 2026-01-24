#!/usr/bin/env python3
"""
Script de génération de questions de quiz via l'API Groq (GRATUIT).
Génère des questions sur un thème donné et les enrichit avec des images.

Prérequis:
    1. Créer un compte gratuit sur https://console.groq.com
    2. Générer une clé API
    3. Définir la variable d'environnement GROQ_API_KEY

Usage:
    python generate_questions.py --theme "histoire de France" --count 10
    python generate_questions.py --theme "géographie" --count 5 --output questions_geo.json
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Erreur: Le module 'requests' n'est pas installé.")
    print("Installez-le avec: pip install requests")
    sys.exit(1)


GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.3-70b-versatile"  # Modèle gratuit et puissant


def get_api_key():
    """Récupère la clé API depuis les variables d'environnement."""
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        print("Erreur: La variable d'environnement GROQ_API_KEY n'est pas définie.")
        print()
        print("Pour obtenir une clé API gratuite:")
        print("  1. Allez sur https://console.groq.com")
        print("  2. Créez un compte gratuit")
        print("  3. Générez une clé API")
        print("  4. Définissez la variable: set GROQ_API_KEY=gsk_...")
        sys.exit(1)
    return api_key


def generate_questions_prompt(theme: str, count: int) -> str:
    """Construit le prompt pour générer des questions."""
    return f"""Génère exactement {count} questions de quiz de culture générale sur le thème "{theme}".

IMPORTANT: Ta réponse doit être UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après.

Format JSON requis:
[
  {{
    "question": "La question complète en français avec un point d'interrogation",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "reponseCorrecte": "La bonne réponse (doit être exactement une des 4 options)"
  }}
]

Règles strictes:
- Exactement {count} questions
- Questions en français
- Chaque question a exactement 4 options
- Une seule réponse correcte par question
- La réponseCorrecte doit correspondre EXACTEMENT à une des options
- Difficulté variée (facile, moyen, difficile)
- Questions factuelles avec des réponses vérifiables
- Évite les questions trop obscures ou controversées

Génère maintenant les {count} questions sur "{theme}":"""


def generate_questions(theme: str, count: int) -> list:
    """Appelle l'API Groq pour générer des questions."""
    api_key = get_api_key()

    print(f"Génération de {count} questions sur le thème '{theme}' via Groq...")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": GROQ_MODEL,
        "messages": [
            {
                "role": "user",
                "content": generate_questions_prompt(theme, count)
            }
        ],
        "max_tokens": 4096,
        "temperature": 0.7
    }

    try:
        response = requests.post(GROQ_API_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Erreur de connexion à Groq: {e}")
        sys.exit(1)

    data = response.json()
    response_text = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()

    if not response_text:
        print("Erreur: Réponse vide de Groq")
        sys.exit(1)

    # Essayer de parser le JSON
    try:
        # Parfois le modèle ajoute des backticks markdown
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            json_lines = []
            in_json = False
            for line in lines:
                if line.startswith("```") and not in_json:
                    in_json = True
                    continue
                elif line.startswith("```") and in_json:
                    break
                elif in_json:
                    json_lines.append(line)
            response_text = "\n".join(json_lines)

        questions = json.loads(response_text)

        if not isinstance(questions, list):
            raise ValueError("La réponse n'est pas un tableau JSON")

        # Validation des questions
        for i, q in enumerate(questions):
            if "question" not in q or "options" not in q or "reponseCorrecte" not in q:
                raise ValueError(f"Question {i+1} mal formatée")
            if len(q["options"]) != 4:
                raise ValueError(f"Question {i+1} n'a pas 4 options")
            if q["reponseCorrecte"] not in q["options"]:
                print(f"Attention: Question {i+1} - la réponse '{q['reponseCorrecte']}' n'est pas dans les options")
                q["reponseCorrecte"] = q["options"][0]

        print(f"✓ {len(questions)} questions générées avec succès")
        return questions

    except json.JSONDecodeError as e:
        print(f"Erreur de parsing JSON: {e}")
        print(f"Réponse brute:\n{response_text[:500]}...")
        sys.exit(1)


def enrich_questions(input_file: Path, output_file: Path):
    """Appelle le script d'enrichissement Node.js."""
    script_path = Path(__file__).parent / "enrich_questions.js"

    if not script_path.exists():
        print(f"Attention: Script d'enrichissement non trouvé à {script_path}")
        print("Les questions seront sauvegardées sans enrichissement.")
        return False

    print(f"Enrichissement des questions avec Wikidata...")

    try:
        result = subprocess.run(
            ["node", str(script_path), "--in", str(input_file), "--out", str(output_file)],
            capture_output=True,
            text=True,
            cwd=script_path.parent
        )

        if result.returncode == 0:
            print("✓ Enrichissement terminé")
            return True
        else:
            print(f"Erreur d'enrichissement: {result.stderr}")
            return False

    except FileNotFoundError:
        print("Erreur: Node.js n'est pas installé ou n'est pas dans le PATH")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Génère des questions de quiz via l'API Groq (GRATUIT)"
    )
    parser.add_argument(
        "--theme", "-t",
        required=True,
        help="Le thème des questions (ex: 'histoire de France', 'géographie', 'cinéma')"
    )
    parser.add_argument(
        "--count", "-n",
        type=int,
        default=10,
        help="Nombre de questions à générer (défaut: 10)"
    )
    parser.add_argument(
        "--output", "-o",
        help="Fichier de sortie (défaut: questions_{theme}.enriched.json)"
    )
    parser.add_argument(
        "--no-enrich",
        action="store_true",
        help="Ne pas enrichir les questions avec Wikidata"
    )

    args = parser.parse_args()

    # Générer les questions
    questions = generate_questions(args.theme, args.count)

    # Définir les fichiers de sortie
    theme_slug = args.theme.lower().replace(" ", "_").replace("'", "")[:30]
    temp_file = Path(__file__).parent / f"questions_{theme_slug}.json"

    if args.output:
        output_file = Path(args.output)
    else:
        output_file = Path(__file__).parent / f"questions_{theme_slug}.enriched.json"

    # Sauvegarder les questions brutes
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)
    print(f"✓ Questions brutes sauvegardées: {temp_file}")

    # Enrichir si demandé
    if not args.no_enrich:
        enriched = enrich_questions(temp_file, output_file)
        if enriched:
            print(f"✓ Questions enrichies sauvegardées: {output_file}")
        else:
            with open(output_file, "w", encoding="utf-8") as f:
                json.dump(questions, f, ensure_ascii=False, indent=2)
            print(f"✓ Questions (non enrichies) sauvegardées: {output_file}")
    else:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(questions, f, ensure_ascii=False, indent=2)
        print(f"✓ Questions sauvegardées: {output_file}")

    print(f"\nPour utiliser ces questions dans le jeu:")
    print(f"  1. Copiez {output_file} vers frontend/questions.json")
    print(f"  2. Ou fusionnez avec les questions existantes")


if __name__ == "__main__":
    main()
