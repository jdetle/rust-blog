use std::io::{self, BufRead, Write};
use std::process::Command;

const EMAIL: &str = "jdetle@gmail.com";
const POSTHOG_SIGNUP_URL: &str = "https://us.posthog.com/api/signup/";
const POSTHOG_PROJECTS_URL: &str = "https://us.posthog.com/api/projects/";
const CLARITY_DASHBOARD: &str = "https://clarity.microsoft.com";
const VERCEL_ANALYTICS_DASHBOARD: &str =
    "https://vercel.com/team_Ck3ad18uLxElobWvm26xCIw4/jd-site/analytics";

const COSMOS_ACCOUNT: &str = "jd-analytics";
const COSMOS_KEYSPACE: &str = "analytics";

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    println!("=== Analytics Service Setup ===\n");

    let password = prompt_password();
    let resource_group = prompt("Azure resource group name (will create if missing)");

    let posthog_key = setup_posthog(&password).await;
    let clarity_id = setup_clarity();
    setup_vercel();
    let cosmos = setup_cosmos_db(&resource_group).await;

    write_env(&posthog_key, &clarity_id, &cosmos);

    println!("\n=== Setup complete ===");
    println!("All credentials written to .env");
    println!("Run `cargo run --bin analytics-ingestion` to start the analytics ingestion service.");
    Ok(())
}

fn prompt_password() -> String {
    let pass = rpassword::read_password_from_tty(Some("Password for service signups: "))
        .expect("failed to read password");
    let confirm = rpassword::read_password_from_tty(Some("Confirm password: "))
        .expect("failed to read password");
    if pass != confirm {
        eprintln!("Passwords do not match. Exiting.");
        std::process::exit(1);
    }
    pass
}

fn prompt(msg: &str) -> String {
    print!("{}: ", msg);
    io::stdout().flush().unwrap();
    let mut buf = String::new();
    io::stdin().lock().read_line(&mut buf).unwrap();
    buf.trim().to_string()
}

// ---------------------------------------------------------------------------
// PostHog
// ---------------------------------------------------------------------------

async fn setup_posthog(password: &str) -> String {
    println!("\n--- PostHog ---");

    let client = reqwest::Client::new();

    let signup_body = serde_json::json!({
        "first_name": "John",
        "email": EMAIL,
        "password": password,
        "organization_name": "jdetle-blog",
    });

    println!("Attempting PostHog signup via API...");
    let res = client.post(POSTHOG_SIGNUP_URL).json(&signup_body).send().await;

    let api_key: Option<String> = match res {
        Ok(resp) if resp.status().is_success() => {
            println!("  Signup succeeded.");
            fetch_posthog_project_key(&client, &resp).await
        }
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            println!("  Signup returned {status}: {body}");
            println!("  This may mean the account already exists.");
            None
        }
        Err(e) => {
            println!("  Signup request failed: {e}");
            None
        }
    };

    match api_key {
        Some(key) => key,
        None => {
            println!("\n  Manual fallback:");
            println!("  1. Open https://app.posthog.com/signup");
            println!("  2. Sign up with {EMAIL}");
            println!("  3. Create a project, then go to Project Settings > API Key");
            prompt("  Paste your PostHog project API key")
        }
    }
}

async fn fetch_posthog_project_key(
    client: &reqwest::Client,
    signup_resp: &reqwest::Response,
) -> Option<String> {
    let cookies: Vec<String> = signup_resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .filter_map(|v| v.to_str().ok().map(String::from))
        .collect();

    let cookie_header = cookies.join("; ");

    let resp = client
        .get(POSTHOG_PROJECTS_URL)
        .header("Cookie", &cookie_header)
        .send()
        .await
        .ok()?;

    if !resp.status().is_success() {
        return None;
    }

    let body: serde_json::Value = resp.json().await.ok()?;
    body.get("results")
        .and_then(|r| r.as_array())
        .and_then(|arr| arr.first())
        .and_then(|proj| proj.get("api_token"))
        .and_then(|t| t.as_str())
        .map(String::from)
}

// ---------------------------------------------------------------------------
// Microsoft Clarity
// ---------------------------------------------------------------------------

fn setup_clarity() -> String {
    println!("\n--- Microsoft Clarity ---");
    println!("Clarity requires web-based signup (no API).");
    println!("  1. Open {CLARITY_DASHBOARD}");
    println!("  2. Sign in with your Microsoft account ({EMAIL} or linked)");
    println!("  3. Create a new project for your blog");
    let _ = open_url(CLARITY_DASHBOARD);
    prompt("  Paste your Clarity project ID")
}

// ---------------------------------------------------------------------------
// Vercel Analytics
// ---------------------------------------------------------------------------

fn setup_vercel() {
    println!("\n--- Vercel Analytics ---");
    println!("Enable Web Analytics in the Vercel dashboard:");
    println!("  1. Opening {VERCEL_ANALYTICS_DASHBOARD}");
    println!("  2. Click 'Enable' if not already enabled");
    let _ = open_url(VERCEL_ANALYTICS_DASHBOARD);
    prompt("  Press Enter once Vercel Analytics is enabled");
}

// ---------------------------------------------------------------------------
// Azure Cosmos DB (Cassandra API)
// ---------------------------------------------------------------------------

struct CosmosCredentials {
    contact_point: String,
    username: String,
    password: String,
}

