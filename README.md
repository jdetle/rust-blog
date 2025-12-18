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
You can adjust the in-memory posts in `src/blog.rs` as needed.
