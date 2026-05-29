# DESIGN.md

## Product Context

V3 is a vending machine operations console for small business owners and operators. The product manages products, inventory, purchases, sales, refunds, loss records, profit, system settings, and AI-assisted data entry.

This is not a consumer shopping app and not a marketing website. The interface should feel like a professional business console: calm, clear, dense enough for daily work, and easy to scan under time pressure.

## Primary Users

- Store owner checking sales, profit, and stock risk.
- Operator entering purchases, sales, refunds, and stock adjustments.
- Admin configuring account security, AI model settings, and system parameters.

Users care most about speed, correctness, visibility of risk, and low-friction data entry.

## Design Direction

Use a restrained operations-dashboard style:

- Professional, clean, and pragmatic.
- Medium-high information density.
- Tables, filters, forms, and status indicators are first-class UI.
- Visual hierarchy should make money, stock quantity, status, and date easy to compare.
- Prefer quiet surfaces, crisp borders, semantic color, and strong alignment.
- Avoid decorative layouts that reduce operational efficiency.

Do not redesign this as a landing page, mobile app home screen, portfolio, or consumer storefront.

## Core Pages

### Dashboard

Purpose: give an at-a-glance business health summary.

Prioritize:

- Sales amount.
- Profit.
- Inventory risk.
- Recent trend.
- Operational exceptions.

The dashboard may use metric cards and charts, but metrics must stay compact and comparable. Avoid oversized hero sections.

### Products

Purpose: manage product master data.

Prioritize:

- Product image and name.
- Machine ownership.
- Selling price and cost.
- Status.
- Search and filtering.
- Fast edit actions.

Product lists should remain table/list oriented. Do not turn the page into a large gallery.

### Inventory

Purpose: inspect stock balances, movements, alerts, and adjustments.

Prioritize:

- Current stock quantity.
- Low stock and abnormal stock states.
- Machine/product relationship.
- Stock movement history.
- Clear adjustment entry points.

This is the most data-heavy area. Preserve scannability and horizontal table behavior.

### Purchases

Purpose: record incoming stock and purchase cost.

Prioritize:

- Purchase order date.
- Product line items.
- Quantity.
- Unit cost.
- Total amount.
- Image/AI-assisted recognition flow where available.

Forms should support fast repetitive entry. Keep actions clear and predictable.

### Sales

Purpose: record sales, refunds, loss, and profit-related activity.

Prioritize:

- Order type.
- Date.
- Product.
- Quantity.
- Sales amount.
- Refund/loss status.
- Profit-related figures where shown.

Use semantic status treatment so sales, refund, and loss are easy to distinguish.

### Settings

Purpose: configure account, security, AI provider, model routing, and system options.

Prioritize:

- Clear grouping.
- Safe handling of API key fields.
- Obvious save states.
- Calm, low-risk forms.

Settings should look secure and administrative, not promotional.

## Information Architecture

Keep the existing six primary destinations:

1. Dashboard
2. Products
3. Inventory
4. Purchases
5. Sales
6. Settings

Do not remove, rename, or merge these destinations unless explicitly requested.

Desktop navigation should remain sidebar-first. Mobile navigation should remain bottom-nav-first for the five core work pages, with settings still accessible from the top bar.

## Visual System

### Current Theme Foundation

The existing project uses CSS custom properties and supports these visual themes:

- Default light operations theme.
- Cyber dark theme.
- Crystal light glass theme.

The default design should stay the reference for production operations. Cyber and crystal can be refined, but they should not make the interface harder to read.

### Color

Base palette:

- Background: `#f6f8fb`
- Surface: `#ffffff`
- Muted surface: `#f1f4f8`
- Border: `#d9e0ea`
- Strong border: `#b7c2d2`
- Text: `#172033`
- Muted text: `#6b7280`
- Soft text: `#8a94a6`
- Primary action: `#2563eb`

Semantic colors:

- Inbound / positive: green.
- Outbound / negative: red.
- Warning / attention: amber.
- Info / neutral operation: teal.
- Danger / destructive: orange-red.

Use semantic color for state and meaning, not decoration. Avoid large gradients, decorative color blobs, and visually noisy backgrounds in the default theme.

### Typography

Use a Chinese-friendly operations UI stack:

`HarmonyOS Sans SC`, `Noto Sans SC`, `Microsoft YaHei UI`, `system-ui`, `sans-serif`.

Guidelines:

- Use tabular numbers for money, stock quantities, and metrics.
- Page titles should be compact and functional.
- Table text should be readable at dense sizes.
- Do not use oversized marketing headlines inside the app.
- Do not use negative letter spacing.

Suggested scale:

- Page title: 20-24px desktop, 17-20px mobile.
- Section title: 16-18px.
- Body/table text: 13-14px.
- Secondary metadata: 12-13px.
- Dense tags/badges: 12px.

