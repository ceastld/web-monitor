import { useEffect, useRef, useState } from "react";
import { apiSend } from "../api/client";
import { useToast } from "../context/ToastContext";
import type { ProfileFormData } from "../types";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const defaultForm: ProfileFormData = {
  name: "",
  site_domain: "",
  description: null,
};

export function ProfileDialog({ open, onClose, onSaved }: ProfileDialogProps) {
  const { showToast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ProfileFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open) setForm(defaultForm);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await apiSend("POST", "/api/profiles", {
        name: form.name.trim(),
        site_domain: form.site_domain.trim(),
        description: form.description?.trim() || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "创建失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} onClose={onClose} onCancel={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <h3>新建登录配置档</h3>
        <label>
          名称
          <input
            required
            placeholder="github-工作账号"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </label>
        <label>
          站点域名
          <input
            required
            placeholder="github.com"
            value={form.site_domain}
            onChange={(e) => setForm((prev) => ({ ...prev, site_domain: e.target.value }))}
          />
        </label>
        <label>
          说明
          <textarea
            rows={2}
            value={form.description ?? ""}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, description: e.target.value || null }))
            }
          />
        </label>
        <div className="dialog-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="primary-btn" disabled={saving}>
            创建
          </button>
        </div>
      </form>
    </dialog>
  );
}
