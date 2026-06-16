# UI/UX review checklist — priority-ranked rule taxonomy

> Rule set adapted from **ui-ux-pro-max** (github.com/nextlevelbuilder/ui-ux-pro-max-skill),
> kept here as the audit rubric for the `ui-ux-qa-reviewer`. Standards referenced: WCAG 2.2,
> Apple HIG, Material Design (MD), Core Web Vitals. Cite the rule id (e.g. `touch-target-size`)
> in each finding. Review in priority order 1→10; weight Blocker/Major toward the higher tiers.

| Pri | Category | Impact | Key checks | Anti-patterns |
|-----|----------|--------|------------|---------------|
| 1 | Accessibility | CRITICAL | Contrast 4.5:1, alt text, keyboard nav, aria-labels | Removing focus rings; icon-only buttons w/o labels |
| 2 | Touch & Interaction | CRITICAL | ≥44×44px targets, 8px+ spacing, loading feedback | Hover-only reliance; instant (0ms) state changes |
| 3 | Performance | HIGH | WebP/AVIF, lazy load, reserve space (CLS<0.1) | Layout thrashing; cumulative layout shift |
| 4 | Style Selection | HIGH | Match product type, consistency, SVG icons | Mixing flat & skeuomorphic; emoji as icons |
| 5 | Layout & Responsive | HIGH | Mobile-first breakpoints, viewport meta, no h-scroll | Horizontal scroll; fixed px widths; disable zoom |
| 6 | Typography & Color | MEDIUM | Base 16px, line-height 1.5, semantic tokens | Body <12px; gray-on-gray; raw hex in components |
| 7 | Animation | MEDIUM | 150–300ms, motion conveys meaning, continuity | Decorative-only; animating width/height; no reduced-motion |
| 8 | Forms & Feedback | MEDIUM | Visible labels, error near field, helper text | Placeholder-only label; errors only at top |
| 9 | Navigation | HIGH | Predictable back, bottom nav ≤5, deep linking | Overloaded nav; broken back; no deep links |
| 10 | Charts & Data | LOW | Legends, tooltips, accessible colors | Color-alone meaning |

