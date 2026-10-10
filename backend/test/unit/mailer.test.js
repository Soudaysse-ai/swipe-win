const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/config');
const mailer = require('../../src/services/mailer');
const { resetEmail } = require('../../src/services/passwordReset');

test('Resend : requête conforme à l\'API (clé, expéditeur, destinataire, contenu)', async () => {
  const realFetch = global.fetch;
  const saved = { ...config.mail };
  let call;
  global.fetch = async (url, opts) => { call = { url, opts }; return { ok: true, json: async () => ({ id: 're_123' }) }; };
  try {
    config.mail.resendApiKey = 're_test_key';
    config.mail.from = 'Défi Yas <no-reply@defi-yas.com>';
    const out = await mailer.send({ to: 'awa@example.km', subject: 'Sujet', html: '<p>x</p>', text: 'x' });
    assert.equal(out.id, 're_123');
    assert.equal(call.url, 'https://api.resend.com/emails');
    assert.equal(call.opts.method, 'POST');
    assert.equal(call.opts.headers.Authorization, 'Bearer re_test_key');
    const body = JSON.parse(call.opts.body);
    assert.deepEqual(body.to, ['awa@example.km']);
    assert.equal(body.from, 'Défi Yas <no-reply@defi-yas.com>');
    assert.equal(body.subject, 'Sujet');
  } finally {
    global.fetch = realFetch;
    Object.assign(config.mail, saved);
  }
});

test('Resend : une erreur de l\'API est remontée proprement', async () => {
  const realFetch = global.fetch;
  const saved = { ...config.mail };
  global.fetch = async () => ({ ok: false, status: 422, text: async () => 'invalid from' });
  const err = console.error;
  console.error = () => {};
  try {
    config.mail.resendApiKey = 're_test_key';
    await assert.rejects(() => mailer.send({ to: 'a@b.km', subject: 's', html: 'h', text: 't' }), { code: 'MAIL_FAILED' });
  } finally {
    global.fetch = realFetch;
    console.error = err;
    Object.assign(config.mail, saved);
  }
});

test('e-mail de réinitialisation : tutoiement, lien, durée, pseudonyme échappé', () => {
  const m = resetEmail('<b>x</b>', 'https://www.defi-yas.com/reset?token=abc');
  assert.ok(m.text.includes('https://www.defi-yas.com/reset?token=abc'));
  assert.ok(m.text.includes('30 minutes'));
  assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(!m.html.includes('<b>x</b>'));
});
