interface Props {
  operator: string;
  onConfirm: () => boolean;
}

export function ShiftBanner({ operator, onConfirm }: Props) {
  const missing = !operator.trim();
  return (
    <div className="shift-banner" role="status">
      <div>
        <strong>{missing ? 'Enter your name for this shift' : 'Confirm operator for this shift'}</strong>
        <p>
          {missing
            ? 'Actions are blocked until a name is typed and confirmed.'
            : `Logged in names expire after 8 hours. Confirm that you are ${operator.trim()}.`}
        </p>
      </div>
      <button type="button" className="btn primary" disabled={missing} onClick={() => onConfirm()}>
        Confirm shift
      </button>
    </div>
  );
}
