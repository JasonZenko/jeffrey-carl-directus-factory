# Pearl developer workflow

This is the working contract for changing Pearl's Directus model, Astro blocks
and noindex preview. It explains the system boundary as well as the commands.

## The system in one line

```text
Directus collection fields
  -> typed snake_case Astro props
  -> one independent block component
  -> BlockRenderer
  -> ordered page blocks
  -> Astro static build
  -> audit gates
  -> noindex Cloudflare preview
```

Global design settings use a parallel path:

```text
Directus Pearl Theme Library singleton
  -> validated PearlTheme contract
  -> CSS custom properties on the document root
  -> every block plus shared header/footer
```

Directus owns content. Each Astro block owns the HTML and component-specific
CSS for one CMS block type. `BlockRenderer.astro` owns only the mapping from a
block type to its component. A page owns only the ordered composition of
blocks. These responsibilities must not be folded back together.

## Current status and boundaries

- Work from branch `pearl-template-v0.1`.
- Pearl renders canonical Directus records at `/template-preview/pearl/` when
  `PEARL_CONTENT_MODE=connected`; explicit fixture mode remains available for
  disconnected component development.
- The canonical Pearl schema and content are installed on the dedicated `pearlcms.foundryworks.ai` instance.
- The existing connected Jeffrey build and deployment use
  `weomcms.foundryworks.ai`.
- Live Pearl Directus fetching is fail-closed and uses a dedicated
  least-privilege server token.
- Pull requests run CI, but feature branches do not automatically deploy.
- A push to `pearl-template-v0.1` runs the connected gates and deploys the
  separate noindex Pearl Cloudflare review. Production, client DNS and indexing
  require separate approval.

Do not treat the fixture workshop as proof that live Pearl CMS content is
already reaching Astro.

## Repository boundaries

```text
template-adapters/pearl/
  v0.1.0/manifest.json        Directus fields, renderer names, mapping rules
  directus/                   Generated schema plan and guarded provisioner
  receipts/                   Machine-readable Pearl evidence

site/src/
  components/pearl/
    blocks/                   One self-contained component per CMS block
      BlockRenderer.astro     The only block-type -> component switch
    ui/                       Small reusable UI primitives
    fixtures.ts               Disconnected workshop data
    types.ts                  Exact Directus-shaped prop contracts
  layouts/pearl/              Pearl page shell
  lib/pearl/                  Collection bindings and design tokens
  pages/template-preview/     Noindex fixture workshop route
  styles/pearl.css            Shared reset, typography and foundations only
```

The `pearl/` namespace is deliberate. The same repository contains the
accepted Jeffrey implementation; mixing both templates into a global block
folder would create collisions and hidden coupling.

## Non-negotiable component rules

1. One Directus block collection maps to one Astro block component.
2. Component props use the exact Directus snake_case field names.
3. A component imports its prop type from `PearlRecordByBlock`; it does not
   invent a second view model with renamed fields.
4. The component contains its own semantic HTML and component-specific
   `<style>` block.
5. Shared CSS contains foundations only. Moving block selectors into
   `pearl.css` is not allowed.
6. Small visual primitives may live in `components/pearl/ui/`, but they must
   not know about Directus collections or page composition.
7. Layouts own the document shell, shared header/footer and slots. They do not
   contain block-type conditionals.
8. `BlockRenderer.astro` maps the discriminated `block.type` to one component.
   It must not contain block markup or styling.
9. Ordered child collections keep an explicit `sort` field and render in that
   order.
10. Images stay in file fields with independently editable alt text. Do not
    bury images, links, repeated items or complete sections inside Rich Text.
11. Unknown or ambiguous source regions stop for manual review. They do not
    silently fall back to generic Rich Text.
12. Jeffrey components, layouts, routes and accepted audit criteria remain
    untouched while Pearl is developed.
13. Global typography, colour and spacing belong in `pearl_theme_settings`.
    Do not hard-code a per-block substitute for a theme token.
