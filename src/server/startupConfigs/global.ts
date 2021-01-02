const options = {
  cookieName: "Macaulay2Web",
  cookieAliasName: "Macaulay2Web_alias",
  cookieDuration: 1000 * 60 * 60 * 24 * 31, // one month
  defaultAlias: "Anonymous",
  adminAlias: "Admin",
  perContainerResources: {
    cpuShares: 0.5,
    memory: 384, // Mb
    maxResults: 100000, // size of saved results in bytes
  },
};

export { options };
