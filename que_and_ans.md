# BankFlow: System Design & Technical Q&A

This document serves as a deep dive into the technical architecture of BankFlow and provides a comprehensive list of technical interview questions and answers regarding the project.

---

## PART 1: System Design Overview

BankFlow is a distributed, microservices-based banking platform. The architecture is designed for high availability, consistency (especially for financial data), and scalability.

### 1. Microservices Architecture
The application is split into specialized, bounded-context microservices:
- **API Gateway:** The single entry point for the frontend. Handles routing, rate-limiting, and JWT validation.
- **Auth Service:** Manages user registration, login, and JWT issuance.
- **User Service:** Manages user profiles, roles (Admin, Employee, Customer), and KYC status.
- **Account Service:** Manages bank accounts, balances, account states (Active, Frozen), and transfer limits.
- **Ledger Service:** The source of truth for all money. Implements double-entry accounting.
- **Transaction Service:** Orchestrates the lifecycle of money transfers.
- **Payment Service:** Handles the distributed saga for inter-bank and complex payments.
- **Beneficiary Service:** Manages saved contacts for transfers.
- **Notification Service:** Asynchronous service for sending alerts (email/SMS mock) via message queues.
- **Settlement & Reconciliation Services:** Background workers that process end-of-day batches and audit ledgers.
- **AI Assistant Service:** A RAG (Retrieval-Augmented Generation) pipeline providing a context-aware banking chatbot.

### 2. Database Design (Database-per-Service Pattern)
To ensure loose coupling, BankFlow implements the **Database-per-Service** pattern using PostgreSQL (Neon Serverless). 
- The Ledger Service has its own database to ensure strict ACID compliance for financial records.
- The User Service has its own database.
- *Why?* If the User Service goes down or its database is overwhelmed, the Ledger Service remains completely unaffected, allowing core banking operations to survive.

### 3. Event-Driven Architecture & Sagas
Financial transactions often span multiple services (e.g., Transaction Service -> Account Service -> Ledger Service). 
- We use the **Saga Pattern** (Choreography/Orchestration) to handle distributed transactions.
- We use **Kafka / RabbitMQ** as message brokers. If a step fails (e.g., the recipient account is closed), a compensating transaction is published to reverse the previous steps, ensuring eventual consistency.

### 4. RAG-Based AI Assistant
The AI Assistant is built using a Hybrid Retrieval-Augmented Generation system.
- **Vector DB (Qdrant):** Stores semantic embeddings (using Gemini) of bank documentation.
- **Lexical Search (BM25):** Provides exact-keyword matching.
- **Reciprocal Rank Fusion (RRF) & Reranking:** Combines Vector and BM25 results, then reranks them using Cohere for maximum accuracy.
- **Abstention Guard:** If the retrieved context is below a relevance threshold (e.g., < 0.35), the AI safely refuses to answer instead of hallucinating.

### 5. Tech Stack Summary
- **Backend:** Node.js, Express, TypeScript, Prisma ORM
- **Frontend:** React, TypeScript, Vite, Vanilla CSS (Glassmorphism design)
- **Databases:** PostgreSQL (Neon), Redis (Caching/Rate-limiting/Session history), Qdrant (Vector DB)
- **AI Models:** Gemini 1.5 Flash (Generation/Embeddings), Cohere (Reranking)

---

## PART 2: Technical Questions & Answers

### Q1: How do you prevent double-spending or race conditions in BankFlow?
**Answer:** We use database-level concurrency controls in the Ledger and Account services. Specifically, we use **Optimistic Concurrency Control (OCC)** using a `version` column, or **Pessimistic Locking** (`SELECT ... FOR UPDATE`) when debiting an account. This ensures that if two simultaneous requests try to withdraw money, the database locks the row for the first request, processes it, and then the second request sees the updated balance.

### Q2: What is Double-Entry Accounting and how is it implemented?
**Answer:** Double-entry accounting requires that every financial transaction has at least two equal and opposite ledger entries (a Debit and a Credit). In BankFlow, the `LedgerEntry` table records these. If Alice sends $50 to Bob, the transaction creates two entries within a single ACID database transaction: a Debit of $50 to Alice's ledger account, and a Credit of $50 to Bob's ledger account. The sum of all entries for a transaction must always equal zero.