14. Theme colours must pass `qa/pearl_reference_qa.py`; invalid hex values fall
    back to the canonical Pearl palette and inaccessible combinations block QA.

## First-time setup

```bash
git clone https://github.com/JasonZenko/jeffrey-carl-directus-factory.git
cd jeffrey-carl-directus-factory
git switch pearl-template-v0.1
git pull --ff-only

cd site
npm ci
npm run dev
```

Open:

```text
http://localhost:4321/template-preview/pearl/
```

Use `PEARL_CONTENT_MODE=fixture` for disconnected component work. Connected
work requires `PEARL_DIRECTUS_URL=https://pearlcms.foundryworks.ai` and the
least-privilege Pearl build token.

## Normal change workflow

### 1. Create a branch

Branch from the latest Pearl baseline, not from `main`:

```bash
git switch pearl-template-v0.1
git pull --ff-only
git switch -c pearl/<short-change-name>
```

### 2. Change the contract first

For a new block or a field change, update
`template-adapters/pearl/v0.1.0/manifest.json` first. Define:

- the unique block key;
- the Directus collection and carrier field;
- the renderer filename;
- every parent field and child field;
- required/optional status and field type;
- deterministic mapping evidence;
- allowed page blueprints.

The manifest is the source of truth. Code and schema must match it.

### 3. Inspect the schema plan

From the repository root:

```bash
node template-adapters/pearl/directus/provision-pearl-schema.mjs --json
```

This is dry-run only. Review the proposed collections, fields and relations.
Do not run `--apply` against any Directus instance unless the target and schema
change have been explicitly approved.

### 4. Add or update the exact type

Update `site/src/components/pearl/types.ts`:

- add the record interface using the manifest's exact field names;
- register it in `PearlRecordByBlock`;
- add its field list to `PEARL_FIELD_KEYS`;
- add ordered child fields to `PEARL_CHILD_FIELD_KEYS` when needed;
- let `PearlBlock` derive the discriminated union.

CI compares these field lists with the manifest. A renamed, missing or extra
prop fails the build.

### 5. Build one independent component

Create or update:

```text
site/src/components/pearl/blocks/<BlockName>.astro
```

Use the corresponding record type directly:

```astro
---
import type { PearlRecordByBlock } from '../types';

type Props = PearlRecordByBlock['flex_content_image'];
const { heading, body, image, image_alt, image_position } = Astro.props;
---

<section data-pearl-block="flex_content_image">
  <!-- semantic HTML owned by this block -->
</section>

<style>
  /* styles owned by this block */
</style>
```

Do not import another CMS block to assemble this one. Shared buttons or other
small primitives may be imported from `components/pearl/ui/`.

### 6. Register the block once

Add the block to:

- `site/src/components/pearl/blocks/BlockRenderer.astro`;
- `site/src/lib/pearl/directus.ts` for collection lookup;
- `site/src/components/pearl/fixtures.ts` with source-backed test data;
- the relevant Pearl tests.

Pages must render an ordered `PearlBlock[]` through `BlockRenderer`. Pages must
not import nine blocks and recreate the switch themselves.

### 7. Preview locally

From `site/`:

```bash
npm run dev
```

Review `/template-preview/pearl/` at desktop and mobile widths. Check:

- all expected blocks appear once;
- no horizontal overflow;
- images load and alt text is meaningful;
- headings remain hierarchical;
- links and controls are keyboard usable;
- the page remains `noindex, nofollow`;
- no production form submits or external side effects exist.

### 8. Run the local gates

From `site/`:

```bash
npm run build
npm test
```

The repository also protects the accepted Jeffrey estate. From the repository
root, the complete local gate is:

```bash
PORT=4321 node scripts/serve.mjs &
python3 auditor/audit_rendered.py --target http://127.0.0.1:4321 --strict
python3 qa/browser_matrix.py --target http://127.0.0.1:4321
python3 qa/visual_fidelity.py --target http://127.0.0.1:4321
python3 qa/pearl_reference_qa.py --target http://127.0.0.1:4321/template-preview/pearl/
```

