export const developmentVerificationOrigin = (value: string) => {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Workflow verification requires a loopback URL without credentials, path, query or fragment.",
    );
  }
  return url.origin;
};
