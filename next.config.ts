import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 프롬프트·루브릭 텍스트 파일을 서버 번들에 포함 (레포 루트 경로 유지)
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**", "./specs/README_RUBRIC.md"],
  },
};

export default nextConfig;
