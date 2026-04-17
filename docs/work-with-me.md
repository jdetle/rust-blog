I build the ops layer that makes AI agents reliable in production. Not the agents themselves — the discipline around them. Rules-as-memory (every failure encoded so agents don't repeat it), adversarial review before every push, parallel agent orchestration via git worktrees, and grounding systems that prevent agents from hallucinating claims to users.

I've been doing this at PwC, at a personal project called agentdds, and in public on my blog at jdetle.com — where every post has an AI-generated version and a human version side by side, so you can see the actual difference. The rules corpus (~90 rules, each one encoding a real production failure) and the skills library (adversarial review, blog pipeline, finish-work-merge-ci, and others) are all public in the repo.

I'm employed full-time at PwC. Any formal outside engagement has to clear my employer's approval process first. Outside the day job I have on the order of ten hours a week, and I want to put most of that toward advisory work: review what you're building, tell you where it'll break, explain what to fix first. Pair-build (embed and ship together) or install-the-system (rules corpus, review pipeline, CI hooks, trained team) are still possible when the scope fits that time box and the paperwork is sorted — they're not my default ask.

If your AI initiative is stuck in demo, the problem is almost always one of: agents with no memory between sessions, no way to run agents in parallel without clobbering each other, or no review step before failures reach users. I've fixed all three, repeatedly. If your agents hallucinate in production, that's a grounding problem and it's fixable.

Reach me at jdetle@gmail.com or linkedin.com/in/jdetle. The posts at jdetle.com/posts are the best introduction to how I think.
