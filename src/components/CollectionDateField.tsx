import { dateInputValueOffset, todayInputValue } from '../lib/format';
import { IconCalendar } from './Icons';

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  optional?: boolean;
  id?: string;
}

/** Date input with Today / Tomorrow shortcuts for warehouse operators. */
export function CollectionDateField({
  value,
  onChange,
  label = 'Collection date',
  optional = true,
  id,
}: Props) {
  const today = todayInputValue();
  const tomorrow = dateInputValueOffset(1);

  return (
    <label className="field collection-date-field">
      <span className="field-label-row">
        <span className="icon-label">
          <IconCalendar />
          {label}
          {optional ? ' (opt)' : ''}
        </span>
        {value ? (
          <button type="button" className="field-clear" onClick={() => onChange('')}>
            Clear
          </button>
        ) : null}
      </span>
      <div className="collection-date-controls">
        <button
          type="button"
          className={value === today ? 'btn ghost active-quick' : 'btn ghost'}
          onClick={() => onChange(today)}
        >
          Today
        </button>
        <input
          id={id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={value === tomorrow ? 'btn ghost active-quick' : 'btn ghost'}
          onClick={() => onChange(tomorrow)}
        >
          Tomorrow
        </button>
      </div>
    </label>
  );
}
