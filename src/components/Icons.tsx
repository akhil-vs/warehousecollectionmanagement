import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, className, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={['wh-icon', className].filter(Boolean).join(' ')}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Warehouse building — brand / setup */
export function IconWarehouse(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
      <path d="M9 21v-7h6v7" />
      <path d="M3.5 10.5h17" />
    </Icon>
  );
}

/** Stacked pallet */
export function IconPallet(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="5" rx="0.5" />
      <rect x="4.5" y="4" width="15" height="3" rx="0.5" />
      <path d="M3 16h18M5 16v4M12 16v4M19 16v4" />
    </Icon>
  );
}

/** Barcode / order scan */
export function IconBarcode(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 6v12M6 6v12M8 6v12M11 6v12M13 6v12M16 6v12M18 6v12M21 6v12" />
    </Icon>
  );
}

/** Bay / racking shelves */
export function IconBay(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 4v16M20 4v16M4 8h16M4 13h16M4 18h16" />
      <rect x="7" y="9.5" width="4" height="2.5" />
      <rect x="13" y="14.5" width="4" height="2.5" />
    </Icon>
  );
}

/** Calendar / collection date */
export function IconCalendar(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M12 14h2M16 14h2M8 17h2M12 17h2" />
    </Icon>
  );
}

/** Delivery truck — dock / collect */
export function IconTruck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M1 8h12v9H1z" />
      <path d="M13 11h5l3 3v3h-8z" />
      <circle cx="5.5" cy="18.5" r="1.75" />
      <circle cx="17.5" cy="18.5" r="1.75" />
      <path d="M1 12h12" />
    </Icon>
  );
}

/** History / clock */
export function IconHistory(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
      <path d="M4.5 5.5 3 4M19.5 5.5 21 4" />
    </Icon>
  );
}

/** Admin clipboard / board */
export function IconClipboard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1.5" />
      <path d="M9 4V3h6v1" />
      <path d="M8 10h8M8 14h8M8 18h5" />
    </Icon>
  );
}

/** Operator / person */
export function IconOperator(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
    </Icon>
  );
}

/** Search / magnifier */
export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </Icon>
  );
}

/** Dock door */
export function IconDoor(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="5" y="3" width="14" height="18" rx="1" />
      <path d="M15 12h1.5" />
      <path d="M5 21h14" />
    </Icon>
  );
}

/** Pencil edit */
export function IconEdit(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13 7 4 4" />
    </Icon>
  );
}

/** Cancel / close */
export function IconCancel(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
    </Icon>
  );
}

/** Check mark */
export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5 9.5 17 19 7" />
    </Icon>
  );
}

/** Alert / bell */
export function IconAlert(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5A5.5 5.5 0 0 1 12 3Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </Icon>
  );
}

/** Sound / speaker */
export function IconSound(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 10v4h3l5 4V6L7 10H4z" />
      <path d="M16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10" />
    </Icon>
  );
}

/** Package / box */
export function IconPackage(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 8.5 12 4l9 4.5v9L12 22 3 17.5z" />
      <path d="M12 13v9M3 8.5 12 13l9-4.5" />
    </Icon>
  );
}

/** Forklift (simplified) */
export function IconForklift(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 17h9v-7H8L6 7H3z" />
      <circle cx="6" cy="19" r="1.75" />
      <circle cx="11" cy="19" r="1.75" />
      <path d="M12 12h4l3-4h2v9h-2" />
      <path d="M19 8V4M17 4h4" />
    </Icon>
  );
}

/** Activity / list */
export function IconActivity(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 7h12M8 12h12M8 17h8" />
      <circle cx="4.5" cy="7" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Department / building floors */
export function IconDept(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="3" width="16" height="18" rx="1" />
      <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M11 21v-3" />
    </Icon>
  );
}