async fn setup_cosmos_db(resource_group: &str) -> CosmosCredentials {
    println!("\n--- Azure Cosmos DB (Cassandra API) ---");

    ensure_az_cli();

    run_az(&[
        "group", "create",
        "--name", resource_group,
        "--location", "eastus",
    ]);

    println!("  Creating Cosmos DB account (this may take a few minutes)...");
    run_az(&[
        "cosmosdb", "create",
        "--name", COSMOS_ACCOUNT,
        "--resource-group", resource_group,
        "--capabilities", "EnableCassandra",
        "--default-consistency-level", "Eventual",
        "--locations", "regionName=eastus", "failoverPriority=0", "isZoneRedundant=False",
    ]);

    println!("  Creating keyspace '{COSMOS_KEYSPACE}'...");
    run_az(&[
        "cosmosdb", "cassandra", "keyspace", "create",
        "--account-name", COSMOS_ACCOUNT,
        "--resource-group", resource_group,
        "--name", COSMOS_KEYSPACE,
    ]);

    println!("  Creating events table...");
    let schema = serde_json::json!({
        "columns": [
            {"name": "site_id",    "type": "text"},
            {"name": "event_date", "type": "date"},
            {"name": "event_time", "type": "timestamp"},
            {"name": "event_id",   "type": "uuid"},
            {"name": "event_type", "type": "text"},
            {"name": "source",     "type": "text"},
            {"name": "page_url",   "type": "text"},
            {"name": "user_agent", "type": "text"},
            {"name": "referrer",   "type": "text"},
            {"name": "session_id", "type": "text"},
            {"name": "properties", "type": "text"},
        ],
        "partitionKeys": [
            {"name": "site_id"},
            {"name": "event_date"},
        ],
        "clusterKeys": [
            {"name": "event_time", "orderBy": "Desc"},
            {"name": "event_id",   "orderBy": "Asc"},
        ],
    });

    let schema_str = serde_json::to_string(&schema).unwrap();
    run_az(&[
        "cosmosdb", "cassandra", "table", "create",
        "--account-name", COSMOS_ACCOUNT,
        "--resource-group", resource_group,
        "--keyspace-name", COSMOS_KEYSPACE,
        "--name", "events",
        "--schema", &schema_str,
        "--max-throughput", "4000",
    ]);

    println!("  Retrieving connection info...");
    let contact_point = format!("{COSMOS_ACCOUNT}.cassandra.cosmos.azure.com");
    let username = COSMOS_ACCOUNT.to_string();

    let output = Command::new("az")
        .args([
            "cosmosdb", "keys", "list",
            "--name", COSMOS_ACCOUNT,
            "--resource-group", resource_group,
            "--type", "connection-strings",
            "--output", "json",
        ])
        .output()
        .expect("failed to run az CLI");

    let keys_json: serde_json::Value =
        serde_json::from_slice(&output.stdout).unwrap_or_default();

    let cosmos_password = keys_json
        .get("connectionStrings")
        .and_then(|cs| cs.as_array())
        .and_then(|arr| arr.first())
        .and_then(|entry| entry.get("connectionString"))
        .and_then(|s| s.as_str())
        .and_then(|cs| {
            cs.split(';')
                .find(|part| part.starts_with("Password="))
                .map(|p| p.trim_start_matches("Password=").to_string())
        })
        .unwrap_or_else(|| {
            eprintln!("  Warning: could not parse Cosmos DB password from connection string.");
            prompt("  Paste your Cosmos DB primary password manually")
        });

    println!("  Cosmos DB provisioned successfully.");

    CosmosCredentials {
        contact_point,
        username,
        password: cosmos_password,
    }
}

fn ensure_az_cli() {
    let status = Command::new("az").arg("--version").output();
    if status.is_err() || !status.unwrap().status.success() {
        eprintln!("Azure CLI (az) is not installed or not in PATH.");
        eprintln!("Install: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli");
        std::process::exit(1);
    }
}

fn run_az(args: &[&str]) {
    let status = Command::new("az")
        .args(args)
        .status()
        .expect("failed to run az command");
    if !status.success() {
        eprintln!("  az command failed: az {}", args.join(" "));
        eprintln!("  Continuing anyway — you may need to run this manually.");
    }
}

// ---------------------------------------------------------------------------
// .env writer
// ---------------------------------------------------------------------------

fn write_env(posthog_key: &str, clarity_id: &str, cosmos: &CosmosCredentials) {
    println!("\n--- Writing .env ---");

    let existing = std::fs::read_to_string(".env").unwrap_or_default();

    let mut lines: Vec<String> = existing
        .lines()
        .filter(|l| {
            !l.starts_with("POSTHOG_")
                && !l.starts_with("CLARITY_")
                && !l.starts_with("NEXT_PUBLIC_CLARITY_ID")
                && !l.starts_with("NEXT_PUBLIC_GA4_ID")
                && !l.starts_with("COSMOS_")
                && !l.starts_with("ANALYTICS_")
        })
        .map(String::from)
        .collect();

    lines.push(String::new());
    lines.push("# Analytics services".to_string());
    lines.push(format!("POSTHOG_API_KEY={posthog_key}"));
    lines.push(format!("CLARITY_PROJECT_ID={clarity_id}"));
    lines.push(format!("NEXT_PUBLIC_CLARITY_ID={clarity_id}"));
    lines.push("NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX".to_string());
    lines.push(String::new());
    lines.push("# Azure Cosmos DB (Cassandra API)".to_string());
    lines.push(format!("COSMOS_CONTACT_POINT={}", cosmos.contact_point));
    lines.push(format!("COSMOS_USERNAME={}", cosmos.username));
    lines.push(format!("COSMOS_PASSWORD={}", cosmos.password));
    lines.push(String::new());

    std::fs::write(".env", lines.join("\n")).expect("failed to write .env");
    println!("  Done.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn open_url(url: &str) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open").arg(url).spawn()?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open").arg(url).spawn()?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd").args(["/C", "start", url]).spawn()?;
    }
    Ok(())
}
