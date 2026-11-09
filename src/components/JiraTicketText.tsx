interface Props {
  value?: string;
  /** When false, render nothing if the order has no ticket (cards/banners). */
  fallback?: boolean;
}

/** Shared Jira cell/label so tables never skip a saved ticket. */
export function JiraTicketText({ value, fallback = true }: Props) {
  if (!value) {
    return fallback ? <span className="muted">—</span> : null;
  }
  return <span className="mono jira-ticket">{value}</span>;
}
