# Design System

## Theme

A modern continuation of the existing Oregon practice identity: forest and moss tones, the original maroon accent, real photography, and generous true-white space. The physical scene is a patient reading on a phone in a quiet waiting room with daylight and natural wood, looking for reassurance and a direct next step.

## Color

- `--forest`: `oklch(0.34 0.045 137)` — header, footer, high-emphasis surfaces.
- `--moss`: `oklch(0.58 0.075 112)` — source-brand headings and selected actions.
- `--maroon`: `oklch(0.39 0.095 18)` — logo-derived accent, used sparingly.
- `--ink`: `oklch(0.25 0.025 270)` — body copy.
- `--muted`: `oklch(0.47 0.025 145)` — secondary text at accessible contrast.
- `--surface`: `oklch(0.965 0.008 135)` — brand-tinted section surface.
- `--white`: `oklch(1 0 0)` — main canvas.

Color strategy: restrained-to-committed. Forest anchors the global chrome; moss carries the inherited identity through headings and actions; maroon is a precise accent, not a second competing theme.

## Typography

- Display: `Forum`, the source identity, with Georgia fallback. Use for H1 and H2 at a fluid 1.25+ scale, never tighter than `-0.02em`.
- Body and controls: `Jost`, the source identity, with system sans fallback.
- Body copy: 17–19px, 1.7 line-height, maximum 72ch.
- H1: `clamp(2.6rem, 6vw, 5.5rem)`; H2: `clamp(2rem, 4vw, 3.5rem)`; H3: `clamp(1.3rem, 2vw, 1.65rem)`.

## Layout

- Global content width: 1180px; readable prose width: 72ch.
- Header: two-level desktop layout with logo, contact details and source-backed primary navigation; compact branded mobile header with horizontal navigation fallback.
- Page rhythm: 72–112px section spacing on desktop, 44–72px on mobile.
- Source article bands remain the fidelity boundary. Blocks can alternate image and text composition without changing their semantic order.
- Full-bleed photography is reserved for decisive hero moments. Ordinary media sits in a controlled two-column flow.

## Components

- Header and footer use global source evidence only and stay outside the audited fidelity root.
- Hero: prominent source H1 or first heading, strong image treatment when source media exists, no invented eyebrow or CTA.
- Text + Media: rich text with accessible measure; floated legacy images are converted visually into responsive media layouts through CSS only.
- CTA: full-surface forest treatment with source-backed action text; no side-stripe accents.
- Embed: responsive 16:9 frame.
- Form: visibly review-only and inert.
- Feature, Process, FAQ, Testimonial, Statistics, Gallery and Team modules remain typed and reusable even when this frozen estate does not exercise all families.

## Interaction & Motion

- Short color and transform transitions on navigation and actions only.
- No content is hidden pending animation.
- `prefers-reduced-motion: reduce` disables non-essential transitions.
- Focus rings use a high-contrast moss/white combination and remain visible on every interactive element.

## Responsive Behaviour

- 390px is a first-class viewport.
- At 720px and below, navigation uses an accessible 48px burger disclosure with visible focus, Escape-to-close and a no-JavaScript visible fallback. Desktop navigation remains unchanged.
- Media floats are neutralized under 760px and images become full-width.
- Tables and embeds scroll or scale within the viewport.
- Contact actions remain at least 44px high.
