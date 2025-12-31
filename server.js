const http = require("http");
const url = require("url");
const querystring = require("querystring");
const https = require("https");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL;

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
  const accessToken = getCookie(req, "accessToken");
  // SERVE CSS
if (parsedUrl.pathname === "/style.css") {
  res.writeHead(200, { "Content-Type": "text/css" });
  require("fs").createReadStream("public/style.css").pipe(res);
  return;
}
// HOME (Lovable sign-in)
if (parsedUrl.pathname === "/") {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sign in</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body class="bg-background text-foreground">
    ${
      accessToken
        ? `<script>window.location.href = "/birthdays";</script>`
        : renderLoginPage()
    }
  </body>
</html>
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

    res.writeHead(302, {
      Location: "/",
      "Set-Cookie": `accessToken=${encodeURIComponent(
        tokenData.access_token
      )}; HttpOnly; Secure; SameSite=Lax; Path=/`,
    });
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

  // Fetch birthdays
  const birthdayEvents = await fetchJSON({
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

  // Fetch regular events to look for anniversaries
  const regularEvents = await fetchJSON({
    hostname: "www.googleapis.com",
    path:
      `/calendar/v3/calendars/primary/events` +
      `?singleEvents=true` +
      `&timeMin=${year}-01-01T00:00:00Z` +
      `&timeMax=${year}-12-31T23:59:59Z` +
      `&maxResults=2500`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  // Combine all events
  const allEvents = [
    ...(birthdayEvents.items || []),
    ...(regularEvents.items || []).filter(e => 
      e.summary && /anniversary|anniv/i.test(e.summary)
    )
  ];

  // Deduplicate by name + month-day
  const seen = new Set();
  const eventsList = [];

  for (const e of allEvents) {
    if (!e.start || !e.start.date) continue;

    const [y, m, d] = e.start.date.split("-");
    const summary = e.summary || "";
    
    // Detect if it's an anniversary or birthday
    const isAnniversary = /anniversary|anniv/i.test(summary);
    const type = isAnniversary ? "anniversary" : "birthday";
    
    // Clean the name
    let name = summary;
    if (isAnniversary) {
      name = name.replace(/'s anniversary|'s anniversary| anniversary|anniv/i, "").trim();
    } else {
      name = name.replace(/'s birthday|'s birthday| birthday/i, "").trim();
    }
    
    const key = `${name}-${m}-${d}-${type}`;

    if (!seen.has(key)) {
      seen.add(key);
      eventsList.push({
        name: name,
        month: m,
        day: d,
        type: type,
      });
    }
  }

  // Sort by upcoming
  eventsList.sort((a, b) => {
    const aDate = new Date(year, a.month - 1, a.day);
    const bDate = new Date(year, b.month - 1, b.day);
    return aDate - bDate;
  });

  res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Birthdays & Anniversaries</title>

    <!-- Lovable CSS -->
    <link rel="stylesheet" href="/style.css" />
  </head>

  <body class="bg-background text-foreground">
    ${renderLovableLayout(eventsList)}
  </body>
</html>
`);
return;
}
function renderLovableLayout(eventsList) {
  const getIcon = (type) => {
    return type === "anniversary" ? "💍" : "🎂";
  };
  
  return `
    <div class="min-h-screen bg-background">
      <header class="sticky top-0 z-50 bg-card/95 backdrop-blur border-b">
        <div class="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="rounded-xl bg-primary/10 p-2">🎂</div>
            <div>
              <h1 class="text-lg font-semibold">Birthdays & Anniversaries</h1>
              <p class="text-sm text-muted-foreground">
                ${eventsList.length} total
              </p>
            </div>
          </div>
          <a href="/logout" class="text-sm text-muted-foreground hover:text-foreground transition">
            Logout
          </a>
        </div>
      </header>

      <main class="max-w-2xl mx-auto px-4 py-6 space-y-3">
        ${eventsList.map(e => `
          <div class="rounded-xl bg-card p-4 shadow-sm flex justify-between items-center">
            <div>
              <div class="font-medium">${escapeHtml(e.name)}</div>
              <div class="text-sm text-muted-foreground">
                ${formatPrettyDate(e.day, e.month)}
              </div>
            </div>
            <div>${getIcon(e.type)}</div>
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
function getCookie(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;

  const match = cookies
    .split(";")
    .map(c => c.trim())
    .find(c => c.startsWith(name + "="));

  return match ? decodeURIComponent(match.split("=")[1]) : null;
}
if (parsedUrl.pathname === "/logout") {
  res.writeHead(302, {
    Location: "/",
    "Set-Cookie": "accessToken=; HttpOnly; Secure; Max-Age=0; Path=/",
  });
  res.end();
  return;
}

  res.writeHead(404);
  res.end("Not found");
});

server.listen(process.env.PORT || 3000);
