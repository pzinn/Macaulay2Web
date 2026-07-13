import Cookie from "cookie";
import { options } from "../common/global";

const getSessionId = function (): string | undefined {
  return Cookie.parse(document.cookie)[options.cookieName];
};

const setSessionId = function (id: string): void {
  const expires = new Date(Date.now() + options.cookieDuration);
  document.cookie = Cookie.serialize(options.cookieName, id, { expires });
};

export { getSessionId, setSessionId };
