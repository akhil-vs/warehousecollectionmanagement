import {
  JIRA_PROJECT_KEY,
  JIRA_TICKET_MAX_DIGITS,
  jiraTicketDigits,
} from '../lib/orderState';
import { IconTicket } from './Icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

/**
 * Optional Jira ticket number. Operators type digits only; `COPS-` is prefixed
 * automatically (`1234` → `COPS-1234`).
 */
export function JiraTicketField({ value, onChange, id }: Props) {
  const digits = jiraTicketDigits(value);
  const hintId = id ? `${id}-hint` : 'jira-ticket-hint';

  return (
    <label className="field">
      <span className="icon-label">
        <IconTicket />
        Jira ticket (opt)
      </span>
      <div className="jira-ticket-input">
        <span className="jira-prefix" aria-hidden="true">
          {JIRA_PROJECT_KEY}-
        </span>
        <input
          id={id}
          className="mono"
          value={digits}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, JIRA_TICKET_MAX_DIGITS);
            onChange(next ? `${JIRA_PROJECT_KEY}-${next}` : '');
          }}
          placeholder="420325"
          autoComplete="off"
          spellCheck={false}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={JIRA_TICKET_MAX_DIGITS}
          aria-describedby={hintId}
        />
      </div>
      <span id={hintId} className="field-hint">
        Type number. COPS- is added automatically.
      </span>
    </label>
  );
}
