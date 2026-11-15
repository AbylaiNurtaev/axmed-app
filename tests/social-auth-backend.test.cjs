const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, before, after } = require('node:test');
const ts = require('typescript');

let database, authenticateSocial, identity;
const ownedIds = [];

before(async () => {
  database = await import('../server/src/database.ts');
  await database.migrateDatabase();
  // Provider signature validation is unchanged. Mock only that external boundary;
  // account lookup, transactions and session creation use the real database code.
  const modules = {
    'node:crypto': require('node:crypto'),
    './database.js': database,
    './config.js': await import('../server/src/config.ts'),
    './errors.js': await import('../server/src/errors.ts'),
    './security.js': await import('../server/src/security.ts'),
    './loginThrottle.js': await import('../server/src/loginThrottle.ts'),
    './mailer.js': { sendVerificationCode: async () => {} },
    './social.js': { verifySocialIdentity: async provider => { assert.equal(provider, identity.provider); return identity; } }
  };
  const filename = path.join(__dirname, '../server/src/authService.ts');
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, Date, Buffer, require(id) { assert.ok(Object.hasOwn(modules, id), id); return modules[id]; } }, { filename });
  authenticateSocial = exports.authenticateSocial;
});

after(async () => {
  if (!database) return;
  await database.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [ownedIds]);
  await database.pool.end();
});

async function fixture(email = null) {
  const id = randomUUID();ownedIds.push(id);
  await database.query('INSERT INTO users (id,email,email_verified_at) VALUES ($1,$2,now())', [id,email]);
  return id;
}
const input = (provider, mode) => ({ provider, mode, idToken: 'provider-boundary-fixture', profile: { name: 'Should not overwrite the existing profile' } });
const count = async (table, userId) => Number((await database.query(`SELECT count(*) AS total FROM ${table} WHERE user_id=$1`, [userId])).rows[0].total);

for (const provider of ['google', 'apple']) {
  test(`${provider}: registering an existing identity returns ACCOUNT_EXISTS without issuing a session`, async () => {
    const userId = await fixture();
    identity = { provider, subject: randomUUID(), email: null, emailVerified: false };
    await database.query('INSERT INTO auth_identities (id,user_id,provider,provider_user_id) VALUES ($1,$2,$3,$4)', [randomUUID(),userId,provider,identity.subject]);
    await assert.rejects(authenticateSocial(input(provider,'signUp'),{}), error => error.status===409 && error.code==='ACCOUNT_EXISTS');
    assert.equal(await count('refresh_tokens',userId),0);
    assert.equal((await database.query('SELECT display_name FROM users WHERE id=$1',[userId])).rows[0].display_name,null);
    assert.equal((await authenticateSocial(input(provider,'signIn'),{})).user.id,userId);
  });

  test(`${provider}: a matching verified email offers sign-in before linking the provider`, async () => {
    const email=`social-${randomUUID()}@example.invalid`;const userId=await fixture(email);
    identity={provider,subject:randomUUID(),email,emailVerified:true};
    await assert.rejects(authenticateSocial(input(provider,'signUp'),{}), error => error.status===409 && error.code==='ACCOUNT_EXISTS');
    assert.equal(await count('auth_identities',userId),0);assert.equal(await count('refresh_tokens',userId),0);
    assert.equal((await authenticateSocial(input(provider,'signIn'),{})).user.id,userId);
    assert.equal(await count('auth_identities',userId),1);
  });

  test(`${provider}: a new account can register once and subsequently sign in`, async () => {
    identity={provider,subject:randomUUID(),email:`social-${randomUUID()}@example.invalid`,emailVerified:true};
    const registered=await authenticateSocial(input(provider,'signUp'),{});ownedIds.push(registered.user.id);
    assert.equal(await count('refresh_tokens',registered.user.id),1);
    await assert.rejects(authenticateSocial(input(provider,'signUp'),{}), error => error.status===409 && error.code==='ACCOUNT_EXISTS');
    assert.equal(await count('refresh_tokens',registered.user.id),1);
    assert.equal((await authenticateSocial(input(provider,'signIn'),{})).user.id,registered.user.id);
    assert.equal(await count('auth_identities',registered.user.id),1);
  });
}

test('social sign-in still rejects an account that has not registered', async () => {
  identity={provider:'google',subject:randomUUID(),email:null,emailVerified:false};
  await assert.rejects(authenticateSocial(input('google','signIn'),{}), error => error.status===404 && error.code==='ACCOUNT_NOT_FOUND');
});
