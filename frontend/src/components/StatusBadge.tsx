interface StatusBadgeProps {
  status: string | null | undefined;
  kind?: "monitor" | "login";
}

export function StatusBadge({ status, kind = "monitor" }: StatusBadgeProps) {
  if (kind === "login") {
    if (status === "logged_in") return <span className="status success">已登录</span>;
    if (status === "expired") return <span className="status error">登录失效</span>;
    if (status === "logging_in") return <span className="status warning">登录中</span>;
    return <span className="status pending">未登录</span>;
  }

  if (status === "success") return <span className="status success">正常</span>;
  if (status === "error") return <span className="status error">失败</span>;
  return <span className="status pending">待抓取</span>;
}