Expected current results are 78/78 strict route fidelity, 18/18 browser checks,
18/18 visual checks and 3/3 Pearl responsive/WCAG checks. A failure blocks the
pull request; do not weaken the auditor to make a change pass.

### 9. Push and open a pull request

```bash
git add <only-the-intended-files>
git commit -m "describe the Pearl change"
git push -u origin pearl/<short-change-name>
gh pr create --base pearl-template-v0.1
```

The pull request CI performs a clean install, deterministic extraction,
connected Jeffrey build, contract tests, live authoring verification, strict
78-route audit, browser matrix and visual matrix.

Merge only after the checks are green and the component has been visually
reviewed. This updates the Pearl baseline; it does not deploy a feature branch.

## How page composition works

The page layer receives an ordered array shaped like this:

```ts
const blocks: PearlBlock[] = [
  { type: 'main_hero_standard', item: directusMainHeroRecord },
  { type: 'icon_feature_cards', item: directusIconCardsRecord },
  { type: 'feature_image_content', item: directusFeatureRecord },
];
```

The page loops over the array and passes each item to `BlockRenderer`. The
renderer selects the matching component. The component receives fields that
match its Directus record exactly and renders its own HTML/CSS.

The connected Pearl adapter therefore does only four things:

1. fetch the page and its ordered Builder/M2A block rows;
2. resolve each block's native Pearl collection and ordered children;
3. resolve Directus file IDs to asset URLs;
4. return `PearlBlock[]` or fail the build.

It must not rename fields, inject copy, substitute fixture data on failure or
silently collapse an unknown collection into Rich Text.

## Directus authoring flow

1. An editor changes a native field in a Pearl component collection.
2. The page Builder relationship determines block order.
3. Child records use their `sort` value.
4. A server-only build token reads published records at build time.
5. The adapter returns exact `PearlBlock[]` data.
6. Astro renders the matching independent components.
7. Any unknown collection, missing required field or failed CMS request stops
   the build. There is no connected-build fallback to fixtures.
8. A field-authority round trip must prove the edit appears on the preview and
   an exact revert restores the accepted output.

## Deployment flow

There are three distinct stages.

### A. Component-development pull request

```text
pearl/<change> -> pull request -> pearl-template-v0.1
```

- GitHub Actions runs the full build/test/audit suite.
- No Cloudflare deployment occurs from the feature branch.
- Merge means “accepted into the Pearl baseline,” not “deployed.”

### B. Noindex review deployment

After a reviewed pull request merges into `pearl-template-v0.1`:

1. `build-test.yml` reruns the connected build and all gates.
2. `deploy-pearl-review.yml` independently rebuilds and reruns the same gates.
3. Only a green deployment job uploads `site/dist` to the
   `pearl-template-review` Cloudflare Pages project.
4. The preview remains protected by meta robots, `X-Robots-Tag` and
   `robots.txt` noindex controls.

The GitHub environment needs these existing secrets:

- `PEARL_DIRECTUS_TOKEN`;
- `CLOUDFLARE_API_TOKEN`;
- `CLOUDFLARE_ACCOUNT_ID`.

Never put tokens in `.env` files committed to Git, Astro `PUBLIC_*` variables,
component props, screenshots or documentation.

### C. Production release

The noindex Cloudflare preview is not production. Production requires explicit
approval after all four Pearl gates pass:

1. source fidelity;
2. frontend fidelity;
3. authoring fidelity;
4. field authority.

DNS, indexing, forms, analytics and production credentials are outside the
normal component PR. Do not change them as part of a Pearl block edit.

## Definition of done

A Pearl change is complete only when:

- the manifest, schema plan, exact prop type and renderer agree;
- the block remains independently editable and styled;
- page composition goes through `BlockRenderer`;
- source-backed fixtures cover the change;
- build and tests pass;
- accepted Jeffrey routes still pass all independent gates;
- the pull request is green and visually reviewed;
- any live CMS field has a recorded edit-and-revert authority proof;
- no production, DNS, indexing or form behavior changed without approval.
