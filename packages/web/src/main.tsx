import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { createApi } from "./api";
import { ApiProvider } from "./api-context";
import { App } from "./App";
import { AuthProvider } from "./auth-context";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider api={createApi()}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ApiProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
