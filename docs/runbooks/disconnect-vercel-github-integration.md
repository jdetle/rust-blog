# Disconnect Vercel GitHub checks (PR status)

The **Vercel** and **Vercel Preview Comments** checks on pull requests are emitted by the **Vercel GitHub App**, not by workflows in this repository. They stop appearing only after you disconnect the repo from Vercel or revoke the app’s access.

## Option A — Vercel dashboard (preferred if you still use Vercel elsewhere)

1. Open [Vercel](https://vercel.com) → select the **rust-blog** project (or the linked project name).
2. **Settings** → **Git**.
3. **Disconnect** the GitHub repository (or delete the project if it is unused).

This removes automatic deployments and PR checks for that project.

## Option B — GitHub repository (revoke app access to this repo)

1. On GitHub: **jdetle/rust-blog** → **Settings** → **Integrations** → **GitHub Apps** (or **Applications**).
2. Find **Vercel** → **Configure**.
3. Under **Repository access**, remove **rust-blog** (or set access to only the repos you still want).

## Option C — Remove the app from your account/org

If Vercel should not access any repositories:

1. GitHub **Settings** (user or org) → **Applications** → **Installed GitHub Apps** → **Vercel**.
2. **Uninstall** or narrow repository access.

## Verify

- Open a new PR: **Vercel** / **Vercel Preview Comments** should no longer appear in Checks.
- `main` branch protection in this repo only requires **`e2e`** and **`check`**; removing Vercel does not change those gates.
