# Contributing to cursor-doctor

Thanks for your interest in contributing! Here's how to get started.

## Quick Start

```bash
git clone https://github.com/nedcodes-ok/cursor-doctor.git
cd cursor-doctor
npm test
```

No build step. No dependencies to install. The project runs on Node.js built-in modules only.

## How to Contribute

1. **Fork** the repo
2. **Create a branch** (`git checkout -b my-fix`)
3. **Make your changes**
4. **Run tests** (`npm test`)
5. **Submit a PR**

## What We're Looking For

- Bug fixes
- New lint checks (see `src/index.js` for existing patterns)
- Documentation improvements
- Test coverage

Check the [issues labeled `good first issue`](https://github.com/nedcodes-ok/cursor-doctor/labels/good%20first%20issue) for beginner-friendly tasks.

## Code Style

- Zero external dependencies — use Node.js built-ins only
- Each CLI command lives in its own `src/<command>.js` module
- Export a single function that takes `(cwd)` as its first argument
- Error messages follow the pattern: `Error: <what failed>. <suggestion>`

## Reporting Bugs

Open an issue with:
- What you expected
- What happened
- Steps to reproduce
- Your Node.js version (`node -v`)

## Questions?

Open an issue — happy to help.
