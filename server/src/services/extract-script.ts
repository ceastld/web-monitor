export interface RenderCapturePayload {
  type: "render";
  html: string;
}

export { runExtractScript } from "./extract-script.browser.js";
