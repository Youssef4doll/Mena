/**
 * Refuses to go on unless every database and URL the tests touch is on this
 * machine. The tests create orders, reset tables and log in; pointed at the
 * real shop by mistake, they would do it there.
 */
export const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/mena_test";
export const TEST_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function assertLocal() {
  const problems: string[] = [];
  try {
    const db = new URL(TEST_DB);
    if (!LOCAL.test(db.hostname)) problems.push(`database host ${db.hostname}`);
    if (!/test/.test(db.pathname)) problems.push(`database name ${db.pathname} (must contain "test")`);
  } catch {
    problems.push("TEST_DATABASE_URL is not a URL");
  }
  try {
    if (!LOCAL.test(new URL(TEST_URL).hostname)) problems.push(`base URL ${TEST_URL}`);
  } catch {
    problems.push("E2E_BASE_URL is not a URL");
  }
  if (problems.length) throw new Error(`Refusing to run tests against a non-local target: ${problems.join(", ")}.`);
}
