const http = require("http");
const url = require("url");
const querystring = require("querystring");
const https = require("https");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

let accessToken = null;

function fetchJSON(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  // SERVE CSS
if (parsedUrl.pathname === "/style.css") {
  res.writeHead(200, { "Content-Type": "text/css" });
  require("fs").createReadStream("public/style.css").pipe(res);
  return;
}

  // HOME
  if (parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h1>🎂 Birthday App</h1>

      ${
        accessToken
          ? `<a href="/birthdays">View birthdays</a>`
          : `<a href="/login"><button>Sign in with Google</button></a>`
      }
    `);
    return;
  }

  // LOGIN
  if (parsedUrl.pathname === "/login") {
    const params = querystring.stringify({
      client_id: CLIENT_ID,
      redirect_uri: `${APP_URL}/auth/google/callback`,
      response_type: "code",
      scope:
        "openid email profile https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      prompt: "consent",
    });

    res.writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    });
    res.end();
    return;
  }

  // CALLBACK
  if (parsedUrl.pathname === "/auth/google/callback") {
    const code = parsedUrl.query.code;

    const tokenData = await fetchJSON(
      {
        method: "POST",
        hostname: "oauth2.googleapis.com",
        path: "/token",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      querystring.stringify({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: `${APP_URL}/auth/google/callback`,
        grant_type: "authorization_code",
      })
    );

    accessToken = tokenData.access_token;

    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }

  // BIRTHDAYS
  if (parsedUrl.pathname === "/birthdays") {
      if (!accessToken) {
    res.writeHead(302, { Location: "/" });
    res.end();
    return;
  }
  const now = new Date();
  const year = now.getFullYear();

  const events = await fetchJSON({
    hostname: "www.googleapis.com",
    path:
      `/calendar/v3/calendars/primary/events` +
      `?eventTypes=birthday` +
      `&singleEvents=true` +
      `&timeMin=${year}-01-01T00:00:00Z` +
      `&timeMax=${year}-12-31T23:59:59Z`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Deduplicate by name + month-day
  const seen = new Set();
  const birthdays = [];

  for (const e of events.items || []) {
    if (!e.start || !e.start.date) continue;

    const [y, m, d] = e.start.date.split("-");
    const key = `${e.summary}-${m}-${d}`;

    if (!seen.has(key)) {
      seen.add(key);
      birthdays.push({
        name: e.summary.replace(/'s birthday|’s birthday| birthday/i, "").trim(),
        month: m,
        day: d,
      });
    }
  }

  // Sort by upcoming
  birthdays.sort((a, b) => {
    const aDate = new Date(year, a.month - 1, a.day);
    const bDate = new Date(year, b.month - 1, b.day);
    return aDate - bDate;
  });

  const list = birthdays
    .map(b => `<li>🎂 ${b.day}-${b.month} — ${b.name}</li>`)
    .join("");

  res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Birthdays</title>

    <!-- Lovable CSS -->
    <link rel="stylesheet" href="/style.css" />
  </head>

  <body class="bg-background text-foreground">
    ${renderLovableLayout(birthdays)}
  </body>
</html>
`);
return;
}
function renderLovableLayout(birthdays) {
  return `
    <div class="min-h-screen bg-background">
      <header class="sticky top-0 z-50 bg-card/95 backdrop-blur border-b">
        <div class="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div class="rounded-xl bg-primary/10 p-2">🎂</div>
          <div>
            <h1 class="text-lg font-semibold">Birthdays</h1>
            <p class="text-sm text-muted-foreground">
              ${birthdays.length} total
            </p>
          </div>
        </div>
      </header>

      <main class="max-w-2xl mx-auto px-4 py-6 space-y-3">
        ${birthdays.map(b => `
          <div class="rounded-xl bg-card p-4 shadow-sm flex justify-between items-center">
            <div>
              <div class="font-medium">${escapeHtml(b.name)}</div>
              <div class="text-sm text-muted-foreground">
                ${formatPrettyDate(b.day, b.month)}
              </div>
            </div>
            <div>🎉</div>
          </div>
        `).join("")}
      </main>
    </div>
  `;
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}
 function formatPrettyDate(day, month) {
  const date = new Date(2000, month - 1, day); // year doesn't matter
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}
function renderLoginPage() {
  return `
    <div class="min-h-screen bg-background flex flex-col">
  <!-- Header -->
  <header class="bg-card border-b border-border">
    <div class="max-w-2xl mx-auto px-4 py-4">
      <h1 class="text-xl font-semibold">Birthdays</h1>
    </div>
  </header>

  <!-- Main -->
  <main class="flex-1 flex items-center justify-center px-4 py-8">
    <div class="w-full max-w-sm bg-card rounded-2xl p-6 shadow-sm space-y-6">
      <div class="text-center space-y-2">
        <div class="mx-auto w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          🎂
        </div>
        <h2 class="text-lg font-semibold">Never forget a birthday</h2>
        <p class="text-sm text-muted-foreground">
          View and manage all your birthdays from Google Calendar
        </p>
      </div>

      <!-- Sign in button -->
      <a href="/login" class="block">
        <button
          class="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted transition"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.36 1.22 8.72 3.23l6.5-6.5C35.2 2.64 30.03 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.9 6.14C12.2 13.1 17.6 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.5 24.5c0-1.64-.15-3.22-.43-4.74H24v9h12.7c-.55 2.9-2.18 5.36-4.6 7.04l7.08 5.5c4.14-3.82 6.32-9.45 6.32-16.8z"/>
            <path fill="#FBBC05" d="M10.46 28.36c-.5-1.5-.78-3.1-.78-4.86s.28-3.36.78-4.86l-7.9-6.14C.92 16.46 0 20.08 0 24s.92 7.54 2.56 10.5l7.9-6.14z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.92-2.14 15.9-5.8l-7.08-5.5c-1.96 1.32-4.46 2.1-8.82 2.1-6.4 0-11.8-3.6-13.54-8.86l-7.9 6.14C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>
      </a>
    </div>
  </main>
</div>
  `;
}
  res.writeHead(404);
  res.end("Not found");
});

server.listen(process.env.PORT || 3000);
