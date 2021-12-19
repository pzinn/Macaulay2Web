const options = {
  version: process.env.npm_package_version,
  cookieName: "Macaulay2Web",
  cookieAliasName: "Macaulay2Web_alias",
  cookieFileName: "Macaulay2Web_file",
  cookieDuration: 1000 * 60 * 60 * 24 * 183, // 6 months
  defaultAlias: "Anonymous",
  adminAlias: "Admin",
  systemAlias: "System",
};

export { options };
