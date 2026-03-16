use axum::{extract::Path, http::StatusCode, response::Html};
use std::{fs, io, path::PathBuf};

const POSTS_DIR: &str = "posts";

#[derive(Clone, Debug)]
pub struct BlogPost {
    pub id: String,
    pub title: String,
    pub filename: PathBuf,
}

fn extract_title(contents: &str) -> Option<String> {
    let start_tag = "<title>";
    let end_tag = "</title>";

    let start = contents.find(start_tag)? + start_tag.len();
    let end = contents[start..].find(end_tag)? + start;

    Some(contents[start..end].trim().to_string())
}

fn load_posts() -> io::Result<Vec<BlogPost>> {
    let mut posts = Vec::new();

    let entries = fs::read_dir(POSTS_DIR)?;

    for entry in entries {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("html") {
            continue;
        }

        let file_stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(stem) => stem.to_string(),
            None => continue,
        };

        let contents = fs::read_to_string(&path)?;
        let title = extract_title(&contents).unwrap_or_else(|| file_stem.clone());

        posts.push(BlogPost {
            id: file_stem,
            title,
            filename: path,
        });
    }

    posts.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(posts)
}

/// GET /posts
pub async fn list_posts() -> Html<String> {
    match load_posts() {
        Ok(posts) => {
            let mut html = String::from(
                r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Rust Blog - Posts</title>
</head>
<body>
    <h1>Rust Blog - Posts</h1>
    <ul>
"#,
            );

            for post in posts {
                html.push_str(&format!(
                    r#"        <li><a href="/posts/{id}">{title}</a></li>
"#,
                    id = post.id,
                    title = post.title,
                ));
            }

            html.push_str(
                r#"    </ul>
</body>
</html>
"#,
            );

            Html(html)
        }
        Err(err) => {
            let html = format!(
                r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Rust Blog - Error</title>
</head>
<body>
    <h1>Error loading posts</h1>
    <p>{}</p>
</body>
</html>
"#,
                err
            );

            Html(html)
        }
    }
}

/// GET /posts/:id
pub async fn get_post(Path(id): Path<String>) -> Result<Html<String>, StatusCode> {
    let path = PathBuf::from(POSTS_DIR).join(format!("{id}.html"));

    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Html(contents)),
        Err(err) => {
            if err.kind() == io::ErrorKind::NotFound {
                Err(StatusCode::NOT_FOUND)
            } else {
                Err(StatusCode::INTERNAL_SERVER_ERROR)
            }
        }
    }
}
