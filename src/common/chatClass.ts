export interface Chat {
  type: "message" | "delete" | "login";
  alias: string;
  hash?: number;
  time: number;
  recipients?: any;
  recipientsSummary?: string;
  message?: string;
  id?: string;
}
