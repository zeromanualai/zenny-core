import { runEvalSuite } from './suite';

async function main() {
  console.log('\n🧪 Zenny Evaluation Suite\n');
  console.log('Running automated regression tests...\n');

  const { passed, failed, results } = await runEvalSuite();

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name} (${result.test})`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    for (const check of result.checks) {
      const checkIcon = check.passed ? '  ✓' : '  ✗';
      const detail = check.phrase ? ` "${check.phrase}"` : '';
      console.log(`${checkIcon} ${check.type}${detail}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
