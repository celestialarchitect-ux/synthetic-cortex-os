const nextConfig = {
  reactStrictMode: true,
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};
export default nextConfig;
