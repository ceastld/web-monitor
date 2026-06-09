export interface AuthHintSignals {
  loginPath: boolean;
  loginTitle: boolean;
  hasPassword: boolean;
  hasLoginForm: boolean;
  hostChanged: boolean;
  pathChanged: boolean;
}

export interface AuthHintResult {
  likely_auth_failure: boolean;
  page_url: string;
  page_title: string;
  signals: AuthHintSignals;
}

export declare function analyzeAuthHint(expectedUrl: string): AuthHintResult;
