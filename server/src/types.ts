export interface Profile {
  id: number;
  name: string;
  site_domain: string;
  description: string | null;
  storage_state_path: string | null;
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
  extract_mode: string;
  extract_script: string | null;
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
  profile_login_status?: string | null;
  latest_snapshot: Snapshot | null;
}

export interface LoginSessionRead {
  profile_id: number;
  status: string;
  message: string;
}

export interface MonitorPreviewRead {
  monitor_id: number;
  url: string;
  profile_id: number | null;
  profile_name: string | null;
  screenshot_path: string | null;
  final_url: string | null;
  page_title: string | null;
  selector_content: string | null;
  status: string;
  error_message?: string | null;
}
