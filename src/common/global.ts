const options = {
  version: process.env.npm_package_version,
  cookieName: "Macaulay2Web",
  cookieAliasName: "Macaulay2Web_alias",
  cookieDuration: 1000 * 60 * 60 * 24 * 31, // one month
  defaultAlias: "Anonymous",
  adminAlias: "Admin",
};

export { options };
