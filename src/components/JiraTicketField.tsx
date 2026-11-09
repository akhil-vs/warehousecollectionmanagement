import { normalizeJiraTicket } from '../lib/orderState';
import { IconTicket } from './Icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/** Optional COPS-###### Jira key. Canonicalizes on blur (e.g. `123456` → `COPS-123456`). */
export function JiraTicketField({ value, onChange, id }: Props) {
  return (
    <label className="field">
      <span className="icon-label">
        <IconTicket />
        Jira ticket (optional)
      </span>
      <input
        id={id}
        className="mono"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onBlur={() => {
          const canonical = normalizeJiraTicket(value);
          if (canonical && canonical !== value) onChange(canonical);
        }}
        placeholder="COPS-123456"
        autoComplete="off"
        spellCheck={false}
        maxLength={20}
        inputMode="text"
        aria-describedby={id ? `${id}-hint` : 'jira-ticket-hint'}
      />
      <span id={id ? `${id}-hint` : 'jira-ticket-hint'} className="field-hint">
        Format: COPS- then 6 digits
      </span>
    </label>
  );
}
