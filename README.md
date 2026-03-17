### rust-blog

Minimal Rust HTTP server that serves blog posts.

### Prerequisites

- **Rust toolchain**: Install from [rustup.rs](https://rustup.rs/) if you don't already have it.

### Running the server

- **1. Build and run**

```bash
cd /Users/johndetlefs/github/one/rust-blog
cargo run
```

If everything compiles, you should see a log message similar to:

```text
listening on http://127.0.0.1:3000
```

- **2. View all posts (HTML)**

Open this in a browser or use `curl`:

```bash
curl http://127.0.0.1:3000/posts
```

- **3. View a single post by ID (HTML)**

Again, browser or `curl`:

```bash
curl http://127.0.0.1:3000/posts/1
```

Each endpoint now returns an HTML page rather than JSON.

### Blog posts as HTML files

- **Location**: Blog posts are loaded from HTML files in the `posts/` directory (relative to the project root).
- **File naming**: The file name (without `.html`) is used as the post ID in the URL.
  - Example: `posts/1.html` → available at `http://127.0.0.1:3000/posts/1`
  - Example: `posts/agentic-engineering-explained.html` → available at `http://127.0.0.1:3000/posts/agentic-engineering-explained`
- **Title detection**: The server tries to use the `<title>...</title>` tag from each HTML file for the index page.
  - If no `<title>` tag is found, it falls back to the file name.

To add a new post, create a new HTML file in `posts/`, such as `posts/my-new-post.html`, and then visit `http://127.0.0.1:3000/posts` or `http://127.0.0.1:3000/posts/my-new-post`.

### Deployment

The site is deployed as static HTML via **Vercel** at [jdetle.com](https://jdetle.com).

- **Production**: every push to `main` triggers an automatic deploy to jdetle.com.
- **Deploy previews**: every pull request gets a unique preview URL posted as a PR comment, so you can see exactly what the blog will look like before merging.
- **CI**: GitHub Actions runs `cargo check`, `cargo clippy`, and `cargo test` on every push and PR to validate the Rust server code.

#### Vercel project setup (one-time)

1. Import the `jdetle/rust-blog` repo at [vercel.com/new](https://vercel.com/new).
2. Set framework preset to **Other** (static site, no build step).
3. Leave the build command empty and set output directory to `.`.
4. Add custom domain `jdetle.com` under project Settings > Domains.
5. Update DNS records to point to Vercel (Vercel provides the exact A/CNAME values).

#### Domain verification

If the domain is linked to another Vercel account, run `scripts/setup-domain.sh` to automate TXT verification via the GoDaddy and Vercel APIs. Requires `VERCEL_TOKEN`, `GODADDY_API_KEY`, and `GODADDY_API_SECRET` environment variables.
