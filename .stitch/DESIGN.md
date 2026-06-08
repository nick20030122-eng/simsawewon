# Design System — 심사위원 챗봇

## 1. Mood
Professional, trustworthy, modern dark dashboard. Public-sector evaluation tool feel — not playful.

## 2. Color
- Background: deep gradient `#050508` → `#0a1628` → `#1a0a12`
- Accent blue: `#5eb3ff`, `#93c5fd`
- Accent rose: `#ff6b7a`
- Text primary: `#c8d4ec`
- Text muted: `#6b7a94`, `#8b9cb8`
- Card: rgba(18,22,36,0.92) with border rgba(90,130,210,0.18)
- Hero title: gradient text blue → white → rose

## 3. Typography
- Headline: bold 800, large (2.5rem+)
- Body: clean sans (Inter or similar)
- Labels: uppercase small caps, letter-spacing 0.12em

## 4. Components
- 3-column upload cards (기획서 / README / 실행 코드)
- Each card: icon, title, hint, file upload area, textarea fallback
- Primary CTA: full-width "심사 시작" button
- Tabs: "채점" | "채점 기준"
- Score hero: large total score
- 3 domain metric cards
- Review: strengths (blue) / risks (rose) / final verdict

## 5. Layout
- DESKTOP 1280px wide
- Logo top-left fixed
- Centered max-width content ~1100px
- Rounded corners 14px on cards

## 6. Design System Notes for Stitch Generation (REQUIRED IN PROMPTS)

**DESIGN SYSTEM (REQUIRED):**
- Dark mode only
- Background: diagonal gradient black-navy with subtle blue (top-left) and rose (bottom-right) radial glows
- Font: Inter or Geist, Korean-friendly
- Cards: glassmorphism, 14px radius, thin blue border
- Primary button: blue gradient, full width
- Accent colors: blue #5eb3ff for public sector, cyan for README, rose #ff6b7a for code/risk
- Hero title gradient text: blue → lavender → rose
- Professional Korean government-adjacent SaaS aesthetic
- INNOCURVE AI logo placeholder top-left (text or image area)
- No sidebar; top tabs only
