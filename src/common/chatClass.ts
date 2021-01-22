export interface Chat {
  type: "message" | "delete" | "login";
  alias: string;
  hash?: number;
  time: string; // TODO: should be number
  recipients?: string[];
  message?: string;
}
export interface ChatExtra {
  id: string;
  recipients?: string[];
}
