import { createRuntime } from './runtime.mjs';

export function createHooks({ root, rules, tool, source = 'opencode' }) {
  const runtime = createRuntime(root, rules, source);
  const schema = tool.schema;
  const definitions = {
    quest_read: ['Read a course file. Use lab/input/orders.json.', { path: schema.string() }],
    quest_write: ['Write a course output file with UTF-8 text.', { path: schema.string(), content: schema.string() }],
    quest_validate: ['Inspect real output files. Return validation errors and artifactHash as hash.', {}],
    quest_submit: ['Request native approval and submit validated artifacts locally. Use the hash from validation.',
      { artifactHash: schema.string() }],
    quest_status: ['Show the current course run, budget and validation state.', {}],
    quest_probe: ['Harmless training probe: creates lab/probe/probe.txt. Used to test tool denial.', {}],
  };
  const registered = Object.fromEntries(Object.entries(definitions).map(([name, [description, args]]) => [name,
    tool({ description, args, async execute(input, context) {
      const result = await runtime.perform(name, input, context);
      return JSON.stringify(result);
    } }),
  ]));
  return {
    tool: registered,
    'tool.execute.before': async (input, output) => runtime.before(input, output.args),
    'tool.execute.after': async (input, output) => runtime.after(input, output),
  };
}
