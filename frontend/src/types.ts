export type TabId = "dashboard" | "monitors" | "profiles";

export type ExtractMode = "text" | "html" | "component";

export interface Profile {
  id: number;
  name: string;
  site_domain: string;
  description: string | null;
  login_status: string;
  created_at: string;
  updated_at: string;
}

export interface Monitor {
  id: number;
  name: string;
  url: string;
  selector: string;
  selector_type: string;
  extract_mode: ExtractMode;
  profile_id: number | null;
  interval_minutes: number;
  enabled: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  created_at: string;
}

export interface Snapshot {
  id: number;
  monitor_id: number;
  content: string | null;
  content_hash: string | null;
  screenshot_path: string | null;
  status: string;
  error_message: string | null;
  changed: boolean;
  fetched_at: string;
}

export interface DashboardItem {
  monitor: Monitor;
  profile_name: string | null;
  latest_snapshot: Snapshot | null;
}

export interface MonitorFormData {
  name: string;
  url: string;
  selector: string;
  selector_type: string;
  extract_mode: ExtractMode;
  profile_id: number | null;
  interval_minutes: number;
  enabled: boolean;
}

export interface ProfileFormData {
  name: string;
  site_domain: string;
  description: string | null;
}

export interface ComponentPayload {
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

export interface LoginSessionResponse {
  profile_id: number;
  status: string;
  message: string;
}

export interface MonitorPreview {
  monitor_id: number | null;
  url: string;
  profile_id: number | null;
  profile_name: string | null;
  screenshot_path: string | null;
  element_screenshot_path: string | null;
  final_url: string | null;
  page_title: string | null;
  selector_content: string | null;
  component_content: string | null;
  match_count: number;
  status: string;
  error_message: string | null;
}

export interface SelectorCandidate {
  selector: string;
  selector_type: string;
  label: string;
  tag: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface DiscoverSelectorsResult {
  url: string;
  profile_id: number | null;
  profile_name: string | null;
  screenshot_path: string | null;
  final_url: string | null;
  page_title: string | null;
  candidates: SelectorCandidate[];
  status: string;
  error_message: string | null;
}

export interface MonitorDraftPreviewRequest {
  url: string;
  selector: string;
  selector_type: string;
  extract_mode: ExtractMode;
  profile_id: number | null;
}

export const EXTRACT_MODE_LABELS: Record<string, string> = {
  text: "文本",
  html: "HTML",
  component: "组件",
};
