// Display labels only: existing stored values and API contracts remain unchanged.
const names: Record<string, string> = { '李医生': 'Dr. Li', '王医生': 'Dr. Wang', '张医生': 'Dr. Zhang' };
export const practitionerLabel = (name: string) => names[name] ?? name;
