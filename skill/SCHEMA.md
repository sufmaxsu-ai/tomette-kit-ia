# Référence du format « tomette-pack » (version 1)

Le fichier est un JSON UTF-8, éventuellement placé dans un `.zip` avec des images. Le schéma JSON formel est `skill/schema.json`. Le validateur fait foi : `node skill/tools/validate.mjs pack.json`.

## 1. Structure générale

```json
{
  "format": "tomette-pack",
  "version": 1,
  "meta": {
    "title": "SVT — la cellule",
    "generator": "Nom de l'IA",
    "createdAt": "2026-03-01",
    "language": "fr",
    "request": "Fais-moi des fiches et un QCM sur la cellule",
    "notes": "La photo 3 était floue en bas : la partie sur les virus n'est pas reprise.",
    "sources": [
      { "id": "doc1", "label": "Cours photo 1 à 3", "type": "image" },
      { "id": "web1", "label": "Exercices académie X", "type": "web", "url": "https://…" }
    ]
  },
  "subjects": [ /* classeurs (matières) */ ],
  "assets": [ /* images (facultatif) */ ]
}
```

**Identifiants** (`id`) : lettres, chiffres, `-`, `_` et `.`, 80 caractères au maximum, et commencent par une lettre ou un chiffre. Ils sont **stables** : un même `id` désigne le même élément d'une version à l'autre.

## 2. Classeur (`subjects[]`) et cours (`courses[]`)

```json
{
  "id": "svt-2nde", "title": "SVT", "icon": "leaf", "tone": "success",
  "level": "Seconde", "description": "…", "examDate": "2026-06-15",
  "courses": [{
    "id": "svt-cellule", "title": "La cellule", "summary": "…", "order": 1,
    "lessons":  [ { "id": "cours", "title": "…", "body": "markdown enrichi", "source": "doc1" } ],
    "mindmaps": [ … ],
    "diagrams": [ … ],
    "items":    [ … ]
  }]
}
```
- `tone` : `accent` (tomette), `success` (sauge), `highlight` (miel), `info` (ardoise).
- `icon` : un nom de la liste d'icônes (section 8).
- **Fusion à l'import.** Un classeur est retrouvé par son `id`, sinon par son titre. Un cours est retrouvé par son `id`, sinon par son titre dans le classeur cible. Dans un cours existant, les leçons, cartes, schémas et exercices de même `id` sont **proposés en mise à jour** : l'utilisateur valide chacun, l'ancienne version est archivée et la progression gardée. Les nouveaux éléments sont ajoutés. Rien n'est jamais supprimé.

## 3. Exercices (`items[]`)

Champs communs (tous facultatifs sauf `id` et `type`) : `source` (ex. `"doc1 p. 2"`), `explanation` (markdown), `hint` (indice), `tags` (liste), `difficulty` (1, 2 ou 3). Les textes acceptent le markdown en ligne et les formules `$…$`.

