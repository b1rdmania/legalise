/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// @lottiefiles/lottie-player web component (loaded via CDN script tag in
// index.html). React 19 reads JSX from the React namespace. The
// `import 'react'` keeps this as a module augmentation, not a
// replacement of the React module's exports.
import type React from "react";
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "lottie-player": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          autoplay?: boolean;
          loop?: boolean;
          speed?: string | number;
          background?: string;
          renderer?: string;
          mode?: string;
        },
        HTMLElement
      >;
    }
  }
}
