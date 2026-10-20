const https = require('https');
const http = require('http');

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are Victoria, a warm and professional AI receptionist for Victoria Nails salon in South Elgin, IL (349 Randall Rd).

SERVICES: Manicures, Pedicures, Gel, Dip Powder, Gel-X, Acrylic, Nail Art, Kids & Teens, Add-Ons.
HOURS: Mon–Sat 9am–7pm, Closed Sunday.
PHONE: (847) 931-9359
BOOKING: Clients can book online at eznailspa.com or call the salon.

GUIDELINES:
- Be friendly, warm, and concise (2-4 sentences max)
- For pricing questions, give general ranges and invite them to call or check the website
- For booking, direct them to the Book Now button or call (847) 931-9359
- Never make up specific prices or technician schedules
- Sign off as "Victoria ✦" on your very first message only`;

if (!OPENAI_KEY) { console.error('Missing OPENAI_API_KEY environment variable'); process.exit(1); }

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.method !== 'POST') { res.writeHead(404); res.end(); return; }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { message, history = [] } = JSON.parse(body);
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history.slice(-10),
        { role: 'user', content: message }
      ];

      const payload = JSON.stringify({ model: 'gpt-4o', max_tokens: 300, temperature: 0.7, messages });

      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_KEY,
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const reply = parsed.choices?.[0]?.message?.content || "I'm having trouble right now, please call us at (847) 931-9359.";
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ reply }));
          } catch(e) {
            res.writeHead(500); res.end(JSON.stringify({ reply: 'Error parsing response.' }));
          }
        });
      });

      apiReq.on('error', e => {
        res.writeHead(500); res.end(JSON.stringify({ reply: 'Proxy error: ' + e.message }));
      });

      apiReq.write(payload);
      apiReq.end();

    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ reply: 'Bad request.' }));
    }
  });
}).listen(9998, () => console.log('✅ Victoria proxy running on http://localhost:9998'));