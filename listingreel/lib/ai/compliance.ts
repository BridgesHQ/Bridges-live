// Fair Housing Act guardrail: block scripts that mention or imply protected classes or
// steer toward a type of buyer. Terms are whole-word / whole-phrase matches, so ordinary
// listing words don't trip the filter ("terrace", "Grace Ave", "Islamorada", "skids").

const TERMS = [
  // race / color / national origin
  'race', 'races', 'racial', 'ethnic', 'ethnicity', 'national origin', 'white neighborhood', 'black neighborhood',
  // religion
  'religion', 'religious', 'christian', 'christians', 'jewish', 'muslim', 'muslims', 'islam', 'islamic', 'church-going',
  // familial status
  'family with children', 'families with children', 'kids', 'children', 'child-free', 'adults only', 'adult only',
  'pregnant', 'newlyweds', 'bachelor pad', 'empty nesters', 'empty-nesters',
  // disability / age
  'disabled', 'disability', 'disabilities', 'handicapped', 'wheelchair', 'elderly', 'seniors', 'retirees',
  // steering phrases
  'perfect for', 'ideal for', 'great for families', 'family-friendly neighborhood', 'exclusive neighborhood',
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// \b doesn't work next to '-' boundaries consistently, so use explicit non-letter lookarounds.
const blocked = TERMS.map((t) => ({term: t, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(t).replace(/ /g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu')}));

export function complianceFlags(text: string): string[] {
  return blocked.filter(({re}) => re.test(text)).map(({term}) => term);
}

export function assertCompliant(text: string) {
  const flags = complianceFlags(text);
  if (flags.length) throw new ComplianceError(flags);
}

export class ComplianceError extends Error {
  constructor(public flags: string[]) { super(`Fair Housing compliance flag: ${flags.join(', ')}`); }
}