| type | champs obligatoires | champs utiles |
|---|---|---|
| `flashcard` | `front`, `back` | `explanation` |
| `mcq` | `question`, `choices[]` `{text, correct}` (≥ 2, au moins 1 vrai) | `choices[].explanation`, `multiple` (déduit), `shuffle` (vrai par défaut) |
| `truefalse` | `statement`, `answer` (booléen) | `correction` |
| `quick` | `question`, `answer` | `lines` (lignes pointillées, 3 par défaut) |
| `exam` | `question` et (`answer` ou `steps[]`) | `context`, `points`, `steps[]` `{text, points, detail}`, `lines` (8), `duration` (minutes) |
| `short` | `question`, `answers[]` | `tolerance` (écart numérique admis), `unit`, `caseSensitive`, `accents` (faux : accents ignorés) |
| `match` | `pairs[]` `{left, right}` (≥ 2) | `prompt`, `decoys[]` (fausses réponses à droite) |
| `order` | `items[]` **dans le bon ordre** (≥ 2) | `prompt` |
| `cloze` | `text` avec trous `{{réponse}}` ou `{{réponse|variante}}` | `prompt`, `decoys[]` |
| `label` | (`diagram` = id de schéma, ou `image` = id d'asset), `zones[]` `{x, y, answer}` | `prompt`, `decoys[]` |
| `categorize` | `categories[]` `{name, items[]}` (≥ 2) | `prompt`, `decoys[]` (à laisser hors catégorie) |

Précisions :
- `label.zones[].x` et `y` sont des **pourcentages** (0 à 100) de la largeur et de la hauteur du schéma ou de l'image. Chaque zone est le **centre** d'une case d'environ 88 × 40 px : place-la dans un espace libre, au bout d'un trait de rappel.
- Les `decoys` n'apparaissent qu'en mode **Difficile**. Mets-en toujours 2 ou 3.
- `exam` : l'élève coche les `steps` réussis. La réponse compte « juste » à partir de 50 % des points.

## 4. Markdown enrichi (`lessons[].body`)

Le HTML brut n'est **jamais** interprété. Il est affiché tel quel.

En ligne : `**gras**`, `*italique*`, `==surligné==`, `~~barré~~`, `` `code` ``, `x^2^` (exposant), `H,,2,,O` (indice), `$\frac{a}{b}$`, `[texte](https://…)`. Retour à la ligne forcé : terminer la ligne par `\`.

Blocs : `#` à `####`, listes `-` et `1.` (indentation de 2 espaces pour imbriquer), `> citation`, `---`, tableaux `| a | b |` + `|---|---|`, code entre ```, formule en bloc `$$ … $$`.

Encadrés (fermés par `:::` seul sur sa ligne, avec un titre facultatif après le type) :

```
:::definition Cellule
Texte en **markdown**, listes, formules…
:::
```
Types : `definition`, `theoreme`, `propriete`, `loi`, `exemple`, `methode`, `attention`, `retenir`, `remarque`, `astuce`, `formule`, `date`, `personnage`, `citation`.

Blocs spéciaux :

```
:::reveal Question posée ?
Réponse cachée, révélée au toucher.
:::

:::timeline
- 1789 : Prise de la Bastille
- 1792 | Proclamation de la République
:::

:::vocab
mot = traduction ou définition
:::

:::steps Titre facultatif
- Étape 1
- Étape 2
:::

:::columns
Colonne de gauche
+++
Colonne de droite
:::
```

Directives sur une seule ligne (sans `:::` fermant) :
```
:::diagram id-du-schema | Légende facultative
:::mindmap id-de-la-carte | Texte du bouton
:::image id-asset | Légende
:::source doc1 p. 3
```

## 5. Schémas déclaratifs (`diagrams[]`)

```json
{ "id": "coeur", "title": "Le cœur", "width": 360, "height": 280, "background": "none", "shapes": [ … ] }
```
Le repère est en pixels, avec l'origine en haut à gauche. Largeur conseillée : 360 (l'écran fait 350 px utiles, le schéma est mis à l'échelle).

**Couleurs** : uniquement des noms de tokens. On trouve `text-1`, `text-2`, `text-3`, `accent`, `accent-strong`, `accent-soft`, `highlight`, `highlight-soft`, `success`, `success-soft`, `info`, `info-soft`, `warning`, `warning-soft`, `error`, `error-soft`, `surface-1`, `surface-2`, `card-back`, `bg`, `border`, `border-strong` et `none`. Alias acceptés : `text`, `muted`, `paper`. Ces couleurs suivent automatiquement le thème clair ou sombre.

Propriétés communes : `fill`, `stroke`, `strokeWidth` (1,5 par défaut), `dash` (`true` ou `"6 4"`), `opacity`, `animate`.

| type | propriétés |
|---|---|
| `rect` | `x, y, w, h, r` (rayon), `text`, `textColor`, `size`, `bold` |
| `circle` | `cx, cy, r`, `text` |
| `ellipse` | `cx, cy, rx, ry`, `text` |
| `line` / `arrow` | `x1, y1, x2, y2`, `arrow` (`end`, `start`, `both`, `none`), `curve` (courbure en px), `text` |
| `polyline` / `polygon` | `points: [[x, y], …]`, `smooth` (polyline), `arrow` |
| `path` | `d` (commandes SVG M L H V C S Q T A Z uniquement) |
| `text` | `x, y, text` (`\n` pour aller à la ligne), `size` (`xs` 12, `sm` 13, `md` 15, `lg` 17, `xl` 20, `xxl` 28 ou un nombre), `align` (`start`, `middle`, `end`), `bold`, `italic`, `font` (`display` = Fraunces), `color`, `maxWidth` (retour à la ligne automatique), `rotate` |
| `label` | `x, y, text`, `tone` (étiquette sur fond doux) |
| `grid` | `x, y, w, h, step` |
| `axes` | `id`, `x, y, w, h` (cadre en px), `xmin, xmax, ymin, ymax`, `xstep, ystep`, `grid`, `ticks`, `xlabel`, `ylabel` |
| `plot` | `axes` (id), `fn` (ex. `"x^2 - 2x + 1"`, `"2sin(x)"`, `"exp(-x/2)"`), `from`, `to`, `color`, `label`, `labelX`, `params` |
| `point` | `x, y` (en unités des axes si `axes` est donné), `label`, `labelPos` (`n`, `s`, `e`, `w`, `ne`…), `hollow`, `guides` (pointillés vers les axes) |
| `arc` | `cx, cy, r, start, end` (degrés, 0 = droite, sens horaire), `text` |
| `brace` | `x1, y1, x2, y2, depth, text` |
| `image` | `asset`, `x, y, w, h`, `fit` (`contain` ou `cover`) |
| `group` | `x, y` (translation), `rotate`, `scale`, `shapes: […]` |

`line`, `arrow`, `text`, `label`, `point`, `polyline`, `polygon`, `circle` et `ellipse` acceptent aussi `axes` : leurs coordonnées sont alors exprimées en unités mathématiques.

Expressions de `plot` : `+ - * / ^`, parenthèses, multiplication implicite (`2x`), `x`, `pi`, `e` ; fonctions `sin cos tan asin acos atan sinh cosh tanh sqrt abs exp ln log log2 floor ceil round sign min max pow`.

`animate` : `"pulse" | "blink" | "draw" | "spin" | "float" | "flow" | "fade"`, ou `{ "type": "flow", "dur": 2000, "delay": 0 }`. Les animations sont coupées si l'utilisateur réduit les animations.

## 6. Visuels JavaScript (`diagrams[]` avec `type: "script"`)

```json
{ "id": "droite", "type": "script", "title": "f(x) = ax + b", "width": 360, "height": 260, "interactive": true, "code": "…" }
```
Le code (60 000 caractères au maximum) s'exécute dans une iframe isolée, sans réseau, sans stockage et sans accès à l'app. L'utilisateur peut le désactiver : prévois toujours une explication textuelle à côté. L'objet `api` donne accès à :
- `api.width`, `api.height`, `api.ctx` (canvas 2D, coordonnées en px CSS), `api.colors` (tokens en hex), `api.color(nom)` et `api.reducedMotion`.
- `api.clear(fond?)`, `api.line(x1, y1, x2, y2, {color, width, dash})`, `api.arrow(…)`, `api.circle(x, y, r, {fill, stroke})`, `api.rect(x, y, w, h, {fill, stroke, r})`, `api.poly(points, {fill, close})`, `api.text(s, x, y, {size, color, align, bold, italic, font})`.
- `api.axes({xmin, xmax, ymin, ymax, x, y, w, h, xlabel, ylabel, grid})` renvoie `b` avec `b.X(x)` et `b.Y(y)` ; `api.plot(x => …, b, {color, width, dash})`.
- `api.slider({label, min, max, step, value}, v => …)`, `api.button(label, fn)`, `api.loop((t, dt) => …)` (animation, appelée une seule fois si les animations sont réduites) et `api.onTap((x, y) => …)`.

## 7. Cartes mentales (`mindmaps[]`)

```json
{
  "id": "carte-cellule", "title": "La cellule",
  "layout": "radial",
  "spacing": 16, "levelGap": 48, "startAngle": -90, "sweep": 360,
  "edgeStyle": "curve", "rootShape": "pill", "maxNodeWidth": 168,
  "palette": ["accent", "info", "success", "highlight"], "collapseDepth": 0,
  "root": { "text": "La cellule", "children": [
    { "id": "noyau", "text": "Noyau", "icon": "dna", "color": "info", "note": "Contient l'ADN", "children": [ … ] }
  ]},
  "links": [ { "from": "noyau", "to": "membrane", "label": "eucaryotes" } ]
}
```
- `layout` : `radial` (par défaut), `balanced`, `tree` ou `tree-down`. `sweep` < 360 donne un éventail ; `startAngle` est en degrés (−90 = haut).
- Nœud : `text`, `id` (obligatoire s'il est relié par un lien), `icon`, `color` (`accent`, `info`, `success`, `highlight`, `neutral` ; les descendants héritent de la couleur de leur branche), `note` (affichée au toucher), `shape` (`note` = bord pointillé), `emphasis`, `collapsed` et `weight` (place angulaire en radial).
- `edgeStyle` : `curve`, `straight` ou `elbow`. `rootShape` : `pill` ou `circle`. `collapseDepth: 2` replie tout à partir du niveau 2.
- Conseils : de 3 à 6 branches, 2 à 6 mots par nœud, 60 nœuds au maximum pour rester lisible sur un téléphone.

## 8. Icônes disponibles (Lucide)

sun, moon, monitor, book-open, book, timer, chart, settings, download, upload, file-up, file-down, chevron-left, chevron-right, chevron-down, chevron-up, x, check, plus, minus, search, play, pause, square, rotate-ccw, layers, list-checks, circle-help, pen-line, network, shuffle, flame, target, clock, calendar-days, trash, pencil, history, bookmark, bookmark-check, file-text, image, copy, clipboard, clipboard-paste, info, circle-alert, triangle-alert, circle-check, lightbulb, quote, leaf, atom, flask, calculator, globe, landmark, languages, music, palette, brain, heart, dna, scale, feather, map, compass, sigma, code, puzzle, arrow-right-left, list-ordered, text-cursor, tags, grid, toggle, message, graduation-cap, volume, volume-off, vibrate, type, zoom-in, text-select, cpu, database, bot, folder-open, folder-search, eye, eye-off, hand, move, maximize, minimize, undo, star, hourglass, microscope, mountain, zap, users, building, coffee, sprout, bug, droplet, wind, thermometer, magnet, orbit, rocket, telescope, earth, sword, crown, scroll, gavel, briefcase, trending-up, coins, piggy-bank, factory, car, plane, ship, train, bike, house, tree, fish, bird, cat, dog, apple, pill, stethoscope, syringe, bone, eye-alt, ear, hand-alt, footprints, smile, activity, gauge, ruler, triangle, circle, hexagon, infinity, pi, percent, divide, binary, terminal, wifi, battery, plug, bulb, camera, film, mic, headphones, pen, highlighter, notebook, notebook-pen, library, school, flag, map-pin, link, unlink, key, lock, shield, package, archive, refresh, arrow-right, arrow-left, arrow-up, arrow-down, grip, more, sparkle, award, medal, trophy, calendar, alarm, bell, mail, share, external-link, list-tree, workflow, git-branch, route, signpost

## 9. Images (`assets[]`)

```json
{ "id": "coeur", "mime": "image/png", "data": "iVBORw0KGgo…", "alt": "Schéma du cœur" }
{ "id": "coeur", "file": "images/coeur.png" }
```
La première forme intègre l'image en base64. La seconde pointe vers un fichier du `.zip`. Types acceptés : png, jpeg, webp, gif, svg. Taille maximale : 4 Mo par image. Dans un `.zip`, une image non déclarée reçoit comme `id` son nom de fichier sans extension.

## 10. Limites et comportement de l'import

- L'import est **partiel** : un élément invalide est ignoré avec sa raison, le reste est importé. Vise zéro élément ignoré (`validate.mjs` → OK).
- Tailles maximales : 40 Mo par fichier et 5 000 exercices.
- Une sauvegarde complète de l'app a le format `tomette-backup` : ce n'est pas un pack.
