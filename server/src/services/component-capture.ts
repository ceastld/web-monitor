export interface ComponentCapturePayload {
  type: "component";
  html: string;
  base_url: string;
  tag_name: string;
  node_count: number;
  stylesheets?: string[];
  css_variables?: string;
  capture_width?: number;
  capture_height?: number;
}

export { captureComponentElement } from "./component-capture.browser.js";
