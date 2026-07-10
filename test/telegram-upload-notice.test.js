const assert = require('node:assert');

describe('Telegram upload notification', function () {
  it('renders a compact HTML notice without raw identifiers or direct URL text', async function () {
    const { buildTelegramUploadNoticeText } = await import('../functions/utils/telegram.js');
    const text = buildTelegramUploadNoticeText({
      directLink: 'https://img.nagi.xx.kg/file/tgs_test.webp',
      fileName: 'EH-<0001>&.webp',
      fileSize: 399484,
    });

    assert.strictEqual(
      text,
      '✅ <b>已上传</b>\n\n<a href="https://img.nagi.xx.kg/file/tgs_test.webp">EH-&lt;0001&gt;&amp;.webp</a>\n<code>390.12 KB · Telegram</code>'
    );
    assert.ok(!text.includes('File ID:'));
    assert.ok(!text.includes('Message ID:'));
    assert.ok(!text.includes('Direct Link:'));
  });
});
