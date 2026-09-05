// Executed in a fixture cwd by legal-content.test.mjs; evals the given
// expressions against the real loader and prints one result per line.
import { getLegalContent, availableLegalKinds } from '../lib/legal-content.ts';

const exprs = JSON.parse(process.argv[2] ?? '[]');
for (const expr of exprs) {
  console.log(await eval(`(async () => ${expr})()`));
}
