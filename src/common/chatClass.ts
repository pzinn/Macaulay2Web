export interface Chat {
  type: "message" | "delete" | "restore";
  alias: string; // alias of sender
  time: number;
  message?: string; // content of message
  text?: string; // text content of message (for / commands)
  index?: number; // index of message
  recipients?: any;
  recipientsSummary?: string; // for display purposes
  id?: string; // id of sender -- hidden
}
