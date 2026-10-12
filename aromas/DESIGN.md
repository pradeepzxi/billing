---
name: Aromas
colors:
  surface: '#fff8f3'
  surface-dim: '#e0d9d2'
  surface-bright: '#fff8f3'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#faf2ec'
  surface-container: '#f4ece6'
  surface-container-high: '#efe7e0'
  surface-container-highest: '#e9e1db'
  on-surface: '#1e1b17'
  on-surface-variant: '#594139'
  inverse-surface: '#33302c'
  inverse-on-surface: '#f7efe9'
  outline: '#8d7168'
  outline-variant: '#e1bfb5'
  surface-tint: '#ab3500'
  primary: '#ab3500'
  on-primary: '#ffffff'
  primary-container: '#ff6b35'
  on-primary-container: '#5f1900'
  inverse-primary: '#ffb59d'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#5e5e5d'
  on-tertiary: '#ffffff'
  tertiary-container: '#9a9998'
  on-tertiary-container: '#313130'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd0'
  primary-fixed-dim: '#ffb59d'
  on-primary-fixed: '#390c00'
  on-primary-fixed-variant: '#832600'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e4e2e0'
  tertiary-fixed-dim: '#c8c6c4'
  on-tertiary-fixed: '#1b1c1b'
  on-tertiary-fixed-variant: '#464746'
  background: '#fff8f3'
  on-background: '#1e1b17'
  surface-variant: '#e9e1db'
typography:
  display-lg:
    fontFamily: Montserrat
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Montserrat
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Montserrat
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  button:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding-mobile: 20px
  container-padding-desktop: 64px
  gutter: 24px
  section-gap: 80px
---

## Brand & Style
The design system embodies a "Contemporary Editorial" aesthetic, blending high-end culinary magazine layouts with a high-velocity digital interface. It targets a youthful, urban demographic that values both speed and premium quality.

The visual direction prioritizes food photography through generous whitespace and a minimalist UI. The style utilizes **Minimalism** with a **Tactile** edge—using soft depth and organic shapes to feel approachable yet curated. The emotional response should be one of "effortless indulgence": the interface disappears, leaving only the vibrant, appetizing imagery of the food.

## Colors
The palette is anchored by **Aromas Orange**, a high-chroma, warm hue designed to stimulate appetite and signal energy. 

- **Primary (#FF6B35):** Used for primary actions, price points, and active states.
- **Secondary (#1A1A1A):** A deep charcoal for high-contrast typography and grounding elements.
- **Surface (#F9F7F5):** A warm, off-white "Bone" color used for section backgrounds to prevent visual fatigue and maintain a premium feel.
- **Neutral (#6B6661):** A desaturated taupe for secondary text and metadata.

## Typography
The typographic hierarchy uses a "High-Low" pairing strategy. 

- **Headlines:** Montserrat is utilized in heavy weights (Bold/ExtraBold) with tight tracking to create an editorial, commanding presence.
- **Body:** Inter provides maximum legibility for menu descriptions and long-form content.
- **Utility:** JetBrains Mono is strictly reserved for "Receipt-style" elements, including order IDs, pricing breakdowns, and timestamps, providing a technical contrast to the lush imagery.

## Layout & Spacing
The design system employs a **Fluid Grid** with exaggerated margins to enforce an editorial feel. 

- **Grid:** A 12-column layout on desktop, collapsing to 4 columns on mobile. 
- **Rhythm:** An 8px base unit scales all padding and margins. 
- **Negative Space:** Use "excessive" white space (Section-gap) between different categories (e.g., "Trending" vs "Offers") to allow the food photography to breathe. 
- **Asymmetry:** Occasionally break the grid with organic, curved decorative elements in the background to soften the geometric precision of the UI.

## Elevation & Depth
The system uses **Tonal Layering** combined with **Ambient Shadows**. 

- **Shadows:** Avoid harsh, black shadows. Use soft, highly diffused blurs with a slight warm tint (`rgba(255, 107, 53, 0.08)`) to make cards appear to hover gently above the warm-gray surface.
- **Layers:** Use the Bone (#F9F7F5) background as the base, with pure white (#FFFFFF) for interactive cards and floating containers.
- **Interaction:** On hover or press, elements should slightly scale (1.02x) rather than significantly increasing shadow depth, maintaining a sophisticated profile.

## Shapes
The shape language is defined by "Hyper-Rounded" geometry. 

- **Primary Cards:** Use a 24px radius to echo the friendly and modern brand personality.
- **Buttons & Chips:** Use a full pill-shape (100px) for high-frequency actions.
- **Masks:** Food imagery should often be placed in organic "blob" shapes or containers with asymmetric rounding (e.g., 80px top-left, 24px others) to create a custom, high-end feel.

## Components
- **Buttons:** Primary buttons are high-contrast (Orange background, White text) with a pill shape. Secondary buttons use a "Ghost" style with a 1px border.
- **Cards:** Food item cards use a vertical stack: high-quality image on top (no border-radius on bottom edge), followed by title and price in a padded white container (24px radius on bottom).
- **Chips:** For dietary filters (Vegan, Gluten-Free), use the Mono font on a Bone-colored background.
- **Input Fields:** Use an "Underline" style or a very soft, filled container (Bone #F9F7F5) with 12px rounding to keep the form look minimal.
- **Cart/Billing:** Use the Monospaced font for all numerical values. The "Total" should be the only element in the bill using the heavy Montserrat font.
- **Navigation:** A floating bottom bar on mobile with glassmorphic transparency (blur: 20px) and a subtle 1px border.