### Spacing

Use an 8px-based rhythm with small increments:

- 4px for tiny internal gaps.
- 8px for compact component spacing.
- 12px for form/table cell breathing room.
- 16px for standard component padding.
- 24px for page-level spacing on desktop.
- 14px page padding on mobile.

The app should feel organized and efficient, not sparse.

### Radius And Shadow

Use restrained geometry:

- Small controls: 4-6px radius.
- Cards, panels, dialogs: 8px radius.
- Avoid pill-shaped controls unless the existing component already uses that pattern.
- Shadows should be subtle and functional.
- Borders should carry most separation in dense areas.

## Component Guidelines

### Tables

Tables are central to the product.

Requirements:

- Preserve table/list layouts for dense business data.
- Keep column alignment clear.
- Use tabular numerals for money and quantity.
- Use sticky or readable headers where useful.
- Use horizontal scrolling on mobile instead of forcing columns to wrap badly.
- Avoid replacing operational tables with large decorative cards.

### Filters

Filters should be compact and close to the table they control.

Good filters:

- Search.
- Date range.
- Machine.
- Product.
- Status.
- Type.

On mobile, filters may wrap or collapse, but they must remain reachable.

### Metric Cards

Metric cards should communicate business state quickly.

Each card should have:

- Short label.
- Main number.
- Optional trend or contextual helper.
- Semantic state only when meaningful.

Avoid making metric cards too tall or decorative.

### Forms And Dialogs

Forms are for repetitive operational entry.

Requirements:

- Clear labels.
- Predictable field order.
- Stable primary and secondary actions.
- Validation messages close to the field.
- Mobile-friendly touch targets.
- No hidden destructive action.

Use existing shared component concepts such as AppButton, AppInput, AppDialog, AppDrawer, DataTable, and StatusBadge when implementing the design.

### Status Badges

Status badges must be semantic and consistent:

- Success / completed / active.
- Warning / needs attention.
- Danger / destructive / failed.
- Neutral / draft / inactive.
- Info / processing.

Badges should be readable at table density.

### Navigation

Desktop:

- Left sidebar.
- Clear active state.
- Compact top bar.
- Content-first layout.

Mobile:

- Bottom navigation for the five core work pages.
- Top bar shows current page title.
- Settings entry remains accessible.
- Avoid side drawers for primary navigation unless explicitly requested.

## Mobile Requirements

Support these widths:

- 375px
- 390px
- 430px

Hard requirements:

- No horizontal page overflow.
- Tables may scroll horizontally inside their container.
- Top bar, bottom nav, dialogs, tables, and action bars must not overlap.
- Buttons and touch targets should be at least 44px high on mobile.
- Bottom content must not be hidden by iPhone safe area.
- Forms and filters should wrap or stack cleanly.

Mobile should preserve operational capability. Do not create a simplified design that hides core data needed for daily work.

## Desktop Requirements

Optimize for:

- 1280px
- 1440px
- 1920px

Desktop should use available width for comparison and scanning:

- Keep sidebar width controlled.
- Keep content max-width decisions intentional.
- Avoid over-wide text lines.
- Let tables use width naturally.
- Keep action buttons near the content they affect.

## Accessibility And Usability

Design for daily repeated use:

- Strong text contrast.
- Keyboard-visible focus states.
- Non-color-only status communication.
- Clear disabled states.
- Loading and empty states that explain what is happening.
- Confirm destructive actions.
- Avoid motion that distracts from data entry.

## Implementation Boundaries

When converting design into code:

- Keep the existing Nuxt 4 + Vue 3 structure.
- Reuse existing shared components before creating new ones.
- Do not change API fields, business meaning, or database assumptions.
- Do not hand-edit build output.
- Keep styles aligned with existing CSS variables.
- Prefer scoped component styles for component-specific layout.
- Use global CSS only for shared tokens, layout primitives, and cross-component utilities.

## Things To Avoid

Avoid:

- Marketing hero layouts.
- Large decorative illustrations.
- Generic SaaS landing-page composition.
- Replacing tables with oversized cards.
- Purple/blue gradient-dominant visual themes for the default UI.
- Excessive glassmorphism in data-heavy areas.
- Heavy shadows.
- Hiding operational actions behind vague menus.
- Changing field names, workflows, or business logic.

## Stitch Instructions

When using this file as input to Stitch, optimize the current UI rather than inventing a new product.

Expected output:

1. Overall visual direction.
2. Refined color, typography, spacing, radius, and shadow rules.
3. Page-by-page UI improvements for the six core pages.
4. Mobile adaptation guidance for 375px, 390px, and 430px.
5. Component-level implementation notes suitable for a Vue/Nuxt developer.

Do not output only a conceptual moodboard. The result should be concrete enough to implement in the existing codebase.
