// Completed instructor reference. Every function is a teaching decision point.
export function shouldRecord() { return true; }
export function allowPath(relative, operation) {
  if (operation === 'read') return /^(lab\/(input|output|protected)\/)/.test(relative);
  return relative.startsWith('lab/output/');
}
export function allowTool(name) {
  return ['quest_read', 'quest_write', 'quest_validate', 'quest_submit', 'quest_status'].includes(name);
}
export function withinBudget(attempted, limit) { return attempted <= limit; }
export function acceptValidation(checks) {
  return checks.schemaOK && checks.sumOK && checks.reportOK && checks.originalsOK;
}
export function canSubmit(facts) {
  return facts.valid && facts.sameHash && !facts.consumed && facts.attemptsAllowed;
}
