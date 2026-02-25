# 🚀 TaskChain

**Freelance with Confidence. Get Paid Securely.**

TaskChain is a **Web3-powered freelancing platform** built on the **Stellar blockchain**. It is designed to protect both freelancers and clients using **blockchain-based escrow payments**, **milestone tracking**, and **transparent dispute resolution**.

By leveraging Stellar's fast and low-cost network, TaskChain ensures that payments are secure, transparent, and instant, removing the need for traditional intermediaries and high platform fees.

---

## 🌐 Project Overview

TaskChain reimagines the freelancing experience by solving the core issue of trust.

- **Trustless Escrow**: Payments are held in smart contracts and only released when milestones are met.
- **Instant Payouts**: Once approved, funds are transferred instantly via the Stellar network.
- **Zero Platform Fees**: We believe freelancers should keep what they earn.
- **Transparent Track Record**: All reviews and project histories are stored on the blockchain, ensuring a verified reputation system.

---

## 🛠 Tech Stack

### Frontend

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **State Management/Forms**: [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/)

### Backend & Database

- **Database**: [Neon Postgres](https://neon.tech/) (Serverless)
- **ORM/Query Builder**: `@neondatabase/serverless`
- **Deployment**: [Vercel](https://vercel.com/)

### Blockchain (Stellar)

- **Network**: Stellar (Testnet/Mainnet)
- **Contracts**: Soroban Smart Contracts (Planned)
- **Integration**: `stellar-sdk` (Planned)

---

## 📂 Folder Structure

```text
task_chain/
├── app/                # Next.js App Router pages and global styles
├── components/         # Reusable UI components
│   └── ui/             # shadcn/ui primitive components
├── lib/                # Shared utilities and database configuration
├── public/             # Static assets (images, icons, etc.)
├── scripts/            # Database migrations and helper scripts
├── styles/             # Global CSS and theme configurations
├── .env.example        # Template for environment variables
├── package.json        # Project dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

### Key Directories

- **`app/`**: Contains the main application routes. Currently features a high-conversion landing page.
- **`components/`**: Houses all React components. Components are organized by feature (e.g., `hero.tsx`, `features.tsx`).
- **`lib/`**: Includes `db.ts` for Neon database connection and `utils.ts` for Tailwind merging.
- **`scripts/`**: Contains SQL migration files like `001-create-tables.sql` for setting up the database schema.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or later
- **npm / pnpm / yarn**
- **Neon Database Account**: For Postgres storage.

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/your-username/task_chain.git
   cd task_chain
   ```

2. **Install dependencies:**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Set up environment variables:**
   Copy `.env.example` to `.env` and fill in your database credentials.

   ```bash
   cp env.example .env
   ```

   Update `.env`:

   ```env
   DATABASE_URL=postgres://user:password@hostname/dbname
   ```

4. **Initialize the database:**
   Run the migration script located in `scripts/001-create-tables.sql` against your Neon database instance.

5. **Run the development server:**

   ```bash
   pnpm dev
   # or
   npm run dev
   ```

6. **Open the browser:**
   Navigate to [http://localhost:3000](http://localhost:3000) to see the application.

---

## 🛣 Roadmap

- [ ] **Phase 1**: Wallet authentication (Stellar/Freighter integration)
- [ ] **Phase 2**: Smart contract escrow integration (Soroban)
- [ ] **Phase 3**: Milestone-based contracts & dashboard
- [ ] **Phase 4**: Dispute resolution logic & DAO governance
- [ ] **Phase 5**: Freelancer profiles & verification system

---

## 🤝 Contributing

We welcome contributions from the community!

1. **Fork** the repository.
2. **Create a branch**: `git checkout -b feature/your-feature-name`.
3. **Commit changes**: `git commit -m 'Add some feature'`.
4. **Push to branch**: `git push origin feature/your-feature-name`.
5. **Open a Pull Request**.

Please ensure your code follows the existing style and includes proper documentation.

---

## 🧪 CI/CD Status

GitHub Actions workflows have been **intentionally removed** from this repository due to instability in the previous CI setup. New commits and pull requests **will not trigger GitHub Actions checks** until a new CI/CD solution is introduced.

- For now, please run **local checks** before opening a PR:
  - `npm run lint`
  - `npm run build`
- Repository administrators should ensure that **no GitHub Actions checks are configured as required** in the repository’s branch protection rules to avoid blocking merges.

Future work may introduce an alternative CI/CD pipeline (e.g., a different provider or a simplified Actions setup) once a stable configuration is defined.

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## 🌟 Support

If you like the vision of TaskChain, **star the repo ⭐** and join us in building the future of secure freelancing.

> **TaskChain — Where Freelancing Meets Trust.**
