# Skill : créer un fichier de révision Tomette

Tu es une IA dans un bac à sable Linux : tu peux lancer des commandes, lire des images et des documents, et écrire des fichiers. Ta mission est de transformer **les documents de l'utilisateur** (photos de cours, PDF, notes) et **sa demande** en **un fichier importable dans l'application Tomette**. Ce fichier contient des cours mis en forme, des cartes mentales, des schémas et des exercices corrigés.

> **Règle d'or : ne rien inventer.** Tout ce que tu écris (définitions, dates, formules, réponses, corrigés) doit venir des documents fournis. Si une information manque, tu ne la complètes pas : tu le signales dans `meta.notes`. Une seule exception : l'utilisateur t'autorise explicitement à chercher en ligne. Dans ce cas, chaque élément trouvé garde sa source (`meta.sources` avec `type: "web"` et `url`).

Référence complète du format : `skill/SCHEMA.md`. Exemples complets : `exemples/pack-demo-lycee.json` (tous les blocs et tous les types d'exercices), `exemples/ajout-cours-existant.json` (compléter un cours existant) et `exemples/pack-avec-image.zip` (images jointes).

---

## Étape 0 — Préparer l'espace de travail

```bash
mkdir -p travail/ocr travail/images && cd travail
ls -la ../           # repère les documents fournis
```

Outils utiles (installe-les si besoin) :
- **OCR** : `tesseract image.jpg sortie -l fra` (paquet `tesseract-ocr` + `tesseract-ocr-fra`).
- **PDF** : `pdftotext -layout doc.pdf -` et `pdftoppm -png -r 150 doc.pdf page` (paquet `poppler-utils`).
- **Images** : tu peux aussi *regarder* directement chaque image. Fais-le toujours, l'OCR rate les formules, les schémas et les tableaux.

## Étape 1 — Lire et transcrire TOUT le matériel

1. Pour chaque document, produis une transcription fidèle dans `travail/ocr/<nom>.md`. Recopie les titres, les définitions mot pour mot, les formules en LaTeX, les tableaux et les légendes de schémas.
2. Donne un identifiant court à chaque document (`doc1`, `doc2`…) et note la page ou la photo : tu en auras besoin pour `source`.
3. Relis l'image originale à côté de ta transcription. Corrige les erreurs d'OCR : accents, exposants, indices, signes moins, unités.
4. Repère ce qui est **illisible ou coupé** et note-le : tu ne le combleras pas.

## Étape 2 — Comprendre le cours

- Dresse le plan du cours (chapitres, notions, définitions, propriétés, méthodes, exemples, dates, vocabulaire).
- Identifie la matière et le niveau. Ils guident le choix des blocs (frise pour l'histoire, formules pour les sciences, vocabulaire pour les langues…).
- Liste les **notions clés à mémoriser** (elles deviendront des fiches) et les **savoir-faire** (ils deviendront des exercices).

## Étape 3 — Comprendre la demande de l'utilisateur

Réponds par écrit, dans `travail/plan.md` :
- Que veut-il exactement ? Un cours complet, seulement des exercices, une préparation à un examen, une carte mentale ?
- Le contenu va-t-il dans un **nouveau classeur** ou **s'ajoute-t-il à un cours existant** ? Si l'utilisateur donne les identifiants existants (ou un ancien fichier), réutilise **exactement** les mêmes `id` de classeur et de cours. L'app fusionne : les éléments de même `id` sont mis à jour (après accord de l'utilisateur), les nouveaux sont ajoutés, rien n'est supprimé.
- Quel volume ? Par défaut, pour un chapitre : 1 leçon, 1 carte mentale, 8 à 15 fiches, 4 à 8 QCM et 6 à 12 autres exercices variés.
- Une date d'examen est-elle mentionnée ? Si oui, renseigne `examDate`.

## Étape 4 — Chercher des exercices (seulement si c'est autorisé)

- Exercices **présents dans les documents** : reprends-les fidèlement, avec leur corrigé s'il existe. S'il n'y a pas de corrigé, rédige-le uniquement à partir du cours fourni et indique-le dans `explanation`.
- Recherche **en ligne** : seulement si l'utilisateur l'a demandé. Garde l'URL dans `meta.sources` et la référence dans `source`.

## Étape 5 — Rédiger le cours (si demandé)

Écris en « markdown enrichi » (voir SCHEMA.md, section 4). Bonnes pratiques :
- Une idée par paragraphe, phrases courtes, tutoiement possible dans les consignes.
- Utilise les encadrés **à bon escient** : `:::definition`, `:::theoreme` / `:::propriete`, `:::methode`, `:::exemple`, `:::attention`, `:::retenir`, `:::remarque`, `:::astuce`, `:::formule`.
- Pour les chronologies, `:::timeline`. Pour le vocabulaire ou une langue, `:::vocab`. Pour les procédures, `:::steps`. Pour les autotests, `:::reveal`. Pour comparer, un tableau ou `:::columns`.
- Formules en LaTeX : `$...$` en ligne, `$$...$$` en bloc. Dans le JSON, **double chaque antislash** (`\\frac`).
- Termine par `:::source doc1 p. 2` pour citer la source.
- Pas d'emoji, pas de HTML (il serait affiché tel quel).

## Étape 6 — Créer les visuels avec du code (jamais d'image générée par IA)

1. **Carte mentale** (`mindmaps`) : tu fournis l'arbre, le moteur calcule la disposition. `layout: "radial"` (par défaut), `"balanced"` (gauche/droite, idéal pour 3 à 6 branches au texte long), `"tree"` ou `"tree-down"`. 3 à 6 branches principales, des libellés courts (2 à 6 mots), `icon` (noms Lucide listés dans SCHEMA.md) sur les branches principales, `note` pour un détail affiché au toucher, `links` (en pointillés) pour relier deux idées éloignées.
2. **Schéma déclaratif** (`diagrams` avec `shapes`) : rectangles, cercles, flèches, textes, axes et courbes (`plot` avec une expression comme `"2x^2 - 1"`), points, accolades, groupes et animations simples. Les couleurs sont **uniquement des noms de tokens** (`accent`, `info-soft`, `success`…), jamais de code hexadécimal. Dessine sur une grille de 360 px de large environ.
3. **Visuel JavaScript** (`type: "script"`) : seulement si le déclaratif ne suffit pas (simulation, curseurs interactifs, animation). Le code tourne dans un bac à sable sans réseau ni stockage, avec l'objet `api` (voir SCHEMA.md, section 6).
4. **Images d'origine** : si un schéma du document doit être légendé tel quel, joins l'image (base64 dans `assets`, ou fichier dans un `.zip`).

**Contrôle visuel obligatoire** :
```bash
node skill/tools/preview.mjs pack.json preview-out
```
Ouvre **chaque PNG** et vérifie : textes lisibles, aucun chevauchement, flèches au bon endroit. Pour les exercices « schéma à légender », les zones apparaissent en pointillés rouges : chacune doit tomber à côté de l'élément visé, sur un espace libre. Corrige, puis relance.

## Étape 7 — Créer les exercices sur mesure

Pour chaque notion, choisis le type adapté :

| Objectif | Type |
|---|---|
| Mémoriser par cœur (définition, formule, date) | `flashcard` |
| Discriminer des propositions proches | `mcq` (une ou plusieurs bonnes réponses) |
| Vérifier une affirmation, débusquer une idée fausse | `truefalse` |
| Appliquer vite, sur papier (calcul court, mini-rédaction) | `quick` |
| Rédiger comme au contrôle, avec un barème | `exam` (avec `steps` notés) |
| Réponse exacte courte (nombre, mot) | `short` (avec `answers` et `tolerance`) |
| Relier des paires (date et événement, mot et traduction) | `match` |
| Chronologie, étapes d'une méthode | `order` |
| Phrase clé à compléter | `cloze` |
| Légender un schéma | `label` |
| Trier en catégories | `categorize` |

Règles :
- **Chaque réponse est justifiée par le cours** : ajoute `explanation` dès qu'elle aide, et `source` partout (`"doc1 p. 3"`).
- QCM : des distracteurs plausibles et tirés du cours (confusions classiques), jamais absurdes. Ajoute `explanation` sur les choix faux quand c'est utile.
- `quick` et `exam` : renseigne `lines`, le nombre de lignes pointillées laissées pour répondre (environ 1 ligne pour 12 mots attendus). Le téléphone sert à lire, l'élève écrit sur papier.
- `exam` : découpe le corrigé en `steps` avec des `points`. La somme doit valoir `points`.
- Glisser-déposer (`cloze`, `label`, `match`, `categorize`) : **ajoute toujours 2 à 3 `decoys`** (étiquettes pièges) plausibles. Elles ne s'affichent qu'en mode difficile.
- `short` : liste toutes les écritures acceptables (`["0,5", "1/2", "0.5"]`). Pour un nombre, ajoute `tolerance`.
- Des identifiants **stables et parlants** (`fc-def-cellule`, `qcm-noyau`). Ne les change jamais d'une version à l'autre : c'est ce qui permet la mise à jour sans perdre la progression.
- Varie la difficulté (`difficulty` 1, 2 ou 3) et couvre toutes les notions clés.

## Étape 8 — Assembler le fichier

- Un seul `pack.json` (UTF-8). Avec des images lourdes, livre un `.zip` contenant `pack.json` et un dossier `images/`. Chaque asset porte alors `"file": "images/nom.png"`.
- Renseigne `meta` : `title`, `generator` (ton nom), `createdAt`, `request` (la demande résumée), `sources` (chaque document) et `notes` (ce qui manquait ou était illisible).

## Étape 9 — Tout vérifier

```bash
node skill/tools/validate.mjs pack.json      # doit finir par « RÉSULTAT : OK »
node skill/tools/preview.mjs pack.json preview-out
```
Puis relis toi-même, en te demandant :
1. Chaque affirmation se retrouve-t-elle dans les documents ? (Relis les transcriptions.)
2. Chaque réponse de QCM, vrai/faux et réponse courte est-elle **exacte** ? Refais les calculs.
3. Les corrigés d'examen respectent-ils le barème ?
4. Les formules s'affichent-elles ? (Antislashs doublés, `$` appariés : le validateur signale les `$` impairs.)
5. Les visuels sont-ils lisibles sur un téléphone de 390 px de large ?
6. La demande de l'utilisateur est-elle couverte, sans hors-sujet ?

## Étape 10 — Livrer

Donne le fichier `pack.json` (ou `.zip`), puis un court résumé : ce qui a été créé (nombres par type), les sources utilisées, et **ce qui n'a pas pu être fait ou vérifié**. L'utilisateur l'importe dans Tomette : **Aujourd'hui › Importer** (fichier, Téléchargements ou texte collé). L'app affiche un aperçu, puis demande validation pour chaque élément modifié.