### Q3: How do you handle a transaction that fails halfway through across different microservices?
**Answer:** We implement the **Saga Pattern**. Because we use a database-per-service, we cannot use traditional database ACID transactions across services. Instead, if a transaction spans the Transaction Service and the Ledger Service, and the Ledger step fails, the Ledger Service emits a `LedgerUpdateFailed` event to our message broker. The Transaction Service listens for this event and executes a **Compensating Transaction** to mark the transaction as `FAILED` and release any holds on the user's account.

### Q4: Why did you choose the Database-per-Service pattern? What are its drawbacks?
**Answer:** We chose it to achieve true microservice autonomy and fault isolation. The Ledger team can scale or migrate their database without affecting the Auth team. However, the drawbacks are operational complexity, the lack of foreign keys across services, and the necessity to use complex patterns like Sagas for distributed transactions instead of simple SQL JOINs.

### Q5: How is authentication and authorization handled?
**Answer:** We use stateless **JWT (JSON Web Tokens)**. When a user logs in, the Auth Service issues an Access Token containing their `userId` and `role` (e.g., CUSTOMER, EMPLOYEE). The API Gateway intercepts all incoming requests, validates the JWT signature, and forwards the request to the downstream microservices. Downstream services check the `role` to authorize specific actions (e.g., only an `ADMIN` can update transfer limits).

### Q6: Explain the Hybrid RAG pipeline used in the AI Assistant.
**Answer:** The AI pipeline doesn't just rely on standard vector search. 
1. **Query Rewriting:** The LLM expands the user's query for better recall.
2. **Parallel Retrieval:** It searches both a Vector DB (Qdrant) for semantic meaning and a BM25 index for exact keyword matches.
3. **Fusion & Reranking:** It merges the results using Reciprocal Rank Fusion (RRF) and sends them to a Reranker (Cohere) to bring the most relevant chunks to the top.
4. **Context Injection:** The top chunks are formatted as citations (`[SOURCE N]`) and injected into the LLM prompt.

### Q7: How does the AI Assistant prevent hallucination for financial actions?
**Answer:** Two ways:
1. **Abstention Guard:** We calculate the relevance score of the retrieved chunks. If the maximum score is below a threshold (0.35), the system intercepts the request *before* hitting the LLM and returns a hardcoded "I don't have enough information" response.
2. **System Prompting:** We use a Query Router. If a query is classified as a `FINANCIAL_ACTION` (e.g., "Transfer $500 to Bob"), the router bypasses retrieval and returns a strict refusal, stating the AI cannot execute financial transactions.

### Q8: What role does Redis play in your architecture?
**Answer:** Redis serves three main purposes in BankFlow:
1. **Rate Limiting:** The API Gateway uses Redis to track request counts and apply sliding-window rate limits to prevent DDoS and brute-force login attempts.
2. **AI Conversation Memory:** The AI Assistant stores rolling conversation history in Redis with a TTL (Time-To-Live), allowing multi-turn conversations without overloading the database.
3. **Caching:** Used for fast retrieval of static or slowly changing configuration data.

### Q9: How did you implement the UI styling without relying on heavy frameworks like Tailwind?
**Answer:** We used standard Vanilla CSS utilizing a modern **Glassmorphism** design system. We leveraged CSS Variables (Custom Properties) for a consistent color palette (deep indigos and violets) and spacing. We used standard flexbox and CSS Grid for layouts, and implemented micro-animations (`@keyframes`) for a dynamic, premium user experience. This keeps the bundle size small and provides total control over the exact aesthetic.

### Q10: How does BankFlow ensure passwords and API keys are secure?
**Answer:** 
- **Passwords** are never stored in plain text. They are hashed using `bcrypt` with a unique salt before being saved to the database.
- **API Keys** (Gemini, Cohere) and Database URLs are strictly stored in `.env` files which are never committed to version control. Services read these via `process.env`.
- Configuration modules ensure that if a critical key is missing at startup, the service gracefully falls back (e.g., demo mode) or fails fast.
