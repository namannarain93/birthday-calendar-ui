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
    const events = await fetchJSON({
      hostname: "www.googleapis.com",
      path:
        "/calendar/v3/calendars/contacts/events?eventTypes=birthday&singleEvents=true",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const list = (events.items || [])
      .map(e => `<li>${e.summary} — ${e.start.date}</li>`)
      .join("");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h2>🎉 Birthdays</h2>
      <ul>${list}</ul>
      <a href="/">Back</a>
    `);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(process.env.PORT || 3000);
