import { tool } from '@opencode-ai/plugin';
import { createHooks } from '../../quest/lib/plugin.mjs';
import * as rules from '../../learner/rules.mjs';

export const HarnessQuest = async ({ directory }) => createHooks({ root: directory, rules, tool });
