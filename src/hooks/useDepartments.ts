import { useEffect, useState } from 'react';
import type { Department } from '../types';
import { DEFAULT_DEPARTMENTS } from '../types';
import { subscribeDepartments } from '../lib/ordersApi';

export function useDepartments(): Department[] {
  const [departments, setDepartments] = useState<Department[]>([...DEFAULT_DEPARTMENTS]);

  useEffect(() => {
    return subscribeDepartments(setDepartments);
  }, []);

  return departments;
}

export function isDepartmentRole(
  role: string | null | undefined,
  departments: readonly string[],
): role is Department {
  return Boolean(role && departments.includes(role));
}
