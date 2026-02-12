# Contributing to AnyMark

First off, thank you for considering contributing to AnyMark! It's people like you that make AnyMark a great tool for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something amazing together.

## How Can I Contribute?

There are many ways to contribute:

- **Report Bugs** — Open an issue with details about the problem
- **Suggest Features** — Share your ideas for improving AnyMark
- **Write Code** — Fix bugs, implement new features, or improve documentation
- **Improve Documentation** — Help make docs clearer and more comprehensive
- **Help Others** — Answer questions from other users in issues

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **Google Chrome** (for testing the extension)

### Getting Started

```bash
# 1. Fork the repository on GitHub
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/Anymark.git
cd Anymark/smart-bookmarks

# 3. Install dependencies
npm install

# 4. Create a feature branch
git checkout -b feature/your-feature-name

# 5. Make your changes

# 6. Build the extension
npm run build

# 7. Load in Chrome for testing
# - Open chrome://extensions/
# - Enable "Developer mode"
# - Click "Load unpacked"
# - Select the smart-bookmarks/dist/ directory
```

### Development Mode

For faster development with hot-reload:

```bash
npm run dev
```

Then reload the extension in Chrome when files change.

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Coding Standards

### TypeScript

- Use TypeScript for all new files
- Define proper types for functions, parameters, and return values
- Avoid `any` when possible
- Use interfaces for object shapes

### React

- Use functional components with hooks
- Follow the existing component structure
- Keep components focused and reusable
- Use proper prop types (TypeScript interfaces)

### File Organization

- Place files in appropriate directories (see [README.md](README.md#project-structure))
- Keep file names descriptive and consistent
- Export components using named exports

### Styling

- Use CSS Modules for component-specific styles
- Follow existing naming conventions
- Keep styles organized and maintainable

### Internationalization

- All user-facing text must use i18n keys
- Add translations to all 6 language files (en, zh-CN, ja, de, es, fr)
- Run `npm run i18n-audit` to check translation coverage
- Target: 100% coverage for new features

## Commit Guidelines

### Commit Message Format

Follow these guidelines for commit messages:

```
type(scope): brief description

Detailed explanation (optional)

Refs #issue-number
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation changes
- `style` — Code style changes (formatting, etc.)
- `refactor` — Code refactoring
- `test` — Adding or updating tests
- `chore` — Maintenance tasks

**Examples:**
```
feat(agent): add wildcard search support

Implements wildcard pattern matching for bookmark search,
allowing users to use * and ? patterns in search queries.

Closes #123
```

```
fix(settings): correct API key rotation

Fixed bug where API key rotation wasn't working properly
when switching between providers.
```

### Before You Commit

- Run tests: `npm run test`
- Run type check: `npm run type-check`
- Run lint: `npm run lint`
- Ensure all checks pass

## Pull Request Process

### 1. Update Your Branch

Before submitting a PR, make sure your branch is up to date:

```bash
git fetch upstream
git rebase upstream/main
```

### 2. Push Your Changes

```bash
git push origin feature/your-feature-name
```

### 3. Open a Pull Request

- Go to the repository on GitHub
- Click "New Pull Request"
- Provide a clear title and description
- Link any related issues

### 4. PR Description Template

```markdown
## Description
Brief description of what this PR does and why it's needed.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe the tests you ran and how to reproduce them:

## Screenshots (if applicable)
Before / After screenshots for UI changes:

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation accordingly
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective
- [ ] New and existing tests pass locally
- [ ] I have added translations to all 6 languages (en, zh-CN, ja, de, es, fr)
```

### 5. Review Process

- Address review comments promptly
- Make requested changes or discuss alternatives
- Keep the conversation focused and constructive

## Development Tips

### Agent Development

When working on the AI Agent:

1. **Understand the tool-based architecture** — Read `src/agent-v3/Agent.ts`
2. **Tools are in `src/agent-v3/tools/`** — Or `src/utils/agent/tools/coreTools.ts` for legacy
3. **Test with mock data** — Use the mock fixtures in `src/agent-v3/mock/`
4. **Add prompts for new languages** — Update `src/agent-v3/prompts/`

### UI Development

When working on the sidebar UI:

1. **State management** — Uses Zustand in `src/sidebar/store/bookmarkStore.ts`
2. **Components** — Keep them focused and reusable
3. **Styles** — Use CSS Modules, follow existing patterns

### Adding New AI Providers

1. **Update the preset list** — Edit `src/sidebar/components/Settings/Settings.tsx`
2. **Add provider name to translations** — Update all `src/i18n/locales/*.json` files
3. **Update CSP if needed** — Add domain to `public/manifest.json`

### Adding New Languages

1. **Create locale file** — Add to `src/i18n/locales/`
2. **Update i18n config** — Edit `src/i18n/config.ts`
3. **Add translations** — Use `npm run i18n-audit` to find missing keys
4. **Test thoroughly** — Ensure all UI text is translated

## Getting Help

- **Documentation** — Check [README.md](README.md) and [CLAUDE.md](CLAUDE.md)
- **Issues** — Search existing issues before creating new ones
- **Discussions** — Use GitHub Discussions for questions

## Recognition

Contributors will be recognized in the project's contributors list.

Thank you for contributing to AnyMark! 🎉
