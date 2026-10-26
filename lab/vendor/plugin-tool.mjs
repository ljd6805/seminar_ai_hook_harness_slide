// @opencode-ai/plugin의 tool()과 같은 동작입니다. 정의를 그대로 돌려주고, 인자 스키마는 zod로 만듭니다.
// 사내 npm 미러처럼 @opencode-ai/plugin을 받을 수 없는 곳에서도 실험실이 돌도록 이 사본을 씁니다.
import { z } from './zod.mjs';

export function tool(input) {
  return input;
}
tool.schema = z;
