# Contributing to TaskChain

Thank you for contributing to TaskChain — where freelancing meets trust.

TaskChain is a Web3-powered freelancing platform built with Next.js, React, TypeScript, and Tailwind CSS, designed to integrate blockchain-based escrow payments on the Stellar network.

We are building a trust-first freelancing ecosystem where:

- Freelancers never chase payments
- Clients never worry about quality
- Blockchain replaces intermediaries
- Transparency is built into the system

This document outlines how to contribute effectively and collaboratively.

---

## Table of Contents

- Project Vision
- Types of Contributions
- Development Setup
- Branching Strategy
- Commit Message Guidelines
- Issue Workflow
- Pull Request Workflow
- Code Standards
- Security & Blockchain Considerations
- Review Process

---

## Project Vision

TaskChain is more than a platform — it is infrastructure for secure, transparent, and milestone-driven freelancing powered by blockchain escrow.

Every contribution should support:

- Transparency by design  
- Secure escrow architecture  
- Clean, scalable code  
- User-first experience  
- Long-term sustainability  

Before contributing, review the README and roadmap to ensure alignment with the project direction.

---

## Types of Contributions

We welcome contributions across the ecosystem:

- Frontend development (UI, components, responsiveness)
- Feature implementation
- Bug fixes
- Documentation improvements
- Performance optimizations
- UX enhancements
- Roadmap feature development

If you are planning a major feature, open an issue first to discuss direction and scope.

---

## Development Setup

### 1. Fork the Repository

Fork the repository to your GitHub account.

### 2. Clone Your Fork
- git clone https://github.com/YOUR_USERNAME/TaskChain.git
- cd TaskChain

### 3. Install Dependencies
- npm install

### 4. Start Development Server
- npm run dev

### 5. Run Linting
- npm run lint

Ensure the application runs correctly before submitting changes.

## Branching Strategy
Never commit directly to main.

Create a new branch for each contribution:
git checkout -b <branch-name>

Branch naming conventions:
feat/feature-name — New features
fix/bug-description — Bug fixes
docs/update-description — Documentation changes
refactor/code-area — Refactoring
style/ui-adjustment — Styling changes

Examples:
feat/milestone-dashboard
fix/wallet-connection-error
docs/add-architecture-overview

Small, focused branches keep reviews efficient and maintain code quality.

## Commit Message Guidelines
We follow Conventional Commits:

type: short description

Common types:
- feat
- fix
- docs
- refactor
- style
- test
- chore

Examples:
feat: implement escrow milestone UI
fix: resolve navbar responsiveness issue
docs: add contributing guidelines

Clear commit messages help maintain transparency and long-term maintainability.

## Issue Workflow
Before creating a new issue:
- Search existing issues to avoid duplication.
- Use a clear and descriptive title.
- Provide context and expected behavior.
- Include screenshots or logs when relevant.

If you plan to work on an issue:
- Comment first.
- Wait for confirmation if assignment is required.
- Collaboration prevents duplicated effort and ensures roadmap alignment.
- Pull Request Workflow

Before opening a Pull Request:
- Ensure your branch is up to date with main.
- Test your changes locally.
- Run lint checks.
- Keep changes focused and isolated.

When opening a PR:
Link the related issue in the description:
Closes #ISSUE_NUMBER

Clearly explain:
- What was changed
- Why it was changed
- Any technical considerations
- Include screenshots for UI-related changes.

Well-structured PRs reduce review friction and accelerate merges.

## Code Standards
General
- Write clean, modular, and maintainable code.
- Avoid unnecessary dependencies.
- Follow existing project structure.
- Keep components reusable and scalable.

Frontend (Next.js / React / TypeScript)
- Use functional components.
- Define proper TypeScript types and interfaces.
- Avoid using any unless absolutely necessary.
- Maintain consistent Tailwind styling.
- Keep components small and focused.

Styling
- Prefer Tailwind utility classes.
- Maintain consistent spacing and layout patterns.
- Avoid inline styles when possible.
- Consistency ensures long-term scalability.

Security & Blockchain Considerations
TaskChain integrates blockchain-based escrow logic.

When contributing to blockchain-related functionality:
- Clearly document logic changes.
- Consider user safety and edge cases.
- Do not expose private keys or sensitive data.
- Discuss major escrow changes before implementation.

Security is foundational. Escrow logic must be treated with precision.

## Review Process
All contributions are reviewed by maintainers.

Review criteria include:
- Code quality
- Alignment with project vision
- Performance considerations
- Security implications
- Clarity of implementation
- Contributors may be asked to revise their PR before approval.
- Respond to feedback professionally and promptly as collaboration strengthens the ecosystem.

## Contribution Etiquette
- Be respectful and constructive.
- Assume good intent.
- Keep discussions technical and focused.
- Communicate clearly in issues and PRs.

We are building a transparent and trust-driven ecosystem — collaboration reflects that philosophy.

# License
By contributing, you agree that your contributions will be licensed under the project’s MIT License.

Thank you for helping build TaskChain.
Together, we are shaping the future of secure freelancing.