## 1. Accessibility (CRITICAL)
`color-contrast` (≥4.5:1 normal, 3:1 large; WCAG 1.4.3) · `focus-states` (visible 2–4px ring; 2.4.7) · `alt-text` · `aria-labels` (icon-only buttons; 4.1.2) · `keyboard-nav` (tab order = visual; 2.1.1) · `form-labels` (label[for]) · `skip-links` · `heading-hierarchy` (sequential h1→h6) · `color-not-only` (don't convey by color alone; 1.4.1) · `dynamic-type` (support text scaling) · `reduced-motion` (2.3.3) · `voiceover-sr` · `escape-routes` (cancel/back in modals) · `keyboard-shortcuts`

## 2. Touch & Interaction (CRITICAL)
`touch-target-size` (≥44×44pt / 48dp; WCAG 2.5.8) · `touch-spacing` (≥8px) · `hover-vs-tap` (don't rely on hover) · `loading-buttons` (disable + spinner on async) · `error-feedback` (near problem) · `cursor-pointer` · `gesture-conflicts` · `tap-delay` (touch-action: manipulation) · `standard-gestures` · `system-gestures` · `press-feedback` (ripple/highlight) · `haptic-feedback` · `gesture-alternative` (visible control for critical actions) · `safe-area-awareness` · `no-precision-required` · `swipe-clarity` · `drag-threshold`

## 3. Performance (HIGH)
`image-optimization` (WebP/AVIF, srcset, lazy) · `image-dimension` (width/height or aspect-ratio; CLS) · `font-loading` (font-display: swap/optional) · `font-preload` · `critical-css` · `lazy-loading` · `bundle-splitting` · `third-party-scripts` (async/defer) · `reduce-reflows` · `content-jumping` (reserve space) · `lazy-load-below-fold` · `virtualize-lists` (50+ items) · `main-thread-budget` (<16ms/frame) · `progressive-loading` (skeleton >1s) · `input-latency` (<100ms) · `tap-feedback-speed` (<100ms) · `debounce-throttle` · `offline-support` · `network-fallback`

## 4. Style Selection (HIGH)
`style-match` · `consistency` (same style all pages) · `no-emoji-icons` (SVG: Heroicons/Lucide) · `color-palette-from-product` · `effects-match-style` · `platform-adaptive` (iOS HIG vs MD) · `state-clarity` (distinct hover/pressed/disabled) · `elevation-consistent` (one shadow scale) · `dark-mode-pairing` · `icon-style-consistent` (one icon set) · `system-controls` · `blur-purpose` · `primary-action` (one primary CTA per screen; rest subordinate)

## 5. Layout & Responsive (HIGH)
`viewport-meta` (never disable zoom) · `mobile-first` · `breakpoint-consistency` (375/768/1024/1440) · `readable-font-size` (≥16px mobile body) · `line-length-control` (35–60 mobile, 60–75 desktop) · `horizontal-scroll` (none on mobile) · `spacing-scale` (4/8pt) · `touch-density` · `container-width` (consistent max-width) · `z-index-management` (layered scale) · `fixed-element-offset` · `scroll-behavior` (no nested scroll fights) · `viewport-units` (min-h-dvh over 100vh) · `orientation-support` · `content-priority` · `visual-hierarchy` (size/spacing/contrast, not color alone)

## 6. Typography & Color (MEDIUM)
`line-height` (1.5–1.75 body) · `line-length` (65–75ch) · `font-pairing` · `font-scale` (12/14/16/18/24/32) · `contrast-readability` · `text-styles-system` (Dynamic Type / MD type roles) · `weight-hierarchy` (700 head / 400 body / 500 label) · `color-semantic` (tokens not raw hex) · `color-dark-mode` (desaturated, not inverted) · `color-accessible-pairs` (4.5:1 AA / 7:1 AAA) · `color-not-decorative-only` · `truncation-strategy` (wrap > truncate; ellipsis + tooltip) · `letter-spacing` · `number-tabular` (tabular figures for data/prices) · `whitespace-balance`

## 7. Animation (MEDIUM)
`duration-timing` (150–300ms micro, ≤400ms complex) · `transform-performance` (transform/opacity only) · `loading-states` (skeleton >300ms) · `excessive-motion` (1–2 elements/view) · `easing` (ease-out enter, ease-in exit) · `motion-meaning` · `state-transition` (animate, don't snap) · `continuity` · `parallax-subtle` · `spring-physics` · `exit-faster-than-enter` (~60–70%) · `stagger-sequence` (30–50ms/item) · `shared-element-transition` · `interruptible` · `no-blocking-animation` · `fade-crossfade` · `scale-feedback` (0.95–1.05 on press) · `gesture-feedback` · `hierarchy-motion` · `motion-consistency` (unified tokens) · `opacity-threshold` · `modal-motion` (from trigger source) · `navigation-direction` (fwd left/up, back right/down) · `layout-shift-avoid`

## 8. Forms & Feedback (MEDIUM)
`input-labels` (visible, not placeholder-only) · `error-placement` (below field) · `submit-feedback` (loading→success/error) · `required-indicators` · `empty-states` (helpful message + action) · `toast-dismiss` (3–5s) · `confirmation-dialogs` (destructive) · `input-helper-text` · `disabled-states` (opacity 0.38–0.5 + cursor + attr) · `progressive-disclosure` · `inline-validation` (on blur, not keystroke) · `input-type-keyboard` · `password-toggle` · `autofill-support` · `undo-support` · `success-feedback` · `error-recovery` (retry/edit/help path) · `multi-step-progress` · `form-autosave` · `sheet-dismiss-confirm` (unsaved changes) · `error-clarity` (cause + fix, not "Invalid input") · `field-grouping` · `read-only-distinction` · `focus-management` (focus first invalid field) · `error-summary` (anchor links) · `touch-friendly-input` (≥44px) · `destructive-emphasis` (danger color, separated) · `toast-accessibility` (aria-live=polite, no focus steal) · `aria-live-errors` (role=alert) · `contrast-feedback` (4.5:1) · `timeout-feedback`

## 9. Navigation (HIGH)
`bottom-nav-limit` (≤5) · `drawer-usage` (secondary nav) · `back-behavior` (predictable, preserve state) · `deep-linking` · `tab-bar-ios` · `top-app-bar-android` · `nav-label-icon` (both icon + text) · `nav-state-active` (highlight current) · `nav-hierarchy` (primary vs secondary) · `modal-escape` (clear close; swipe-down mobile) · `search-accessible` · `breadcrumb-web` (3+ levels) · `state-preservation` (scroll/filter/input on back) · `gesture-nav-support` · `tab-badge` · `overflow-menu` · `bottom-nav-top-level` · `adaptive-navigation` (sidebar ≥1024px) · `back-stack-integrity`

## 10. Charts & Data (LOW)
`chart-legends` · `chart-tooltips` · `chart-accessible-colors` (don't rely on color alone — add labels/patterns) · `chart-axis-labels` · `chart-empty-state`
