import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,       // chem7324@gmail.com
    pass: process.env.GMAIL_APP_PASS,   // Gmail App Password（16碼）
  },
})

export async function sendDailyDigest(content: string, items: { title: string; url: string; source: string }[]) {
  const date = new Date().toLocaleDateString('zh-TW', { 
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' 
  })

  const linksHtml = items
    .map(item => `<li><a href="${item.url}" style="color:#3b82f6">${item.title}</a> <span style="color:#888;font-size:12px">[${item.source}]</span></li>`)
    .join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0a0a0a;color:#eee;padding:32px;max-width:680px;margin:0 auto">
  <div style="border-bottom:2px solid #3b82f6;padding-bottom:16px;margin-bottom:24px">
    <h1 style="margin:0;font-size:24px">🤖 AI Daily Digest</h1>
    <p style="margin:4px 0 0;color:#888">${date}</p>
  </div>

  <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px;margin-bottom:24px;white-space:pre-wrap;line-height:1.7;font-size:14px">
${content}
  </div>

  <div style="background:#111;border:1px solid #222;border-radius:12px;padding:20px">
    <h3 style="margin:0 0 12px;color:#3b82f6;font-size:14px">🔗 原始連結</h3>
    <ul style="margin:0;padding-left:20px;font-size:13px;line-height:1.8">
      ${linksHtml}
    </ul>
  </div>

  <p style="color:#444;font-size:11px;margin-top:20px;text-align:center">
    由 InsightFab AI Bot 每日自動發送・回覆此信無效
  </p>
</body>
</html>`

  await transporter.sendMail({
    from: `"AI Daily Bot" <${process.env.GMAIL_USER}>`,
    to: 'chem7324@gmail.com',
    subject: `🤖 AI Daily | ${new Date().toLocaleDateString('zh-TW')} Claude & AI 最新動態`,
    html,
    text: content,
  })
}
