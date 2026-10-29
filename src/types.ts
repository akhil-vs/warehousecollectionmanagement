export const DEPARTMENTS = ['B2B', 'Therabody'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type DeviceRole = 'admin' | 'dock' | Department;

export type OrderStatus = 'ready' | 'arrived' | 'collected' | 'cancelled';

export type EventType =
  | 'ready'
  | 'driver_collection'
  | 'driver_collection_cancelled'
  | 'acknowledged'
  | 'collected'
  | 'handover_exception'
  | 'removed'
  | 'cancelled'
  | 'reopened'
  | 'lookup_sent'
  | 'lookup_found'
  | 'lookup_closed'
  | 'lookup_ours'
  | 'lookup_not_ours'
  | 'updated';

export type LookupStatus = 'open' | 'found' | 'closed';

export type LookupResponse = 'ours' | 'not_ours';

export interface Order {
  id: string;
  status: OrderStatus;
  pallets: number;
  bay?: string;
  department: Department;
  collectionDate?: string;
  readyBy: string;
  readyAt: number;
  arrivedBy?: string;
  arrivedAt?: number;
  ackBy?: string;
  collectedBy?: string;
  collectedAt?: number;
  door?: string;
  haulier?: string;
  exceptionReason?: string;
  cancelledBy?: string;
  cancelledAt?: number;
}

export interface AppEvent {
  id: string;
  type: EventType;
  orderId: string;
  department?: Department | string;
  operator: string;
  at: number;
  note?: string;
}

export interface Lookup {
  id: string;
  orderId: string;
  sentBy: string;
  at: number;
  status: LookupStatus;
  responses?: Partial<Record<Department, LookupResponse>>;
}

export type TabId =
  | 'pallet-ready'
  | 'driver-collection'
  | 'history'
  | 'admin';
