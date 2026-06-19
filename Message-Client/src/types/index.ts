// TypeScript types for FPA Collections Agent

export type ClientStatus = 'pending' | 'partial' | 'paid' | 'disputed' | 'suspended';
export type EscalationLevel = 'friendly' | 'formal' | 'urgent' | 'final';
export type ScheduleFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type MessageChannel = 'email' | 'telegram' | 'system';
export type MessageStatus = 'sent' | 'failed' | 'pending' | 'cancelled';

export interface Client {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  amountDue: number;
  currency: string;
  status: ClientStatus;
  escalationLevel: EscalationLevel;
  messagesSent: number;
  lastMessageAt: string | null;
  dueDate: string | null;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: number;
  name: string;
  subject: string;
  body: string;
  escalationLevel: EscalationLevel;
  language: string;
  isDefault: boolean;
  createdAt: string;
}

export interface Schedule {
  id: number;
  clientId: number;
  frequency: ScheduleFrequency;
  timeOfDay: string;
  daysOfWeek: string;
  templateId: number | null;
  isActive: boolean;
  nextRun: string | null;
  createdAt: string;
  client?: Client;
  template?: Template;
}

export interface MessageLog {
  id: number;
  clientId: number;
  templateId: number | null;
  channel: MessageChannel;
  subject: string;
  body: string;
  status: MessageStatus;
  errorMessage: string;
  sentAt: string;
  client?: Client;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  category: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalClients: number;
  activeClients: number;
  totalDebt: number;
  messagesSentToday: number;
  messagesSentWeek: number;
  messagesSentMonth: number;
  paidThisMonth: number;
  responseRate: number;
}

export interface ImportResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
}
