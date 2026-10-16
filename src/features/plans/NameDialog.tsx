import { useEffect, useState } from 'preact/hooks';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';

export interface NameDialogProps {
  open: boolean;
  title: string;
  fieldLabel: string;
  initialValue?: string;
  submitLabel: string;
  emptyMessage: string;
  onSubmit: (name: string) => void | Promise<void>;
  onClose: () => void;
}

/** 單一名稱輸入的對話框（新增／重新命名週計畫、為課表命名）。空白時在欄位旁顯示錯誤。 */
export function NameDialog({ open, title, fieldLabel, initialValue = '', submitLabel, emptyMessage, onSubmit, onClose }: NameDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setError(undefined);
      setBusy(false);
    }
  }, [open, initialValue]);

  const submit = async () => {
    const name = value.trim();
    if (!name) {
      setError(emptyMessage);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(name);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button loading={busy} onClick={submit}>{submitLabel}</Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={fieldLabel} value={value} onChange={(v) => { setValue(v); if (error) setError(undefined); }} error={error} maxLength={30} autoComplete="off" />
      </form>
    </Modal>
  );
}
