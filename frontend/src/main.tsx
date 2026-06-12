import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { redirectLegacyHash } from "./router/legacyHashRedirect";
import { captureChannelFromUrl } from "./lib/channel";
import "./index.css";

// Rewrite pre-A0 hash URLs (e.g. legalise.dev/#/matters/khan-...) to
// the canonical path form BEFORE the router mounts. Must come before
// render so the router never observes the hash form.
redirectLegacyHash();

// Remember a ?c= launch-channel tag (Gate 4 demand instrumentation)
// before navigation changes the URL.
captureChannelFromUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
