export interface User {
  id: string;
  email: string;
  display_name?: string;
  name?: string;
  is_admin?: boolean;
  isAdmin?: boolean;
}
export interface Workspace {
  id: string;
  name: string;
  role: string;
}
export interface Plan {
  id: string;
  name: string;
  price_minor: number | null;
  currency: string;
  max_members: number;
}
export interface Payment {
  id: string;
  reference: string;
  plan_id: string;
  status: string;
  workspace_name?: string;
  email?: string;
  created_at: string;
  review_note?: string;
}
export interface Member {
  id: string;
  email: string;
  display_name: string;
  role: string;
}
export interface AdminUser extends User {
  suspended: boolean;
}
export interface Billing {
  subscription: {
    plan_id: string;
    effective_status: string;
    expires_at?: string;
  };
  payments: Payment[];
}
