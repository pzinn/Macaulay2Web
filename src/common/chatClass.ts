export interface Chat {
  type: "message" | "delete" | "login";
  alias: string;
  hash?: number;
  time: string; // TODO: should be number
  recipients?: any;
  recipientsSummary?: string;
  message?: string;
  id?: string;
}
