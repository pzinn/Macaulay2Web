export interface Chat {
  type:
    | "message"
    | "message-user"
    | "message-admin"
    | "message-system"
    | "delete"
    | "login";
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
