const http = require('http');
http.createServer((req, res) => { res.end('Bot en ligne'); }).listen(process.env.PORT || 3000);

const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

let offset = 0;

async function getPronoFile() {
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/pronos.json`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
  });
  const data = await res.json();
  if (data.content) {
    return { sha: data.sha, content: JSON.parse(Buffer.from(data.content, 'base64').toString()) };
  }
  return { sha: null, content: [] };
}
async function savePronoFile(pronos, sha) {
  const content = Buffer.from(JSON.stringify(pronos, null, 2)).toString('base64');
  for (const path of ['pronos.json', 'public/pronos.json']) {
    let fileSha = sha;
    if (path === 'public/pronos.json') {
      try {
        const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, { headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } });
        const j = await r.json();
        if (j.sha) fileSha = j.sha;
      } catch(e){}
    }
    const body = { message: 'Nouveau prono via Telegram', content };
    if (fileSha) body.sha = fileSha;
    await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
  }
}

async function poll() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`);
    const data = await res.json();
    for (const u of data.result || []) {
      offset = u.update_id + 1;
      const msg = u.message || u.channel_post;
      if (!msg || !msg.text) continue;
      if (String(msg.chat.id) !== String(CHAT_ID)) continue;

      const text = msg.text;
      const match = text.match(/[A-Z0-9]{4,10}/);
      if (!match) continue;

      const { sha, content } = await getPronoFile();
      const list = Array.isArray(content) ? content : [];
      list.unshift({ code: match[0], text: text, date: new Date().toISOString() });
      await savePronoFile(list.slice(0, 20), sha);
      console.log('Nouveau prono ajoute:', match[0]);
    }
  } catch (e) { console.log('Erreur:', e.message); }
  setTimeout(poll, 2000);
}

console.log('Bot demarre...');
poll();
