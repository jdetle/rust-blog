use axum::{extract::Path, http::StatusCode, response::Html};

#[derive(Clone, Debug)]
pub struct BlogPost {
    pub id: u64,
    pub title: String,
    pub body: String,
}

fn sample_posts() -> Vec<BlogPost> {
    vec![
        BlogPost {
            id: 1,
            title: "First post".to_string(),
            body: "Welcome to the Rust blog server example.".to_string(),
        },
        BlogPost {
            id: 2,
            title: "Second post".to_string(),
            body: "This is another sample blog post served from memory.".to_string(),
        },
    ]
}

/// GET /posts
pub async fn list_posts() -> Html<String> {
    let posts = sample_posts();

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

/// GET /posts/:id
pub async fn get_post(Path(id): Path<u64>) -> Result<Html<String>, StatusCode> {
    let posts = sample_posts();

    if let Some(post) = posts.into_iter().find(|p| p.id == id) {
        let html = format!(
            r#"<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{title}</title>
</head>
<body>
    <article>
        <h1>{title}</h1>
        <p>{body}</p>
        <p><a href="/posts">Back to posts</a></p>
    </article>
</body>
</html>
"#,
            title = post.title,
            body = post.body,
        );

        Ok(Html(html))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
