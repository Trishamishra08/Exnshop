import api from "../config";

export interface ServiceControlItem {
  key: string;
  label: string;
  section: string;
  locked: boolean;
  enforced: boolean;
  enabled: boolean;
  note: string;
  updatedByName: string;
  updatedAt: string | null;
}
export interface ServiceControlLogItem {
  _id: string;
  key: string;
  label: string;
  from: boolean;
  to: boolean;
  note?: string;
  adminName?: string;
  createdAt: string;
}

export const getServiceControls = async (): Promise<{ sections: string[]; services: ServiceControlItem[] }> =>
  (await api.get("/admin/service-controls")).data.data;

export const setServiceControl = async (key: string, enabled: boolean, note?: string) =>
  (await api.put(`/admin/service-controls/${key}`, { enabled, note })).data;

export const getServiceControlLogs = async (limit = 50): Promise<ServiceControlLogItem[]> =>
  (await api.get("/admin/service-controls/logs", { params: { limit } })).data.data;
