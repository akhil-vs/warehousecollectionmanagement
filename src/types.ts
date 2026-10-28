export const DEPARTMENTS = ['B2B', 'Therabody'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export type DeviceRole = 'admin' | 'dock' | Department;

export type OrderStatus = 'ready' | 'arrived' | 'collected';

export type EventType =
  | 'ready'
  | 'driver_collection'
  | 'acknowledged'
  | 'collected'
  | 'removed'
  | 'reopened'
  | 'lookup_sent'
  | 'lookup_found'
  | 'lookup_closed';

export type LookupStatus = 'open' | 'found' | 'closed';

export interface Order {
  id: string;
  status: OrderStatus;
  pallets: number;
  bay?: string;
  department: Department;
  readyBy: string;
  readyAt: number;
  arrivedBy?: string;
  arrivedAt?: number;
  ackBy?: string;
  collectedBy?: string;
  collectedAt?: number;
}

export interface AppEvent {
  id: string;
  type: EventType;
  orderId: string;
  department?: Department | string;
  operator: string;
  at: number;
}

export interface Lookup {
  id: string;
  orderId: string;
  sentBy: string;
  at: number;
  status: LookupStatus;
}

export type TabId =
  | 'pallet-ready'
  | 'driver-collection'
  | 'history'
  | 'admin';
