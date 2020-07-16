// Emit one of these types via websocket.
enum SocketEvent {
  "result",
  "file",
}
export { SocketEvent };

enum AuthOption {
  "basic",
  "none",
}
export { AuthOption };
