const http = require("http");
const url = require("url");
const querystring = require("querystring");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const APP_URL = process.env.APP_URL;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);

  // Home page
  if (parsedUrl.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h1>🎂 Birthday App</h1>
      <p>This will show birthdays from Google Calendar.</p>

      <a href="/login">
        <button style="padding:10px;font-size:16px;">
          Sign in with Google
        </button>
      </a>
    `);
    return;
  }

  // Redirect to Google
  if (parsedUrl.pathname === "/login") {
    const params = querystring.stringify({
      client_id: CLIENT_ID,
      redirect_uri: `${APP_URL}/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
    });

    res.writeHead(302, {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    });
    res.end();
    return;
  }

  // Google sends user back here
  if (parsedUrl.pathname === "/auth/google/callback") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`
      <h2>✅ Logged in successfully!</h2>
      <p>Next step: read birthdays from Google Calendar 🎂</p>
    `);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
